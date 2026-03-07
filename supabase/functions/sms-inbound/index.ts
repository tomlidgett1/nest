/**
 * SMS Inbound Webhook — receives inbound SMS from MobileMessage and
 * processes them through the Nest v2 chat pipeline.
 *
 * Optimised for speed:
 *   - Returns 200 to MobileMessage instantly (EdgeRuntime.waitUntil)
 *   - All DB writes are fire-and-forget (don't block the LLM or SMS send)
 *   - SMS is sent the moment the LLM responds — saves happen after
 *   - Ack SMS fires immediately via onAck callback for agent-path messages
 *   - Context loading runs in a single parallel batch
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleMessage, type NestContext } from "../_shared/personality-agent.ts";
import { tryFastRoute, type NestUser } from "../_shared/orchestrator.ts";
import { getUserMemory, updateMemory, extractLearnings } from "../_shared/memory-service.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";
import { serverSideRAG } from "../_shared/server-rag.ts";
import { sendSmsResponse, sendQuickSms } from "../_shared/sms-sender.ts";
import { getGoogleAccessToken, fetchCalendarTimezone } from "../_shared/gmail-helpers.ts";
import { resolveTimezone, TimezoneHolder, DEFAULT_TZ } from "../_shared/timezone-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const smsApiUsername = Deno.env.get("SMS_API_USERNAME") ?? "";
const smsApiPassword = Deno.env.get("SMS_API_PASSWORD") ?? "";
const smsSenderId = Deno.env.get("SMS_SENDER_ID") ?? "";

const smsOpts = { apiUsername: smsApiUsername, apiPassword: smsApiPassword, senderId: smsSenderId };

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Deduplication ─────────────────────────────────────────────
const _recentMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000;

function isDuplicate(phone: string, message: string): boolean {
  const key = `${phone}::${message}`;
  const now = Date.now();
  const lastSeen = _recentMessages.get(key);

  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;

  _recentMessages.set(key, now);
  // Lazy cleanup
  if (_recentMessages.size > 100) {
    for (const [k, ts] of _recentMessages) {
      if (now - ts > DEDUP_WINDOW_MS) _recentMessages.delete(k);
    }
  }
  return false;
}

// ── Entry Point ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let payload: {
    to?: string;
    message?: string;
    sender?: string;
    received_at?: string;
    type?: string;
    original_message_id?: string;
    original_custom_ref?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const senderPhone = payload.sender;
  const messageText = payload.message;
  const webhookType = payload.type;

  if (!senderPhone || !messageText) return jsonResponse({ error: "missing_fields" }, 400);

  if (webhookType === "unsubscribe") {
    EdgeRuntime.waitUntil(
      supabaseAdmin.from("sms_users")
        .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
        .eq("phone_number", normalisePhone(senderPhone))
    );
    return jsonResponse({ status: "ok" });
  }

  if (webhookType && webhookType !== "inbound") return jsonResponse({ status: "ok" });

  const phone = normalisePhone(senderPhone);
  if (isDuplicate(phone, messageText)) return jsonResponse({ status: "ok" });

  console.log(`[sms] ← ${phone}: "${messageText.slice(0, 80)}"`);

  // Return 200 instantly. All work runs in the background.
  EdgeRuntime.waitUntil(handleInbound(phone, messageText, payload.original_message_id));
  return jsonResponse({ status: "ok" });
});

// ── Background Handler ───────────────────────────────────────

async function handleInbound(phone: string, message: string, originalMsgId?: string): Promise<void> {
  const t0 = Date.now();

  try {
    // ── 1. User lookup (fast path: single DB query) ───────────
    let smsUser = await getSmsUser(phone);
    if (!smsUser) {
      smsUser = await createSmsUser(phone);
      if (!smsUser) return;
    }

    // Log inbound — fire-and-forget, don't block anything
    supabaseAdmin.from("sms_messages").insert({
      sms_user_id: smsUser.id, phone_number: phone,
      direction: "inbound", content: message,
      mobile_message_id: originalMsgId ?? null,
    }).then(() => {}).catch(() => {});

    if (smsUser.status !== "active" || !smsUser.user_id) {
      await handleNonActiveUser(smsUser, phone);
      return;
    }

    // ── 2. Run chat pipeline and send SMS ─────────────────────
    await processAndSend(smsUser.user_id, smsUser.display_name, phone, message, smsUser.id, t0);

  } catch (error) {
    console.error("[sms] Error:", error instanceof Error ? error.message : error);
    await sendSmsResponse(phone, "Hey, something went wrong on my end. Text me again in a sec.", smsOpts)
      .catch(() => {});
  }
}

// ── Core Pipeline ────────────────────────────────────────────
// Aligned with v2-chat-service (iMessage path). Identical context loading,
// routing, and LLM pipeline. Only difference: final delivery via SMS API
// with markdown stripping (no bold/formatting in SMS).

async function processAndSend(
  userId: string,
  displayName: string | null,
  phone: string,
  message: string,
  smsUserId: string,
  t0: number,
): Promise<void> {

  // ── Phase 1: Load context (aligned with v2-chat-service) ────
  // Pre-fetch timezone so "today" is computed in the user's local time, not UTC
  const { data: _tzRow } = await supabaseAdmin
    .from("user_google_accounts")
    .select("timezone")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  const _prefetchTz = (_tzRow?.timezone as string) || DEFAULT_TZ;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: _prefetchTz });
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: _prefetchTz });

  // 11 parallel queries — identical to v2-chat-service iMessage path
  const [chatResult, memory, accountsResult, microsoftAccountsResult, richProfileResult, imsgUserRow, learningsResult, countResult, briefingResult, commitmentsResult] = await Promise.all([
    // Chat history: load ALL sources (not just SMS) so cross-channel context is shared
    supabaseAdmin.from("v2_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false }).limit(20),
    getUserMemory(userId, supabaseAdmin),
    supabaseAdmin.from("user_google_accounts")
      .select("google_email, google_name, is_primary, timezone")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false }),
    supabaseAdmin.from("user_microsoft_accounts")
      .select("microsoft_email, is_primary")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false }),
    supabaseAdmin.from("imessage_users")
      .select("user_profile").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("imessage_users")
      .select("onboard_messages, testing").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("v2_user_learnings")
      .select("category, content, confidence, times_reinforced, last_observed_at, emotional_weight")
      .eq("user_id", userId).eq("active", true).gte("confidence", 0.5)
      .order("last_observed_at", { ascending: false }).limit(50),
    // Total message count: ALL sources (not just SMS)
    supabaseAdmin.from("v2_chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabaseAdmin.from("v2_daily_briefing")
      .select("briefing").eq("user_id", userId).maybeSingle(),
    // Commitments: timezone-aware, include null target_date, limit 15
    supabaseAdmin.from("v2_user_learnings")
      .select("content, target_date, expires_after, context")
      .eq("user_id", userId).eq("category", "commitment").eq("active", true)
      .or(`and(target_date.gte.${today},target_date.lte.${nextWeek}),target_date.is.null`)
      .order("target_date", { ascending: true, nullsFirst: false }).limit(15),
  ]);

  let recentChat = (chatResult.data ?? [])
    .filter((m: any) => m.content?.trim())
    .reverse();

  const testingPromptEnabled = !!imsgUserRow?.data?.testing;

  // Seed onboarding history for new users (aligned with v2-chat-service)
  if (recentChat.length < 6) {
    try {
      const onboardMessages = imsgUserRow?.data?.onboard_messages as Array<{ role: string; content: string }> | null;
      if (onboardMessages && onboardMessages.length > 0) {
        const onboardChat = onboardMessages
          .filter((m: any) => m.content && m.content.trim().length > 0)
          .map((m: any) => ({ role: m.role, content: m.content, created_at: undefined }));
        recentChat = [...onboardChat, ...recentChat];
        console.log(`[sms] Seeded ${onboardChat.length} onboarding messages`);
      }
    } catch (e) {
      console.error("[sms] Onboarding seed failed (non-blocking):", e);
    }
  }

  // Google accounts
  const googleAccounts = accountsResult.data ?? [];
  const microsoftAccounts = microsoftAccountsResult.data ?? [];
  if (microsoftAccountsResult.error) {
    console.warn("[sms] Microsoft accounts query failed (non-blocking):", microsoftAccountsResult.error.message);
  }

  // Connected accounts: Google + Microsoft (aligned with v2-chat-service)
  const connectedAccounts: Array<{ email: string; isPrimary: boolean; provider: "google" | "microsoft" }> = [
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
  console.log(`[sms] Connected accounts: ${connectedAccounts.length} total (${googleAccounts.length} Google, ${microsoftAccounts.length} Microsoft)`);

  const primaryAccount = googleAccounts.find((a: any) => a.is_primary) ?? googleAccounts[0];
  const userName = primaryAccount?.google_name ?? displayName ?? "there";
  const userEmail = primaryAccount?.google_email ?? "";
  let dbTimezone = (primaryAccount?.timezone as string) ?? DEFAULT_TZ;

  // Timezone backfill (aligned with v2-chat-service)
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
          .then(() => console.log(`[sms] Backfilled timezone ${tz} for ${userId}`))
          .catch(() => {});
      }
    } catch (e) {
      console.warn("[sms] Timezone backfill failed:", (e as Error).message);
    }
  }

  const userLearnings = (learningsResult.data ?? []).map((l: any) => ({
    category: l.category as string, content: l.content as string,
    confidence: l.confidence as number, timesReinforced: l.times_reinforced as number,
    emotionalWeight: (l.emotional_weight as string) ?? "medium",
  }));

  // ── Authoritative timezone resolution (DB only for SMS — no client device) ──
  const tzResult = await resolveTimezone({
    dbTimezone,
    userId,
    supabase: supabaseAdmin,
  });
  let userTimezone = tzResult.timezone;
  if (tzResult.changed) {
    console.log(`[sms] Timezone resolved: ${tzResult.timezone} (source: ${tzResult.source}, was: ${dbTimezone})`);
  }

  const richProfileData = (richProfileResult?.data?.user_profile as Record<string, unknown>) ?? null;
  const locationCity = richProfileData
    ? ((richProfileData as any).identity?.location as string | undefined) ?? undefined
    : undefined;

  const activeCommitments = commitmentsResult?.data
    ? (commitmentsResult.data as any[]).map((c: any) => ({
        content: c.content as string, targetDate: c.target_date as string,
        expiresAfter: (c.expires_after as string) ?? null, context: (c.context as string) ?? null,
      }))
    : null;

  console.log(`[sms] Rich profile loaded: ${richProfileData ? `v${(richProfileData as any).version ?? 1}, ${((richProfileData as any).summary ?? "").length}c summary` : "NONE"}`);

  const contextMs = Date.now() - t0;

  // ── Phase 2: Save user message (fire-and-forget) ────────────
  supabaseAdmin.from("v2_chat_messages").insert({
    user_id: userId, role: "user", content: message, source: "sms",
  }).then(() => {}).catch(() => {});

  extractLearnings(message, userId, supabaseAdmin).catch(() => {});

  // ── Phase 3: Route + LLM ────────────────────────────────────
  const t1 = Date.now();

  const nestUser: NestUser = {
    name: userName, email: userEmail, phone,
    timezone: userTimezone, locationCity,
    connectedAccounts: connectedAccounts.length > 0 ? connectedAccounts : undefined,
    testing: testingPromptEnabled,
  };

  const realMessageCount = recentChat.length;
  const profileIsNew = !!richProfileData && realMessageCount < 16;

  const timezoneHolder = new TimezoneHolder(userTimezone, (newTz) => {
    nestUser.timezone = newTz;
  });

  const ctx: NestContext = {
    userId, user: nestUser, supabase: supabaseAdmin,
    memory: memory ?? null,
    userProfile: richProfileData,
    profileIsNew,
    learnings: userLearnings.length > 0 ? userLearnings : null,
    dailyBriefing: (briefingResult?.data?.briefing as string) ?? null,
    activeCommitments: activeCommitments && activeCommitments.length > 0 ? activeCommitments : null,
    recallPitchStatus: memory?.recallPitchStatus ?? null,
    timezoneHolder,
    source: "sms",
  };

  const quickRoute = tryFastRoute(message, nestUser, recentChat);
  const isAgent = !quickRoute || quickRoute.path === "agent";

  let ackText: string | null = null;

  const ragPromise = isAgent
    ? serverSideRAG(message, recentChat, userId, supabaseAdmin).catch(() => "")
    : undefined;

  const response = await handleMessage(message, recentChat, ctx, {
    ...(ragPromise ? { ragPromise } : {}),
    ...(isAgent ? {
      onAck: (text: string) => {
        ackText = text;
        sendQuickSms(phone, text, { ...smsOpts, customRef: `ack-${Date.now()}` })
          .then((r) => { if (r.success) console.log(`[sms] Ack sent: "${text}"`); })
          .catch(() => {});
      },
    } : {}),
  });

  const agentMs = Date.now() - t1;
  const fullText = response.text;

  // ── Phase 4: Send SMS IMMEDIATELY ───────────────────────────
  // This is the user-facing latency — everything after this is background work.
  const sendResult = await sendSmsResponse(phone, fullText, {
    ...smsOpts,
    customRefPrefix: `nest-${userId.slice(0, 8)}-${Date.now()}`,
  });

  const totalMs = Date.now() - t0;
  console.log(
    `[sms] ✓ ${response.path} | tools=[${response.toolsUsed.join(",")}] | ` +
    `${fullText.length}c | ${sendResult.messageIds.length} SMS | ` +
    (response.ackText ? `[ack=${(response.ackText ?? "").length}c] ` : "") +
    `ctx=${contextMs}ms agent=${agentMs}ms total=${totalMs}ms`,
  );

  // ── Phase 5: All saves fire-and-forget (after SMS is sent) ──
  const savedBase = ackText ? `${ackText}\n${fullText}` : fullText;
  let savedContent = savedBase;
  if (response.pendingActions.length > 0) {
    const meta = response.pendingActions
      .map((a: any) => `<pending_action type="${a.type}">${JSON.stringify(a.data)}</pending_action>`)
      .join("\n");
    savedContent = `${savedBase}\n\n${meta}`;
  }

  // Save assistant message
  supabaseAdmin.from("v2_chat_messages")
    .insert({ user_id: userId, role: "assistant", content: savedContent, source: "sms" })
    .then(() => {}).catch(() => {});

  // Log outbound SMS
  for (const msgId of sendResult.messageIds) {
    supabaseAdmin.from("sms_messages").insert({
      sms_user_id: smsUserId, phone_number: phone,
      direction: "outbound", content: fullText,
      mobile_message_id: msgId, status: "sent",
    }).then(() => {}).catch(() => {});
  }

  // Debug trace (aligned with v2-chat-service — full context snapshot)
  if (response._trace) {
    const tracePayload = {
      ...response._trace,
      request: { message, user_id: userId, source: "sms", timestamp: new Date(t0).toISOString() },
      context: {
        recent_chat_count: recentChat.length,
        memory_summary: memory?.summary?.slice(0, 500) ?? null,
        memory_writing_style: memory?.writingStyle ?? null,
        memory_emotional_arc: memory?.emotionalArc ?? null,
        memory_relationship_notes: memory?.relationshipNotes ?? null,
        identity_model: memory?.identityModel ?? null,
        learnings_count: userLearnings.length,
        learnings: userLearnings,
        daily_briefing: briefingResult?.data?.briefing ?? null,
        active_commitments: activeCommitments,
        user_timezone: userTimezone,
        total_message_count: countResult.count ?? 0,
      },
      timing: { ...((response._trace as any).timing ?? {}), context_ms: contextMs, agent_ms: agentMs, total_ms: totalMs },
    };
    supabaseAdmin.from("v2_debug_logs").insert({
      user_id: userId, source: "sms", route_path: response.path,
      model: (tracePayload as any).routing?.model ?? null,
      user_message: message, trace: tracePayload,
    }).then(() => {}).catch(() => {});
  }

  // Memory update
  const totalMessages = (countResult.count ?? 0) + 2;
  updateMemory(userId, totalMessages,
    [...recentChat, { role: "user", content: message }, { role: "assistant", content: savedBase }],
    supabaseAdmin,
  ).catch(() => {});

  // Conversation store
  const nowIso = new Date().toISOString();
  appendToConversation(supabaseAdmin, [
    { role: "user", content: message, ts: nowIso },
    { role: "assistant", content: savedBase, ts: new Date().toISOString() },
  ], { userId, phoneNumber: phone }).catch(() => {});
}

// ── Non-Active User Handling ─────────────────────────────────

async function handleNonActiveUser(smsUser: SmsUser, phone: string): Promise<void> {
  const onboardUrl = `https://nest.expert/?token=${smsUser.onboarding_token}&channel=sms`;
  await sendSmsResponse(phone,
    `Hey! I'm Nest — your AI assistant for calendar, email, and everything in between.\n\n` +
    `To get started, connect your Google account so I can help you out:\n${onboardUrl}\n\n` +
    `Once you're set up, just text me anything and I'll take care of it.`,
    smsOpts,
  );
}

// ── SMS User Management ──────────────────────────────────────

interface SmsUser {
  id: string;
  phone_number: string;
  user_id: string | null;
  status: string;
  display_name: string | null;
  onboarding_token: string;
}

async function getSmsUser(phone: string): Promise<SmsUser | null> {
  const { data } = await supabaseAdmin
    .from("sms_users")
    .select("id, phone_number, user_id, status, display_name, onboarding_token")
    .eq("phone_number", phone)
    .maybeSingle();
  return data as SmsUser | null;
}

async function createSmsUser(phone: string): Promise<SmsUser | null> {
  const { data: imsgUser } = await supabaseAdmin
    .from("imessage_users")
    .select("user_id, display_name, status")
    .eq("phone_number", phone)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("sms_users")
    .insert({
      phone_number: phone,
      status: imsgUser?.status === "active" && imsgUser?.user_id ? "active" : "pending",
      user_id: imsgUser?.user_id ?? null,
      display_name: imsgUser?.display_name ?? null,
    })
    .select("id, phone_number, user_id, status, display_name, onboarding_token")
    .single();

  if (error) {
    if (error.code === "23505") return getSmsUser(phone);
    console.error("[sms] Create user failed:", error.message);
    return null;
  }
  return data as SmsUser;
}

// ── Phone Normalisation ──────────────────────────────────────

function normalisePhone(phone: string): string {
  let c = phone.replace(/[\s\-()]/g, "");
  if (c.startsWith("0") && c.length === 10) c = "+61" + c.slice(1);
  if (c.startsWith("61") && c.length === 11) c = "+" + c;
  if (!c.startsWith("+") && c.length >= 10) c = "+" + c;
  return c;
}

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
