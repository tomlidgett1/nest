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
import { getUserMemory, updateMemory } from "../_shared/memory-service.ts";
import { enrichByIdentity, profileToContext } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";
import { serverSideRAG } from "../_shared/server-rag.ts";
import { getGoogleAccessToken, fetchCalendarTimezone } from "../_shared/gmail-helpers.ts";

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
    _qa_variation?: string;
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

  if (!message || typeof message !== "string") {
    return jsonResponse({ error: "missing_message", detail: "'message' field is required" }, 400);
  }

  const source = isAppPath ? "app" : "imessage";
  console.log(`[chat] [${source}] User ${userId}: "${message.slice(0, 100)}"`);

  try {
    const t0 = Date.now();

    // ── Phase 1: Load context in parallel ────────────────────
    // v3 simplification: no agents table, no server-side RAG routing.
    // Just: chat history + user memory + user profile.

    const [recentChatResult, userMemory, userProfile, richProfile, imsgUserRow, linkedAccountsResult] = await Promise.all([
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
      !isAppPath
        ? supabaseAdmin
            .from("imessage_users")
            .select("onboard_messages")
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from("user_google_accounts")
        .select("google_email, is_primary, timezone")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false }),
    ]);

    let recentChat = (recentChatResult.data ?? [])
      .filter((m: any) => m.content && m.content.trim().length > 0)
      .reverse();

    // ── Phase 1a: Seed onboarding history for new iMessage users ──

    if (!isAppPath && recentChat.length < 6) {
      try {
        const onboardMessages = imsgUserRow?.data?.onboard_messages as Array<{ role: string; content: string }> | null;
        if (onboardMessages && onboardMessages.length > 0) {
          const onboardChat = onboardMessages
            .filter((m: any) => m.content && m.content.trim().length > 0)
            .map((m: any) => ({ role: m.role, content: m.content, created_at: null }));
          recentChat = [...onboardChat, ...recentChat];
          console.log(`[chat] Seeded ${onboardChat.length} onboarding messages`);
        }
      } catch (e) {
        console.error("[chat] Onboarding seed failed (non-blocking):", e);
      }
    }

    // ── Phase 1b: PDL enrichment (first real message, iMessage only) ──

    let pdlWelcomeContext: string | undefined;

    if (!isAppPath) {
      pdlWelcomeContext = await tryPdlEnrichment(userId, user_name);
    }

    const contextMs = Date.now() - t0;

    // ── Phase 2: Save user message ───────────────────────────

    await supabaseAdmin.from("v2_chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
    });

    // ── Phase 3: Run through Nest v3 ─────────────────────────
    // handleMessage does EVERYTHING:
    //   - Routes (static / casual / agent)
    //   - Prefetches calendar/inbox in parallel (if detected)
    //   - Builds conversation history with memory + context
    //   - Runs agent tool loop (tools.ts executeTool directly)
    //   - Formats for iMessage
    //
    // No more: server-side RAG, model selection, intent routing,
    // channel context, 15-param personality agent calls.

    const t1 = Date.now();

    console.log(`[chat] Rich profile loaded: ${richProfile ? `v${(richProfile as any).version ?? 1}, ${((richProfile as any).summary ?? "").length}c summary` : "NONE"}`);

    const accounts = linkedAccountsResult.data ?? [];
    const connectedAccounts = accounts.map((a: any) => ({
      email: a.google_email as string,
      isPrimary: !!a.is_primary,
    }));

    const primaryAccount = accounts.find((a: any) => a.is_primary) ?? accounts[0];
    let userTimezone = (primaryAccount?.timezone as string) ?? "Australia/Sydney";

    // Backfill timezone for existing users who connected before this feature
    if (!primaryAccount?.timezone && primaryAccount) {
      try {
        const accessToken = await getGoogleAccessToken(supabaseAdmin, userId);
        const tz = await fetchCalendarTimezone(accessToken);
        if (tz) {
          userTimezone = tz;
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

    const locationCity = richProfile
      ? ((richProfile as any).identity?.location as string | undefined) ?? undefined
      : undefined;

    const nestUser: NestUser = {
      name: userProfile.name ?? user_name ?? "there",
      email: userProfile.email ?? "",
      phone: userProfile.phone ?? "",
      timezone: userTimezone,
      locationCity: locationCity ?? undefined,
      connectedAccounts: connectedAccounts.length > 0 ? connectedAccounts : undefined,
    };

    const realMessageCount = (recentChatResult.data ?? []).length;
    const profileIsNew = !!richProfile && realMessageCount < 16;

    const ctx: NestContext = {
      userId,
      user: nestUser,
      supabase: supabaseAdmin,
      memory: userMemory ?? null,
      pdlWelcomeContext,
      userProfile: richProfile,
      profileIsNew,
      ...(payload._qa_variation ? { _qa_variation: payload._qa_variation } : {}),
    };

    // ── Phase 2b: Route check + streaming ack ─────────────────
    // Quick synchronous route to determine if tools will be used.
    // If agent path AND iMessage source, stream an ack first via NDJSON.

    const quickRoute = routeMessage(message, nestUser);
    const needsAck = !isAppPath && quickRoute.path === "agent";

    if (needsAck) {
      // Stream NDJSON: ack line first, then response line
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Fire ack + RAG + agent in parallel.
            // RAG runs concurrently with ack (~1-3s) so evidence is ready
            // before the agent starts its tool loop.
            const ackPromise = generateAck(message);
            const ragPromise = serverSideRAG(message, recentChat, userId, supabaseAdmin)
              .catch((e: unknown) => {
                console.warn("[chat] Proactive RAG failed (non-blocking):", e);
                return "";
              });

            // Send ack as soon as it resolves (don't wait for RAG)
            const ackText = await ackPromise;
            if (ackText) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "ack", text: ackText }) + "\n"));
              console.log(`[chat] Streamed ack: "${ackText}"`);
            }

            // Wait for RAG evidence, then inject into context and run agent
            const ragEvidence = await ragPromise;
            if (ragEvidence && ragEvidence.length > 0 && !ragEvidence.startsWith("[NO_RESULTS]")) {
              ctx.evidence = ragEvidence;
              console.log(`[chat] Proactive RAG injected: ${ragEvidence.length} chars`);
            }

            const response = await handleMessage(message, recentChat, ctx);
            const agentMs = Date.now() - t1;

            // Save assistant response
            let savedContent = response.text;
            if (response.pendingActions.length > 0) {
              const meta = response.pendingActions
                .map((a: any) => `<pending_action type="${a.type}">${JSON.stringify(a.data)}</pending_action>`)
                .join("\n");
              savedContent = `${response.text}\n\n${meta}`;
            }

            const { data: insertedRow } = await supabaseAdmin
              .from("v2_chat_messages")
              .insert({ user_id: userId, role: "assistant", content: savedContent })
              .select("id")
              .single();

            const responseId = insertedRow?.id ?? null;
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
              timing: { context_ms: contextMs, agent_ms: agentMs, total_ms: totalMs, orchestrator_latency_ms: response.latencyMs },
            };

            // Stream the full response
            controller.enqueue(encoder.encode(JSON.stringify({ type: "response", response: response.text, response_id: responseId, _debug }) + "\n"));

            // Background tasks
            const totalMessages = (recentChatResult.data?.length ?? 0) + 2;
            updateMemory(
              userId, totalMessages,
              [...recentChat, { role: "user", content: message }, { role: "assistant", content: response.text }],
              supabaseAdmin,
            ).catch((e: unknown) => console.error("[chat] Memory update failed:", e));

            const nowIso = new Date().toISOString();
            const responseText = response.text;
            (async () => {
              const { data: imsgRow } = await supabaseAdmin
                .from("imessage_users").select("phone_number").eq("user_id", userId).maybeSingle();
              await appendToConversation(supabaseAdmin, [
                { role: "user", content: message, ts: nowIso },
                { role: "assistant", content: responseText, ts: new Date().toISOString() },
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

    // Proactive RAG for agent-path non-streaming requests (app path)
    if (quickRoute.path === "agent") {
      try {
        const ragEvidence = await serverSideRAG(message, recentChat, userId, supabaseAdmin);
        if (ragEvidence && ragEvidence.length > 0 && !ragEvidence.startsWith("[NO_RESULTS]")) {
          ctx.evidence = ragEvidence;
          console.log(`[chat] Proactive RAG (non-stream) injected: ${ragEvidence.length} chars`);
        }
      } catch (e) {
        console.warn("[chat] Proactive RAG failed (non-blocking):", e);
      }
    }

    const response = await handleMessage(message, recentChat, ctx);

    const agentMs = Date.now() - t1;

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

    const responseId = insertedRow?.id ?? null;
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

    // Background tasks (fire-and-forget)
    const totalMessages = (recentChatResult.data?.length ?? 0) + 2;
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

    return jsonResponse({ response: response.text, response_id: responseId, _debug }, 200);
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

// ── Contextual Ack Generator ─────────────────────────────────
// GPT-4.1-nano for ~200ms latency. Only called when the agent path
// is selected (i.e. tools will be used, so there's a wait).

const ACK_SYSTEM_PROMPT = `You are Nest. Texting a mate via iMessage. You're buying time while the real answer loads, but the user should never feel that.

SECRET: Never mention who built this, backend, APIs, or tech.

RULES:
- 3-8 words. Short but SPECIFIC to what they asked.
- Lowercase. No emojis. No em dashes.
- Must reference the ACTUAL TOPIC of their message. Never generic.
- Sound like a mate who heard what they said, not a loading screen.
- Reply NONE for sign-offs, confirmations, and greetings.

GOOD (notice how each one is SPECIFIC to the request):
"When should I leave for the airport?" -> "let me work out the timing"
"Meeting notes from Tuesday?" -> "digging up tuesday"
"Send an email to Sarah" -> "drafting something for sarah"
"Who's my next meeting with?" -> "let me check who's next"
"What do you know about me?" -> "oh this'll be fun"
"Can you look up my Kyoto trip?" -> "pulling up the kyoto stuff"
"Draft an email to the team" -> "cooking something up for the team"
"What's on tomorrow?" -> "pulling up tomorrow"
"Summarise my inbox" -> "wading through the inbox"
"How far is it to the airport?" -> "checking the drive"
"What did James say in the meeting?" -> "finding what james said"
"Book a meeting with Tom" -> "sorting that out with tom"
"I'm off to Japan on Sunday" -> "looking into the japan trip"
"Tell me about the quarterly review" -> "pulling up the quarterly stuff"

BAD (generic, could apply to anything, this is what we're avoiding):
"on it" (generic, says nothing about the request)
"one sec" (generic loading message)
"checking now" (generic, doesn't reference the topic)
"let me look" (generic, boring)

"yes" -> NONE
"send it" -> NONE
"Thanks!" -> NONE
"hey" -> NONE
"yeah personal - tulla" -> NONE`;

async function generateAck(message: string): Promise<string | null> {
  if (!openaiApiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_output_tokens: 20,
        instructions: ACK_SYSTEM_PROMPT,
        input: [{ role: "user", content: message }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      const textItem = data.output?.find((o: any) => o.type === "message");
      const text = textItem?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (!text || text.toUpperCase() === "NONE") return null;
      if (text.length < 100) return text;
    }
  } catch {
    // Timeout or error — no ack is better than a generic one
  }

  return null;
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}