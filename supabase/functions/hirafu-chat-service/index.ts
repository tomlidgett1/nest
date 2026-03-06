// hirafu-chat-service — Main chat endpoint for Hirafu.
//
// Receives messages from the iMessage bridge, assembles context,
// routes through the orchestrator, streams response, persists state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleMessage, type HirafuContext } from "../_shared/hirafu-personality.ts";
import { getUserMemory, updateMemory } from "../_shared/hirafu-memory.ts";
import { appendToConversation, type ConversationMessage } from "../_shared/hirafu-conversation-store.ts";
import { resolveTimezone, TimezoneHolder, DEFAULT_TZ } from "../_shared/hirafu-timezone.ts";
import { serverSideRAG } from "../_shared/hirafu-rag.ts";
import { logAuditEvent } from "../_shared/hirafu-tools.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { message, user_id: userId, phone, timezone: clientTz } = body;

    if (!message || !userId) {
      return new Response(JSON.stringify({ error: "Missing message or user_id" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const traceId = crypto.randomUUID();
    console.log(`[hirafu-chat] Processing message for ${userId} (trace: ${traceId})`);

    // ── Parallel context loading ─────────────────────────────

    const [
      chatResult,
      memoryResult,
      googleAccounts,
      microsoftAccounts,
      learningsResult,
      commitmentsResult,
      briefingResult,
      hirafuUser,
    ] = await Promise.all([
      supabase
        .from("hirafu_chat_messages")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      getUserMemory(userId, supabase),
      supabase
        .from("user_google_accounts")
        .select("google_email, scopes, timezone")
        .eq("user_id", userId),
      supabase
        .from("user_microsoft_accounts")
        .select("microsoft_email, scopes")
        .eq("user_id", userId),
      supabase
        .from("hirafu_user_learnings")
        .select("category, content, confidence")
        .eq("user_id", userId)
        .eq("active", true)
        .gte("confidence", 0.5)
        .order("confidence", { ascending: false })
        .limit(20),
      supabase
        .from("hirafu_user_learnings")
        .select("content, target_date")
        .eq("user_id", userId)
        .eq("active", true)
        .eq("category", "commitment")
        .gte("target_date", new Date().toISOString().slice(0, 10))
        .order("target_date", { ascending: true })
        .limit(10),
      supabase
        .from("hirafu_daily_briefing")
        .select("briefing")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("hirafu_users")
        .select("display_name, user_profile")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // Resolve timezone
    const dbTz = googleAccounts.data?.[0]?.timezone ?? DEFAULT_TZ;
    const { timezone } = await resolveTimezone({
      dbTimezone: dbTz,
      clientTimezone: clientTz,
      userId,
      supabase,
    });
    const timezoneHolder = new TimezoneHolder(timezone);

    // Build recent chat (reversed to chronological)
    const recentChat = (chatResult.data ?? []).reverse().map((m: any) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));

    // Connected accounts
    const connectedAccounts = [
      ...(googleAccounts.data ?? []).map((a: any) => ({
        provider: "google" as const,
        email: a.google_email,
        scopes: a.scopes ?? [],
      })),
      ...(microsoftAccounts.data ?? []).map((a: any) => ({
        provider: "microsoft" as const,
        email: a.microsoft_email,
        scopes: a.scopes ?? [],
      })),
    ];

    // Save user message
    await supabase.from("hirafu_chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
      source: "imessage",
    });

    // Build context
    const ctx: HirafuContext = {
      userId,
      user: {
        display_name: hirafuUser.data?.display_name ?? null,
        email: connectedAccounts[0]?.email ?? null,
        phone: phone ?? null,
      },
      supabase,
      memory: memoryResult,
      learnings: (learningsResult.data ?? []) as any[],
      dailyBriefing: briefingResult.data?.briefing ?? null,
      activeCommitments: (commitmentsResult.data ?? []) as any[],
      userProfile: hirafuUser.data?.user_profile ?? null,
      connectedAccounts,
      timezoneHolder,
    };

    // RAG (parallel with message handling for streaming)
    const ragPromise = serverSideRAG(message, recentChat, userId, supabase, timezone);

    // Check if streaming is needed
    const isStreaming = true;

    if (isStreaming) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const ragEvidence = await ragPromise;

            const response = await handleMessage(message, recentChat, ctx, {
              ragEvidence,
              onAck: (ackText) => {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "ack", text: ackText }) + "\n"));
              },
            });

            // Save assistant response
            const savedContent = response.ackText
              ? `${response.ackText}\n${response.text}`
              : response.text;

            // Append pending action tags
            let contentToSave = savedContent;
            if (response.pendingActions.length > 0) {
              for (const pa of response.pendingActions) {
                contentToSave += `\n<pending_action type="${pa.type}">${JSON.stringify(pa.data)}</pending_action>`;
              }
            }

            const { data: savedMsg } = await supabase
              .from("hirafu_chat_messages")
              .insert({
                user_id: userId,
                role: "assistant",
                content: contentToSave,
                source: "imessage",
              })
              .select("id")
              .single();

            controller.enqueue(encoder.encode(JSON.stringify({
              type: "response",
              response: response.text,
              response_id: savedMsg?.id,
              reaction: response.reaction,
              _debug: {
                path: response.path,
                latencyMs: response.latencyMs,
                trace: response._trace,
              },
            }) + "\n"));

            controller.close();

            // Fire-and-forget post-response tasks
            const totalMessages = (chatResult.data?.length ?? 0) + 2;
            const now = new Date().toISOString();

            Promise.all([
              updateMemory(userId, totalMessages, recentChat, supabase).catch(e =>
                console.error("[hirafu-chat] Memory update failed:", (e as Error).message)
              ),
              appendToConversation(supabase, [
                { role: "user", content: message, ts: now },
                { role: "assistant", content: response.text, ts: now },
              ], { userId }).catch(e =>
                console.error("[hirafu-chat] Conversation store failed:", (e as Error).message)
              ),
            ]).catch(() => {});

          } catch (e) {
            console.error("[hirafu-chat] Stream error:", e);
            controller.enqueue(encoder.encode(JSON.stringify({
              type: "error",
              error: (e as Error).message,
            }) + "\n"));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // Non-streaming path
    const ragEvidence = await ragPromise;
    const response = await handleMessage(message, recentChat, ctx, { ragEvidence });

    await supabase.from("hirafu_chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: response.text,
      source: "imessage",
    });

    return new Response(JSON.stringify({
      response: response.text,
      reaction: response.reaction,
      _debug: { path: response.path, latencyMs: response.latencyMs },
    }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[hirafu-chat] Fatal error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
