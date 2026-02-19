// v2-chat Edge Function — single entry point for all user messages.
// Authenticates via Supabase JWT, saves messages, runs the Interaction Agent,
// and returns the assistant's response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runPersonalityAgent } from "../_shared/personality-agent.ts";
import { getUserMemory } from "../_shared/memory-service.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // ── Authenticate ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!jwt) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(jwt);

  if (authError || !user) {
    console.error(
      "[v2-chat] Invalid JWT",
      authError?.message ?? "unknown"
    );
    return jsonResponse({ error: "unauthorised" }, 401);
  }

  const userId = user.id;

  // ── Parse request ─────────────────────────────────────────
  let payload: { message: string; evidence_context?: string; email_style_context?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { message, evidence_context, email_style_context } = payload;
  if (!message || typeof message !== "string") {
    return jsonResponse(
      { error: "missing_message", detail: "'message' field is required" },
      400
    );
  }

  console.log(
    `[v2-chat] User ${userId} message: "${message.slice(0, 100)}"`,
    evidence_context ? `(with ${evidence_context.length} chars of pre-fetched evidence)` : "(no pre-fetched evidence)",
    email_style_context ? `(with ${email_style_context.length} chars of email style)` : "(no email style)"
  );

  try {
    // ── 1. Load context BEFORE saving (prevents duplicate in history) ──
    const [agentsResult, recentChatResult, userMemory] = await Promise.all([
      supabaseAdmin
        .from("v2_agents")
        .select("id, name, agent_type, meeting_id, last_active_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("last_active_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("v2_chat_messages")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      getUserMemory(userId, supabaseAdmin),
    ]);

    const agents = agentsResult.data ?? [];
    const recentChat = (recentChatResult.data ?? []).reverse();

    // ── 2. Save user message (after loading to avoid duplication) ──────
    await supabaseAdmin.from("v2_chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
    });

    // ── 3. Run Personality Agent ──────────────────────────────
    const response = await runPersonalityAgent(
      userId,
      message,
      agents,
      recentChat,
      supabaseAdmin,
      evidence_context,
      email_style_context,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userMemory,
    );

    // ── 4. Save assistant response ────────────────────────────
    await supabaseAdmin.from("v2_chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: response.text,
      agents_used: response.agentsUsed,
    });

    console.log(
      `[v2-chat] Response generated (${response.text.length} chars, ${response.agentsUsed.length} agents used)`
    );

    return jsonResponse({ response: response.text }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[v2-chat] Error:", msg);
    return jsonResponse({ error: "internal_error", detail: msg }, 500);
  }
});

function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
