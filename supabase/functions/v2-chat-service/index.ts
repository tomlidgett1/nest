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
import { getUserMemory, updateMemory } from "../_shared/memory-service.ts";
import { enrichByIdentity, profileToContext } from "../_shared/pdl-enrichment.ts";
import type { PDLProfile } from "../_shared/pdl-enrichment.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";

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

    const [recentChatResult, userMemory, userProfile, richProfile] = await Promise.all([
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
    ]);

    let recentChat = (recentChatResult.data ?? [])
      .filter((m: any) => m.content && m.content.trim().length > 0)
      .reverse();

    // ── Phase 1a: Seed onboarding history for new iMessage users ──

    if (!isAppPath && recentChat.length < 6) {
      try {
        const { data: imsgRow } = await supabaseAdmin
          .from("imessage_users")
          .select("onboard_messages")
          .eq("user_id", userId)
          .maybeSingle();

        const onboardMessages = imsgRow?.onboard_messages as Array<{ role: string; content: string }> | null;
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

    const ctx: NestContext = {
      userId,
      user: {
        name: userProfile.name ?? user_name ?? "there",
        email: userProfile.email ?? "",
        phone: userProfile.phone ?? "",
      },
      supabase: supabaseAdmin,
      memory: userMemory ?? null,
      pdlWelcomeContext,
      userProfile: richProfile,
    };

    const response = await handleMessage(message, recentChat, ctx);

    const agentMs = Date.now() - t1;

    // ── Phase 4: Save assistant response ─────────────────────
    // Append pending action metadata so the model can reference it on the next turn.
    // e.g. a draft_id from send_draft so "yes send it" can call send_email(draft_id).

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
        // agent_ms includes orchestrator latency reported separately
        orchestrator_latency_ms: response.latencyMs,
      },
    };

    // ── Phase 5: Background tasks (fire-and-forget) ──────────

    // Memory update
    const totalMessages = (recentChatResult.data?.length ?? 0) + 2;
    updateMemory(
      userId,
      totalMessages,
      [...recentChat, { role: "user", content: message }, { role: "assistant", content: response.text }],
      supabaseAdmin,
    ).catch((e: unknown) => console.error("[chat] Memory update failed:", e));

    // Conversation session (iMessage only)
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

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}