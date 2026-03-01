// v2-chat-service Edge Function v3 — unified entry point for all Nest messages.
//
// Handles both:
//   1. App path (JWT auth) — previously v2-chat
//   2. iMessage path (service key, user_id in payload) — bridge path
//
// v3 changes:
//   - Replaced runPersonalityAgent(15 params) with handleMessage(message, chat, ctx)
//   - Eliminated server-side RAG phases — v3 orchestrator does prefetch + agent calls tools
//   - Eliminated routeQuery/INTENT_CONTEXTS — v3 orchestrator routes internally
//   - Eliminated model selection — orchestrator picks static/casual/agent automatically
//   - Context loading simplified: just chat history + memory + user profile
//   - PDL enrichment preserved (first-message welcome context)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleMessage, type NestContext } from "../_shared/personality-agent.ts";
import { routeMessage, type NestUser } from "../_shared/orchestrator.ts";
import { getUserMemory, updateMemory, extractLearnings } from "../_shared/memory-service.ts";
import { enrichByIdentity, enrichByPhone, profileToContext } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";
import { serverSideRAG } from "../_shared/server-rag.ts";
import { getGoogleAccessToken, fetchCalendarTimezone } from "../_shared/gmail-helpers.ts";
import { resolveTimezone, TimezoneHolder } from "../_shared/timezone-resolver.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

// ── Config ───────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Entry Point ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // ── Parse payload ──────────────────────────────────────────

  let payload: {
    user_id?: string;
    message: string;
    user_name?: string;
    is_group?: boolean;
    group_context?: Array<{ role: string; content: string; name?: string }>;
    sender_phone?: string;
    chat_guid?: string;
    is_chime_in?: boolean;
    _qa_variation?: string;
    /** Client-provided IANA timezone (e.g. "Asia/Tokyo"). Takes priority over DB timezone. */
    timezone?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  // ── Resolve user identity ──────────────────────────────────

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string;
  let isAppPath = false;

  if (jwt && !payload.user_id) {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
    if (authError || !user) {
      console.error("[chat] Invalid JWT", authError?.message ?? "unknown");
      return jsonResponse({ error: "unauthorised" }, 401);
    }
    userId = user.id;
    isAppPath = true;
  } else if (payload.user_id) {
    userId = payload.user_id;
  } else {
    return jsonResponse({ error: "missing_user_id", detail: "Provide JWT or user_id" }, 400);
  }

  const { message, user_name } = payload;
  const isGroup = !!payload.is_group;

  if (!message || typeof message !== "string") {
    return jsonResponse({ error: "missing_message", detail: "'message' field is required" }, 400);
  }

  const source = isAppPath ? "app" : isGroup ? "group" : "imessage";
  console.log(`[chat] [${source}] User ${userId}: "${message.slice(0, 100)}"`);

  try {
    const t0 = Date.now();

    // ── Phase 1: Load context ────────────────────────────────
    // Group chats: NO private data. Only load minimal chat history
    // (group-scoped, no memory/profile/learnings/accounts/RAG).

    let recentChat: Array<{ role: string; content: string; created_at?: string }>;
    let userMemory: any = null;
    let richProfile: any = null;
    let userLearnings: any[] = [];
    let pdlWelcomeContext: string | undefined;
    let connectedAccounts: Array<{ email: string; isPrimary: boolean; provider: "google" | "microsoft" }> = [];
    let userTimezone = "Australia/Sydney";
    let locationCity: string | undefined;
    let totalMessageCountResult: any = { count: 0 };
    let userProfile: { name: string | null; email: string | null; phone: string | null } = { name: null, email: null, phone: null };
    let dailyBriefingData: any = null;
    let activeCommitmentsData: any = null;
    let testingPromptEnabled = false;

    // Group-specific enrichment context (populated below if isGroup)
    let groupParticipantProfiles: string | undefined;
    let groupVibe: string | undefined;
    let senderProfile: string | undefined;
    let isFirstGroupInteraction = false;

    if (isGroup) {
      // Group mode: load persisted history from DB, supplement with bridge buffer
      const chatGuidForHistory = payload.chat_guid;
      const groupCtx = payload.group_context ?? [];

      if (chatGuidForHistory) {
        // Load last 40 messages from DB for this group
        const { data: dbMessages } = await supabaseAdmin
          .from("v2_chat_messages")
          .select("role, content, sender_name, created_at")
          .eq("chat_guid", chatGuidForHistory)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: false })
          .limit(40);

        if (dbMessages && dbMessages.length > 0) {
          // DB messages are newest-first, reverse to chronological
          recentChat = dbMessages.reverse().map((m: any) => ({
            role: m.role,
            content: m.role === "user" && m.sender_name
              ? `[${m.sender_name}]: ${m.content}`
              : m.content,
            created_at: m.created_at,
          }));
        } else {
          // No DB history yet, use bridge buffer
          recentChat = groupCtx.map((m: any) => {
            if (m.role === "user" && m.name) {
              return { role: m.role, content: `[${m.name}]: ${m.content}` };
            }
            return { role: m.role, content: m.content };
          });
        }
      } else {
        // No chat_guid, fall back to bridge buffer
        recentChat = groupCtx.map((m: any) => {
          if (m.role === "user" && m.name) {
            return { role: m.role, content: `[${m.name}]: ${m.content}` };
          }
          return { role: m.role, content: m.content };
        });
      }

      // ── Persist bridge buffer messages we don't have in DB yet ──
      // This catches messages between Nest's responses (e.g. group banter)
      if (chatGuidForHistory && groupCtx.length > 0) {
        const dbCount = recentChat.length;
        // If bridge has more messages than DB, the extras are unbuffered context
        // Bulk-insert them (fire-and-forget, best-effort)
        if (groupCtx.length > dbCount || dbCount === 0) {
          const toStore = groupCtx.slice(0, -1); // Exclude current message (stored separately)
          if (toStore.length > 0) {
            const rows = toStore
              .filter((m: any) => m.content && m.content.trim())
              .map((m: any) => ({
                user_id: userId,
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
                source: "group",
                chat_guid: chatGuidForHistory,
                sender_name: m.name ?? (m.role === "assistant" ? "Nest" : null),
              }));
            if (rows.length > 0) {
              supabaseAdmin.from("v2_chat_messages").insert(rows)
                .then(() => console.log(`[chat] Bulk-persisted ${rows.length} group context messages`))
                .catch(() => {});
            }
          }
        }
      }

      // ── Load group enrichment context ──────────────────────
      const senderPhone = payload.sender_phone;
      const chatGuid = payload.chat_guid;

      if (chatGuid) {
        try {
          const { data: groupChat } = await supabaseAdmin
            .from("group_chats")
            .select("id, group_vibe")
            .eq("chat_guid", chatGuid)
            .maybeSingle();

          if (groupChat) {
            groupVibe = (groupChat.group_vibe as string) || undefined;

            // Load participant profiles
            const { data: members } = await supabaseAdmin
              .from("group_chat_members")
              .select("prospect_id")
              .eq("group_chat_id", groupChat.id)
              .limit(30);

            if (members && members.length > 0) {
              const prospectIds = members.map((m: any) => m.prospect_id);
              const { data: prospects } = await supabaseAdmin
                .from("group_prospects")
                .select("phone_number, display_name, pdl_profile, pdl_enrichment_status")
                .in("id", prospectIds);

              if (prospects && prospects.length > 0) {
                const profileLines: string[] = [];
                for (const p of prospects) {
                  const pdl = p.pdl_profile as Record<string, any> | null;
                  if (!pdl) continue;
                  const name = pdl.full_name ?? p.display_name ?? p.phone_number;
                  const title = pdl.job_title ? `${pdl.job_title}` : "";
                  const company = pdl.job_company_name ? ` @ ${pdl.job_company_name}` : "";
                  const loc = pdl.location_name ?? "";
                  profileLines.push(`- ${name}: ${title}${company}${loc ? ` (${loc})` : ""}`);

                  // Check if this is the current sender
                  if (senderPhone && p.phone_number === senderPhone && pdl.job_title) {
                    senderProfile = profileToContext(pdl as PDLProfile);
                  }
                }
                if (profileLines.length > 0) {
                  groupParticipantProfiles = profileLines.join("\n");
                }
              }
            }
          }
        } catch (e) {
          console.warn("[chat] Group context loading failed (non-blocking):", e);
        }
      }

      // Check first interaction + on-demand PDL enrichment for sender
      if (senderPhone) {
        try {
          const { data: prospect } = await supabaseAdmin
            .from("group_prospects")
            .select("id, first_interaction_at, interaction_count, pdl_enrichment_status, pdl_profile")
            .eq("phone_number", senderPhone)
            .maybeSingle();

          // On-demand PDL enrichment: only enrich when they actually engage Nest
          if (prospect && prospect.pdl_enrichment_status === "pending") {
            // Fire-and-forget enrichment
            (async () => {
              try {
                await supabaseAdmin.from("group_prospects")
                  .update({ pdl_enrichment_status: "enriching", updated_at: new Date().toISOString() })
                  .eq("id", prospect.id);

                const profile = await enrichByPhone(senderPhone);
                if (profile) {
                  await supabaseAdmin.from("group_prospects").update({
                    pdl_profile: profile as unknown as Record<string, unknown>,
                    pdl_enrichment_status: "success",
                    pdl_enriched_at: new Date().toISOString(),
                    display_name: profile.full_name ?? null,
                    updated_at: new Date().toISOString(),
                  }).eq("id", prospect.id);
                  console.log(`[chat] On-demand PDL: ${profile.full_name} | ${profile.job_title} @ ${profile.job_company_name}`);
                  // Make profile available for THIS request if enrichment was fast
                  if (profile.job_title) {
                    senderProfile = profileToContext(profile);
                    isFirstGroupInteraction = true;
                  }
                } else {
                  await supabaseAdmin.from("group_prospects").update({
                    pdl_enrichment_status: "not_found",
                    pdl_enriched_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  }).eq("id", prospect.id);
                }
              } catch (e) {
                console.warn("[chat] On-demand PDL enrichment failed:", e);
                await supabaseAdmin.from("group_prospects").update({
                  pdl_enrichment_status: "error", updated_at: new Date().toISOString(),
                }).eq("id", prospect.id).catch(() => {});
              }
            })();
          } else if (prospect?.pdl_profile && !senderProfile) {
            // Already enriched — use cached profile
            const pdl = prospect.pdl_profile as Record<string, any>;
            if (pdl.job_title) {
              senderProfile = profileToContext(pdl as PDLProfile);
            }
          }

          if (prospect && !prospect.first_interaction_at) {
            isFirstGroupInteraction = true;
            // Mark first interaction (fire-and-forget)
            supabaseAdmin
              .from("group_prospects")
              .update({
                first_interaction_at: new Date().toISOString(),
                interaction_count: (prospect.interaction_count ?? 0) + 1,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("phone_number", senderPhone)
              .then(() => {})
              .catch(() => {});
          } else if (prospect) {
            // Increment interaction count (fire-and-forget)
            supabaseAdmin
              .from("group_prospects")
              .update({
                interaction_count: (prospect.interaction_count ?? 0) + 1,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("phone_number", senderPhone)
              .then(() => {})
              .catch(() => {});
          }
        } catch (e) {
          console.warn("[chat] First interaction check failed (non-blocking):", e);
        }
      }

      // Detect group vibe from recent messages
      if (!groupVibe || groupVibe === "mixed") {
        groupVibe = detectGroupVibe(groupCtx) || "mixed";
        // Persist detected vibe (fire-and-forget)
        if (chatGuid && groupVibe !== "mixed") {
          supabaseAdmin
            .from("group_chats")
            .update({ group_vibe: groupVibe, updated_at: new Date().toISOString() })
            .eq("chat_guid", chatGuid)
            .then(() => {})
            .catch(() => {});
        }
      }

      console.log(
        `[chat] Group mode: ${recentChat.length} msgs, ` +
        `${groupParticipantProfiles ? groupParticipantProfiles.split("\n").length : 0} profiles, ` +
        `vibe=${groupVibe || "unknown"}, firstInteraction=${isFirstGroupInteraction}`,
      );
    } else {
      // 1:1 mode: full private context
      // Pre-fetch timezone so "today" is computed in the user's local time, not UTC
      const { data: _tzRow } = await supabaseAdmin
        .from("user_google_accounts")
        .select("timezone")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .maybeSingle();
      const _prefetchTz = (_tzRow?.timezone as string) || "Australia/Sydney";
      const today = new Date().toLocaleDateString("en-CA", { timeZone: _prefetchTz });
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: _prefetchTz });

      const [recentChatResult, _userMemory, _userProfile, _richProfile, imsgUserRow, linkedAccountsResult, linkedMicrosoftAccountsResult, userLearningsResult, _totalMessageCountResult, _briefingResult, _commitmentsResult] = await Promise.all([
        supabaseAdmin
          .from("v2_chat_messages")
          .select("role, content, created_at")
          .eq("user_id", userId)
          .in("role", ["user", "assistant"])
          .order("created_at", { ascending: false })
          .limit(isAppPath ? 50 : 20),
        getUserMemory(userId, supabaseAdmin),
        loadUserProfile(userId),
        loadRichProfile(userId),
        supabaseAdmin
          .from("imessage_users")
          .select("onboard_messages, testing")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("user_google_accounts")
          .select("google_email, is_primary, timezone")
          .eq("user_id", userId)
          .order("is_primary", { ascending: false }),
        supabaseAdmin
          .from("user_microsoft_accounts")
          .select("microsoft_email, is_primary")
          .eq("user_id", userId)
          .order("is_primary", { ascending: false }),
        supabaseAdmin
          .from("v2_user_learnings")
          .select("category, content, confidence, times_reinforced, last_observed_at, emotional_weight")
          .eq("user_id", userId)
          .eq("active", true)
          .gte("confidence", 0.5)
          .order("last_observed_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("v2_chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabaseAdmin
          .from("v2_daily_briefing")
          .select("briefing")
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("v2_user_learnings")
          .select("content, target_date, expires_after, context")
          .eq("user_id", userId)
          .eq("category", "commitment")
          .eq("active", true)
          .or(`and(target_date.gte.${today},target_date.lte.${nextWeek}),target_date.is.null`)
          .order("target_date", { ascending: true, nullsFirst: false })
          .limit(15),
      ]);

      recentChat = (recentChatResult.data ?? [])
        .filter((m: any) => m.content && m.content.trim().length > 0)
        .reverse();

      userMemory = _userMemory;
      userProfile = _userProfile;
      richProfile = _richProfile;
      testingPromptEnabled = !!imsgUserRow?.data?.testing;
      totalMessageCountResult = _totalMessageCountResult;
      dailyBriefingData = _briefingResult;
      activeCommitmentsData = _commitmentsResult;

      // Seed onboarding history for new iMessage users
      if (!isAppPath && recentChat.length < 6) {
        try {
          const onboardMessages = imsgUserRow?.data?.onboard_messages as Array<{ role: string; content: string }> | null;
          if (onboardMessages && onboardMessages.length > 0) {
            const onboardChat = onboardMessages
              .filter((m: any) => m.content && m.content.trim().length > 0)
              .map((m: any) => ({ role: m.role, content: m.content, created_at: undefined }));
            recentChat = [...onboardChat, ...recentChat];
            console.log(`[chat] Seeded ${onboardChat.length} onboarding messages`);
          }
        } catch (e) {
          console.error("[chat] Onboarding seed failed (non-blocking):", e);
        }
      }

      // PDL enrichment (first real message, iMessage only)
      if (!isAppPath) {
        pdlWelcomeContext = await tryPdlEnrichment(userId, user_name);
      }

      // Linked accounts + timezone (Google + Microsoft)
      const googleAccounts = linkedAccountsResult.data ?? [];
      const microsoftAccounts = linkedMicrosoftAccountsResult.data ?? [];
      if (linkedMicrosoftAccountsResult.error) {
        console.warn("[chat] Microsoft accounts query failed (non-blocking):", linkedMicrosoftAccountsResult.error.message);
      }
      connectedAccounts = [
        ...googleAccounts.map((a: any) => ({
          email: a.google_email as string,
          isPrimary: !!a.is_primary,
          provider: "google" as const,
        })),
        ...microsoftAccounts.map((a: any) => ({
          email: a.microsoft_email as string,
          isPrimary: !!a.is_primary,
          provider: "microsoft" as const,
        })),
      ];
      console.log(`[chat] Connected accounts: ${connectedAccounts.length} total (${googleAccounts.length} Google, ${microsoftAccounts.length} Microsoft)`);
      const accounts = googleAccounts;

      const primaryAccount = accounts.find((a: any) => a.is_primary) ?? accounts[0];
      let dbTimezone = (primaryAccount?.timezone as string) ?? "Australia/Sydney";

      // Backfill from Google Calendar if missing in DB
      if (!primaryAccount?.timezone && primaryAccount) {
        try {
          const accessToken = await getGoogleAccessToken(supabaseAdmin, userId);
          const tz = await fetchCalendarTimezone(accessToken);
          if (tz) {
            dbTimezone = tz;
            supabaseAdmin.from("user_google_accounts")
              .update({ timezone: tz })
              .eq("user_id", userId)
              .eq("is_primary", true)
              .then(() => console.log(`[chat] Backfilled timezone ${tz} for ${userId}`))
              .catch(() => {});
          }
        } catch (e) {
          console.warn("[chat] Timezone backfill failed:", (e as Error).message);
        }
      }

      locationCity = richProfile
        ? ((richProfile as any).identity?.location as string | undefined) ?? undefined
        : undefined;

      userLearnings = (userLearningsResult.data ?? []).map((l: any) => ({
        category: l.category as string,
        content: l.content as string,
        confidence: l.confidence as number,
        timesReinforced: l.times_reinforced as number,
        emotionalWeight: (l.emotional_weight as string) ?? "medium",
      }));

      // ── Three-layer timezone resolution ──
      // Priority: 1) client payload  2) context inference  3) database
      const tzResult = await resolveTimezone({
        dbTimezone,
        clientTimezone: payload.timezone,
        recentMessages: [...recentChat, { role: "user", content: message }],
        learnings: userLearnings,
        userId,
        supabase: supabaseAdmin,
      });
      userTimezone = tzResult.timezone;
      if (tzResult.changed) {
        console.log(`[chat] Timezone resolved: ${tzResult.timezone} (source: ${tzResult.source}, was: ${dbTimezone})`);
      }

      console.log(`[chat] Rich profile loaded: ${richProfile ? `v${(richProfile as any).version ?? 1}, ${((richProfile as any).summary ?? "").length}c summary` : "NONE"}`);
    }

    const contextMs = Date.now() - t0;

    // ── Phase 2: Save user message ───────────────────────────

    if (isGroup) {
      // Store group message with chat_guid and sender info (fire-and-forget)
      const chatGuidForSave = payload.chat_guid;
      if (chatGuidForSave) {
        supabaseAdmin.from("v2_chat_messages").insert({
          user_id: userId,
          role: "user",
          content: message,
          source: "group",
          chat_guid: chatGuidForSave,
          sender_name: user_name ?? null,
        }).then(() => {}).catch(() => {});
      }
    } else {
      await supabaseAdmin.from("v2_chat_messages").insert({
        user_id: userId,
        role: "user",
        content: message,
      });

      // Universal learning extraction: extract facts, plans, preferences, people, etc. (fire-and-forget)
      extractLearnings(message, userId, supabaseAdmin).catch((e: unknown) =>
        console.error("[chat] Learning extraction failed (non-blocking):", e),
      );
    }

    const t1 = Date.now();

    const nestUser: NestUser = {
      name: isGroup ? (user_name ?? "someone") : (userProfile.name ?? user_name ?? "there"),
      email: isGroup ? "" : (userProfile.email ?? ""),
      phone: isGroup ? "" : (userProfile.phone ?? ""),
      timezone: userTimezone,
      locationCity: isGroup ? undefined : locationCity,
      connectedAccounts: isGroup ? undefined : (connectedAccounts.length > 0 ? connectedAccounts : undefined),
      isGroup,
      testing: isGroup ? false : testingPromptEnabled,
      // Group chat enrichment
      groupParticipantProfiles: isGroup ? groupParticipantProfiles : undefined,
      groupVibe: isGroup ? groupVibe : undefined,
      senderProfile: isGroup ? senderProfile : undefined,
      isFirstGroupInteraction: isGroup ? isFirstGroupInteraction : undefined,
      senderPhone: isGroup ? payload.sender_phone : undefined,
      isChimeIn: isGroup ? !!payload.is_chime_in : undefined,
    };

    const realMessageCount = isGroup ? 0 : (recentChat.length);
    const profileIsNew = !isGroup && !!richProfile && realMessageCount < 16;

    // ── Group-to-private transition detection ─────────────────
    // If a user messages 1:1 for the first time AND was seen in a group chat,
    // inject a one-time transition acknowledgment.
    let groupTransition = false;
    if (!isGroup && !isAppPath && realMessageCount < 3) {
      try {
        const { data: imsgUser } = await supabaseAdmin
          .from("imessage_users")
          .select("phone_number")
          .eq("user_id", userId)
          .maybeSingle();

        if (imsgUser?.phone_number) {
          const { data: prospect } = await supabaseAdmin
            .from("group_prospects")
            .select("interaction_count")
            .eq("phone_number", imsgUser.phone_number)
            .maybeSingle();

          if (prospect && (prospect.interaction_count ?? 0) > 0) {
            groupTransition = true;
            console.log(`[chat] Group-to-private transition detected for ${userId}`);
          }
        }
      } catch (e) {
        console.warn("[chat] Group transition check failed (non-blocking):", e);
      }
    }

    // Parse active commitments for situational context
    const activeCommitments = !isGroup && activeCommitmentsData?.data
      ? (activeCommitmentsData.data as any[]).map((c: any) => ({
          content: c.content as string,
          targetDate: c.target_date as string,
          expiresAfter: (c.expires_after as string) ?? null,
          context: (c.context as string) ?? null,
        }))
      : null;

    // Mutable timezone holder — allows update_user_timezone to take effect mid-request
    const timezoneHolder = new TimezoneHolder(userTimezone, (newTz) => {
      // When timezone changes mid-request, update the NestUser so subsequent
      // system prompt rebuilds (if any) reflect the new timezone.
      nestUser.timezone = newTz;
    });

    const ctx: NestContext = {
      userId,
      user: nestUser,
      supabase: supabaseAdmin,
      memory: isGroup ? null : (userMemory ?? null),
      pdlWelcomeContext: isGroup ? undefined : pdlWelcomeContext,
      userProfile: isGroup ? null : richProfile,
      profileIsNew: isGroup ? false : profileIsNew,
      learnings: isGroup ? null : (userLearnings.length > 0 ? userLearnings : null),
      dailyBriefing: isGroup ? null : (dailyBriefingData?.data?.briefing as string ?? null),
      activeCommitments: isGroup ? null : (activeCommitments && activeCommitments.length > 0 ? activeCommitments : null),
      recallPitchStatus: isGroup ? null : (userMemory?.recallPitchStatus ?? null),
      timezoneHolder,
      groupTransition: groupTransition || undefined,
      ...(payload._qa_variation ? { _qa_variation: payload._qa_variation } : {}),
    };

    // ── Phase 2b: Route check + streaming ack ─────────────────
    // Quick synchronous route to determine if tools will be used.
    // If agent path AND iMessage source, stream an ack first via NDJSON.

    const quickRoute = routeMessage(message, nestUser, recentChat);
    const needsAck = !isAppPath && quickRoute.path === "agent";

    if (needsAck) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const ragPromise = serverSideRAG(message, recentChat, userId, supabaseAdmin)
              .catch((e: unknown) => {
                console.warn("[chat] Proactive RAG failed (non-blocking):", e);
                return "";
              });

            const response = await handleMessage(message, recentChat, ctx, {
              ragPromise,
              onAck: (ackText: string) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "ack", text: ackText }) + "\n"));
              },
            });
            const agentMs = Date.now() - t1;

            // Combine ack + response for saved history so the conversation flows naturally
            const fullText = response.ackText
              ? `${response.ackText}\n${response.text}`
              : response.text;

            let savedContent = fullText;
            if (response.pendingActions.length > 0) {
              const meta = response.pendingActions
                .map((a: any) => `<pending_action type="${a.type}">${JSON.stringify(a.data)}</pending_action>`)
                .join("\n");
              savedContent = `${fullText}\n\n${meta}`;
            }

            let responseId: string | null = null;
            if (isGroup) {
              // Group: persist with chat_guid (fire-and-forget)
              const chatGuidStream = payload.chat_guid;
              if (chatGuidStream) {
                supabaseAdmin.from("v2_chat_messages").insert({
                  user_id: userId, role: "assistant", content: response.text,
                  source: "group", chat_guid: chatGuidStream, sender_name: "Nest",
                }).then(() => {}).catch(() => {});
              }
            } else {
              const { data: insertedRow } = await supabaseAdmin
                .from("v2_chat_messages")
                .insert({ user_id: userId, role: "assistant", content: savedContent })
                .select("id")
                .single();
              responseId = insertedRow?.id ?? null;
            }
            const totalMs = Date.now() - t0;

            console.log(
              `[chat] ✓ [${source}] ${response.path} | ` +
              `tools=[${response.toolsUsed.join(",")}] | ` +
              `${response.text.length} chars (id=${responseId}) ` +
              (response.ackText ? `[ack=${response.ackText.length}c] ` : "") +
              `[ctx=${contextMs}ms agent=${agentMs}ms total=${totalMs}ms]`,
            );

            const _debug = {
              source,
              path: response.path,
              tools_used: response.toolsUsed,
              timing: { context_ms: contextMs, agent_ms: agentMs, total_ms: totalMs, orchestrator_latency_ms: response.latencyMs },
            };

            controller.enqueue(encoder.encode(JSON.stringify({
              type: "response",
              response: response.text,
              response_id: responseId,
              ...(response.reaction ? { reaction: response.reaction } : {}),
              _debug,
            }) + "\n"));

            // Fire-and-forget: persist debug trace
            if (response._trace) {
              const tracePayload = {
                ...response._trace,
                request: { message, user_id: userId, user_name: nestUser.name, source, timestamp: new Date(t0).toISOString() },
                context: {
                  recent_chat_count: recentChat.length,
                  memory_summary: userMemory?.summary?.slice(0, 500) ?? null,
                  memory_writing_style: userMemory?.writingStyle ?? null,
                  memory_emotional_arc: userMemory?.emotionalArc ?? null,
                  memory_relationship_notes: userMemory?.relationshipNotes ?? null,
                  identity_model: userMemory?.identityModel ?? null,
                  learnings_count: userLearnings.length,
                  learnings: userLearnings,
                  daily_briefing: dailyBriefingData?.data?.briefing ?? null,
                  active_commitments: activeCommitments,
                  user_timezone: userTimezone,
                  total_message_count: totalMessageCountResult.count ?? 0,
                },
                timing: { ...((response._trace as any).timing ?? {}), context_ms: contextMs, agent_ms: agentMs, total_ms: totalMs },
              };
              supabaseAdmin.from("v2_debug_logs").insert({
                user_id: userId, source, route_path: response.path,
                model: (tracePayload as any).routing?.model ?? null,
                user_message: message, trace: tracePayload,
              }).then(() => {}).catch((e: unknown) => console.error("[debug] Trace write failed:", e));
            }

            const totalMessages = (totalMessageCountResult.count ?? recentChat.length ?? 0) + 2;
            updateMemory(
              userId, totalMessages,
              [...recentChat, { role: "user", content: message }, { role: "assistant", content: fullText }],
              supabaseAdmin,
            ).catch((e: unknown) => console.error("[chat] Memory update failed:", e));

            const nowIso = new Date().toISOString();
            (async () => {
              const { data: imsgRow } = await supabaseAdmin
                .from("imessage_users").select("phone_number").eq("user_id", userId).maybeSingle();
              await appendToConversation(supabaseAdmin, [
                { role: "user", content: message, ts: nowIso },
                { role: "assistant", content: fullText, ts: new Date().toISOString() },
              ], { userId, phoneNumber: imsgRow?.phone_number ?? undefined });
            })().catch((e: unknown) => console.error("[chat] Conversation store failed:", e));

            controller.close();
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "unknown";
            console.error("[chat] Stream error:", errMsg);
            controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: errMsg }) + "\n"));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Transfer-Encoding": "chunked" },
      });
    }

    // ── Non-streaming path (app requests, static/casual routes) ──

    // RAG runs in parallel with prefetch inside handleMessage
    const ragPromise =
      !isGroup && quickRoute.path === "agent"
        ? serverSideRAG(message, recentChat, userId, supabaseAdmin).catch((e: unknown) => {
            console.warn("[chat] Proactive RAG failed (non-blocking):", e);
            return "";
          })
        : undefined;

    const response = await handleMessage(
      message,
      recentChat,
      ctx,
      ragPromise ? { ragPromise } : undefined,
    );

    const agentMs = Date.now() - t1;

    let responseId: string | null = null;

    if (isGroup) {
      // Persist Nest's response for group chat history
      const chatGuidForSave = payload.chat_guid;
      if (chatGuidForSave) {
        supabaseAdmin.from("v2_chat_messages").insert({
          user_id: userId,
          role: "assistant",
          content: response.text,
          source: "group",
          chat_guid: chatGuidForSave,
          sender_name: "Nest",
        }).then(() => {}).catch(() => {});
      }
    } else {
      let savedContent = response.text;
      if (response.pendingActions.length > 0) {
        const meta = response.pendingActions
          .map((a) => `<pending_action type="${a.type}">${JSON.stringify(a.data)}</pending_action>`)
          .join("\n");
        savedContent = `${response.text}\n\n${meta}`;
      }

      const { data: insertedRow } = await supabaseAdmin
        .from("v2_chat_messages")
        .insert({
          user_id: userId,
          role: "assistant",
          content: savedContent,
        })
        .select("id")
        .single();

      responseId = insertedRow?.id ?? null;
    }

    const totalMs = Date.now() - t0;

    console.log(
      `[chat] ✓ [${source}] ${response.path} | ` +
      `tools=[${response.toolsUsed.join(",")}] | ` +
      `${response.text.length} chars (id=${responseId}) ` +
      `[ctx=${contextMs}ms agent=${agentMs}ms total=${totalMs}ms]`,
    );

    const _debug = {
      source,
      path: response.path,
      tools_used: response.toolsUsed,
      timing: {
        context_ms: contextMs,
        agent_ms: agentMs,
        total_ms: totalMs,
        orchestrator_latency_ms: response.latencyMs,
      },
    };

    // Fire-and-forget: persist debug trace
    if (response._trace) {
      const tracePayload = {
        ...response._trace,
        request: { message, user_id: userId, user_name: nestUser.name, source, timestamp: new Date(t0).toISOString() },
        context: {
          recent_chat_count: recentChat.length,
          memory_summary: userMemory?.summary?.slice(0, 500) ?? null,
          memory_writing_style: userMemory?.writingStyle ?? null,
          memory_emotional_arc: userMemory?.emotionalArc ?? null,
          memory_relationship_notes: userMemory?.relationshipNotes ?? null,
          identity_model: userMemory?.identityModel ?? null,
          learnings_count: userLearnings.length,
          learnings: userLearnings,
          daily_briefing: dailyBriefingData?.data?.briefing ?? null,
          active_commitments: activeCommitmentsData?.data ?? null,
          user_timezone: userTimezone,
          total_message_count: totalMessageCountResult.count ?? 0,
        },
        timing: { ...((response._trace as any).timing ?? {}), context_ms: contextMs, agent_ms: agentMs, total_ms: totalMs },
      };
      supabaseAdmin.from("v2_debug_logs").insert({
        user_id: userId, source, route_path: response.path,
        model: (tracePayload as any).routing?.model ?? null,
        user_message: message, trace: tracePayload,
      }).then(() => {}).catch((e: unknown) => console.error("[debug] Trace write failed:", e));
    }

    // Background tasks — skip for group chats (no private data persistence)
    if (!isGroup) {
      const totalMessages = (totalMessageCountResult.count ?? 0) + 2;
      updateMemory(
        userId,
        totalMessages,
        [...recentChat, { role: "user", content: message }, { role: "assistant", content: response.text }],
        supabaseAdmin,
      ).catch((e: unknown) => console.error("[chat] Memory update failed:", e));

      if (!isAppPath) {
        const nowIso = new Date().toISOString();
        const responseText = response.text;
        (async () => {
          const { data: imsgRow } = await supabaseAdmin
            .from("imessage_users")
            .select("phone_number")
            .eq("user_id", userId)
            .maybeSingle();

          await appendToConversation(supabaseAdmin, [
            { role: "user", content: message, ts: nowIso },
            { role: "assistant", content: responseText, ts: new Date().toISOString() },
          ], { userId, phoneNumber: imsgRow?.phone_number ?? undefined });
        })().catch((e: unknown) => console.error("[chat] Conversation store failed:", e));
      }
    }

    return jsonResponse({
      response: response.text,
      response_id: responseId,
      ...(response.reaction ? { reaction: response.reaction } : {}),
      _debug,
    }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[chat] Error:", msg);

    // Google auth errors → user-friendly message
    if (
      msg.includes("GOOGLE_REAUTH_REQUIRED") ||
      msg.includes("invalid_grant") ||
      msg.includes("Google token refresh failed")
    ) {
      return jsonResponse({
        response:
          "Your Google account needs to be reconnected before I can access calendar or email. " +
          "Open the app, go to Settings > Accounts, then reconnect Google and try again.",
        response_id: null,
      }, 200);
    }

    // Rate limits → friendly retry message
    if (msg.includes("429") || msg.includes("rate_limit") || msg.includes("rate limit")) {
      return jsonResponse({
        response: "Give me a sec, I'm a bit overwhelmed right now. Try again in a moment.",
        response_id: null,
      }, 200);
    }

    return jsonResponse({ error: "internal_error", detail: msg }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────

/**
 * Load user profile (name, email, phone) from Google accounts.
 */
async function loadUserProfile(
  userId: string,
): Promise<{ name: string | null; email: string | null; phone: string | null }> {
  try {
    const { data } = await supabaseAdmin
      .from("user_google_accounts")
      .select("google_email, google_name")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    if (data) {
      return {
        name: data.google_name ?? null,
        email: data.google_email ?? null,
        phone: null, // Phone comes from imessage_users if needed
      };
    }

    // Fallback: any Google account
    const { data: anyAcct } = await supabaseAdmin
      .from("user_google_accounts")
      .select("google_email, google_name")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    return {
      name: anyAcct?.google_name ?? null,
      email: anyAcct?.google_email ?? null,
      phone: null,
    };
  } catch {
    return { name: null, email: null, phone: null };
  }
}

/**
 * Load the rich user profile built by profile-builder.
 */
async function loadRichProfile(
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await supabaseAdmin
      .from("imessage_users")
      .select("user_profile")
      .eq("user_id", userId)
      .maybeSingle();

    return (data?.user_profile as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

/**
 * PDL enrichment for first real message (iMessage path only).
 * Returns profile context string or undefined.
 */
async function tryPdlEnrichment(
  userId: string,
  userName?: string,
): Promise<string | undefined> {
  try {
    const { data: imsgUser } = await supabaseAdmin
      .from("imessage_users")
      .select("phone_number, pdl_profile, pdl_identity_enriched")
      .eq("user_id", userId)
      .maybeSingle();

    if (!imsgUser) return undefined;

    const cachedProfile = imsgUser.pdl_profile as Record<string, any> | null;
    const alreadyEnriched = imsgUser.pdl_identity_enriched === true;

    // Already enriched — use cached if it has job data
    if (alreadyEnriched) {
      if (cachedProfile?.job_title) {
        return profileToContext(cachedProfile as PDLProfile);
      }
      return undefined;
    }

    // Try enrichment with Google account emails
    const { data: googleAccts } = await supabaseAdmin
      .from("user_google_accounts")
      .select("google_email, google_name")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false });

    const accounts = googleAccts ?? [];
    if (accounts.length === 0) return undefined;

    const displayName = accounts[0]?.google_name ?? userName;

    // Sort: work emails first (non-gmail/hotmail/outlook)
    const sorted = [...accounts].sort((a, b) => {
      const aPersonal = /gmail\.com|hotmail\.|outlook\./i.test(a.google_email ?? "") ? 1 : 0;
      const bPersonal = /gmail\.com|hotmail\.|outlook\./i.test(b.google_email ?? "") ? 1 : 0;
      return aPersonal - bPersonal;
    });

    let bestProfile: PDLProfile | null = null;

    for (const acct of sorted) {
      console.log(`[chat] PDL enrichment: trying ${acct.google_email}`);
      const profile = await enrichByIdentity({
        email: acct.google_email ?? undefined,
        name: displayName ?? undefined,
        phone: imsgUser.phone_number ?? undefined,
      });

      if (profile?.job_title) {
        bestProfile = profile;
        break;
      }
    }

    // Cache result (fire and forget)
    if (bestProfile) {
      supabaseAdmin
        .from("imessage_users")
        .update({
          pdl_profile: bestProfile,
          pdl_identity_enriched: true,
          display_name: bestProfile.full_name ?? displayName,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .then(() => console.log(`[chat] Cached PDL profile for ${userId}`))
        .catch((e: unknown) => console.error("[chat] PDL cache write failed:", e));

      console.log(`[chat] PDL: ${bestProfile.full_name} | ${bestProfile.job_title} @ ${bestProfile.job_company_name}`);
      return profileToContext(bestProfile);
    }

    // Mark enrichment done even with no results
    supabaseAdmin
      .from("imessage_users")
      .update({ pdl_identity_enriched: true, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .catch(() => {});

    // Fall back to cached onboarding profile
    if (cachedProfile?.job_title) {
      return profileToContext(cachedProfile as PDLProfile);
    }

    return undefined;
  } catch (e) {
    console.error("[chat] PDL enrichment failed (non-blocking):", e);
    return undefined;
  }
}

/**
 * Lightweight vibe detection from group message context.
 * Heuristic analysis — no LLM call, runs in ~0ms.
 */
function detectGroupVibe(
  messages: Array<{ role: string; content: string }>,
): string | null {
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase());

  if (userMessages.length < 3) return null; // not enough signal

  const allText = userMessages.join(" ");

  const banterSignals = (allText.match(/\b(lol|lmao|haha|dead|mate|legend|piss off|roast|burn|ratio|cunt|stfu|bruh|oi)\b/g) || []).length;
  const proSignals = (allText.match(/\b(meeting|deadline|project|deliverable|stakeholder|quarter|kpi|budget|sprint|standup|client)\b/g) || []).length;
  const planSignals = (allText.match(/\b(should we|let's|where|when|who's coming|are you in|count me|plan|book|organise|organize)\b/g) || []).length;
  const supportSignals = (allText.match(/\b(you okay|how are you|rough day|sorry to hear|thinking of you|hang in there|sending love)\b/g) || []).length;

  const scores = [
    { vibe: "banter", count: banterSignals },
    { vibe: "professional", count: proSignals },
    { vibe: "planning", count: planSignals },
    { vibe: "supportive", count: supportSignals },
  ].sort((a, b) => b.count - a.count);

  if (scores[0].count < 2) return null;
  return scores[0].vibe;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}