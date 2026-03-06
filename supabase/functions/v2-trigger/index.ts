// v2-trigger Edge Function — proactive meeting prep & notifications.
//
// Two modes:
//   1. POST { action: "meeting_prep", user_id } — called by iMessage bridge every 60s
//      Returns upcoming meetings (8-12 min window) with RAG-enriched prep.
//   2. POST (no action) — legacy cron mode for email triggers
//
// Meeting prep pipeline:
//   1. Query search_documents for calendar events starting in 8-12 minutes
//   2. Run targeted RAG for each event (attendees, past meetings, emails, notes)
//   3. Use Claude to generate a world-class conversational prep brief
//   4. Return formatted messages for iMessage delivery

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { targetedRAG } from "../_shared/server-rag.ts";
import { getBatchEmbeddings, vectorString, executeTool, localTimeToUtc } from "../_shared/tools.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";
import { getUserMemory } from "../_shared/memory-service.ts";
import { getAllAccountTokens, listGmailMessages, getGmailMessage } from "../_shared/gmail-helpers.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

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

  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch { /* ignore */ }

  // Route to meeting prep mode if requested
  if (body?.action === "meeting_prep" && body?.user_id) {
    return await handleMeetingPrep(
      body.user_id,
      body.fired_event_ids ?? [],
      body.test_window_hours ?? 0
    );
  }

  // Route to daily briefing regeneration
  if (body?.action === "check_daily_briefing") {
    return await handleDailyBriefings();
  }

  // Route to automation execution (email summary, etc.)
  if (body?.action === "check_automations") {
    return await handleAutomations();
  }

  // Test a specific custom automation on demand
  if (body?.action === "test_custom_automation" && body?.automation_id && body?.user_id) {
    try {
      const { data } = await supabaseAdmin.from("user_automations").select("id, config, label, user_id").eq("id", body.automation_id).eq("user_id", body.user_id).maybeSingle();
      if (!data) return jsonResponse({ error: "not_found" }, 404);
      await executeCustomAutomation(data.user_id, data.config, data.id);
      return jsonResponse({ status: "executed", automation_id: data.id }, 200);
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 500);
    }
  }

  // Route to cron reminder delivery
  if (body?.action === "check_cron_reminders") {
    return await handleCronReminders();
  }

  // Legacy: check cron triggers
  if (body?.action === "check_cron_triggers") {
    return await handleCronReminders();
  }

  // Default: check cron triggers (called by pg_cron or bridge every minute)
  return await handleCronReminders();
});

// ── Meeting Prep Handler ─────────────────────────────────────

async function handleMeetingPrep(
  userId: string,
  alreadyFiredIds: string[],
  testWindowHours = 0
): Promise<Response> {
  const start = Date.now();

  try {
    const now = new Date();
    const nowMs = now.getTime();
    // Normal: 8-12 minute window. Test mode: wider window for testing.
    const windowStartMs = testWindowHours > 0
      ? nowMs
      : nowMs + 8 * 60 * 1000;
    const windowEndMs = testWindowHours > 0
      ? nowMs + testWindowHours * 60 * 60 * 1000
      : nowMs + 12 * 60 * 1000;

    console.log(
      `[v2-trigger] Meeting prep check: window ${new Date(windowStartMs).toISOString()} → ${new Date(windowEndMs).toISOString()}`
    );

    // Fetch a broad set of upcoming events (next 24h) — we filter precisely in JS
    // because metadata.start may contain timezone offsets that break string comparison.
    const { data: candidateEvents, error } = await supabaseAdmin
      .from("search_documents")
      .select("id, source_type, source_id, title, summary_text, chunk_text, metadata")
      .eq("user_id", userId)
      .eq("source_type", "calendar_summary")
      .eq("is_deleted", false)
      .order("metadata->>start" as any, { ascending: true })
      .limit(30);

    if (error) {
      console.error("[v2-trigger] Calendar query error:", error.message);
      return jsonResponse({ messages: [], error: error.message }, 200);
    }

    if (!candidateEvents || candidateEvents.length === 0) {
      return jsonResponse({ messages: [], event_ids: [] }, 200);
    }

    // Parse dates properly and filter to the exact window
    const firedSet = new Set(alreadyFiredIds);
    const seen = new Set<string>();
    const events = candidateEvents.filter((e: any) => {
      const eventId = e.metadata?.event_id || e.id;
      if (firedSet.has(eventId) || seen.has(eventId)) return false;

      const startStr = e.metadata?.start;
      if (!startStr) return false;

      const startMs = new Date(startStr).getTime();
      if (isNaN(startMs)) return false;
      if (startMs < windowStartMs || startMs >= windowEndMs) return false;

      seen.add(eventId);
      return true;
    });

    if (events.length === 0) {
      return jsonResponse({ messages: [], event_ids: [] }, 200);
    }

    console.log(`[v2-trigger] Found ${events.length} upcoming event(s) for prep`);

    const messages: string[] = [];
    const eventIds: string[] = [];
    const messageIds: string[] = [];

    for (const event of events) {
      const eventId = event.metadata?.event_id || event.id;
      eventIds.push(eventId);

      const minutesUntil = event.metadata?.start
        ? Math.round((new Date(event.metadata.start).getTime() - Date.now()) / 60000)
        : 10;
      const prepMessage = await generateMeetingPrep(event, userId, minutesUntil);
      if (prepMessage) {
        messages.push(prepMessage);

        // Also save to v2_chat_messages for the app
        const { data: inserted } = await supabaseAdmin.from("v2_chat_messages").insert({
          user_id: userId,
          role: "assistant",
          content: prepMessage,
        }).select("id").single();
        if (inserted?.id) messageIds.push(inserted.id);

        appendToConversation(supabaseAdmin, [
          { role: "assistant", content: prepMessage, ts: new Date().toISOString() },
        ], { userId })
          .catch((e: unknown) => console.error("[v2-trigger] Conversation store failed:", e));
      }
    }

    const elapsed = Date.now() - start;
    console.log(
      `[v2-trigger] Meeting prep: ${messages.length} message(s) generated (${elapsed}ms)`
    );

    return jsonResponse({ messages, event_ids: eventIds, message_ids: messageIds }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[v2-trigger] Meeting prep error:", msg);
    return jsonResponse({ messages: [], event_ids: [], error: msg }, 200);
  }
}

// ── RAG-Enriched Meeting Prep ────────────────────────────────

async function generateMeetingPrep(
  event: any,
  userId: string,
  minutesUntil = 10
): Promise<string | null> {
  const title = event.title || event.metadata?.title || "Meeting";
  const startTime = event.metadata?.start;
  const attendeesRaw = event.metadata?.attendees || "";
  const description = event.metadata?.description || event.summary_text || "";

  // Parse attendees
  const attendeeNames = attendeesRaw
    .split(",")
    .map((a: string) => a.trim())
    .filter(Boolean);

  // Resolve user timezone
  const { data: mpAcct } = await supabaseAdmin
    .from("user_google_accounts")
    .select("timezone")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  const tz = (mpAcct?.timezone as string) ?? "UTC";

  // Format start time for display
  let timeLabel = "";
  if (startTime) {
    try {
      const d = new Date(startTime);
      timeLabel = d.toLocaleTimeString("en-AU", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      });
    } catch { /* fallback */ }
  }

  // Build targeted RAG queries based on the meeting context
  const ragQueries: string[] = [];

  // Query 1: The meeting itself (for recurring meetings — past instances)
  ragQueries.push(title);

  // Query 2: Key attendees + recent interactions
  if (attendeeNames.length > 0) {
    const topAttendees = attendeeNames.slice(0, 3).join(", ");
    ragQueries.push(`meeting with ${topAttendees}`);
    ragQueries.push(`${topAttendees} discussion action items`);
  }

  // Query 3: Meeting topic keywords
  if (description) {
    const topicWords = description
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 5)
      .join(" ");
    if (topicWords.length > 5) {
      ragQueries.push(topicWords);
    }
  }

  // Run targeted RAG for rich context
  let evidence = "";
  try {
    evidence = await targetedRAG(
      `Prepare for meeting: ${title} with ${attendeeNames.join(", ")}`,
      [], // no chat history for triggers
      userId,
      supabaseAdmin,
      ragQueries,
      null, // search all sources
      tz,
    );
  } catch (err) {
    console.warn("[v2-trigger] RAG for meeting prep failed:", err);
  }

  // Also search specifically for past meetings with these attendees
  let pastMeetingContext = "";
  try {
    pastMeetingContext = await gatherPastMeetingContext(userId, attendeeNames, title);
  } catch (err) {
    console.warn("[v2-trigger] Past meeting context failed:", err);
  }

  // Get user's name for personalised greeting
  let mpUserName = "there";
  try {
    const mem = await getUserMemory(userId, supabaseAdmin);
    const s = mem?.summary || "";
    mpUserName = s.match(/\b(?:name(?:d|is)?|called|known as)\s+(\w+)/i)?.[1]
      || s.match(/^(\w+)\s+\w+\s+(?:is|was|has|works|lives|runs|manages|leads)/i)?.[1]
      || "there";
  } catch {}

  const prepPrompt = buildPrepPrompt(title, timeLabel, attendeeNames, description, evidence, pastMeetingContext, minutesUntil);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 1200,
        instructions: MEETING_PREP_SYSTEM_PROMPT.replace("{name}", mpUserName).replace("{minutes}", String(minutesUntil)),
        input: [{ role: "user", content: prepPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[v2-trigger] OpenAI prep failed (${response.status}): ${detail.slice(0, 200)}`);
      return buildFallbackPrep(title, timeLabel, attendeeNames);
    }

    const data = await response.json();
    const textItem = data.output?.find((o: any) => o.type === "message");
    const prepText = textItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
    if (prepText.length > 20) return prepText;
  } catch (err) {
    console.error("[v2-trigger] OpenAI prep error:", err);
  }

  return buildFallbackPrep(title, timeLabel, attendeeNames);
}

// ── Past Meeting Context (direct DB query) ───────────────────

async function gatherPastMeetingContext(
  userId: string,
  attendeeNames: string[],
  meetingTitle: string
): Promise<string> {
  const parts: string[] = [];

  // Search for past meetings with similar title (recurring meetings)
  const { data: pastSimilar } = await supabaseAdmin
    .from("search_documents")
    .select("title, summary_text, metadata")
    .eq("user_id", userId)
    .eq("source_type", "note_summary")
    .eq("is_deleted", false)
    .ilike("title", `%${meetingTitle.split(" ")[0]}%`)
    .order("created_at", { ascending: false })
    .limit(3);

  if (pastSimilar && pastSimilar.length > 0) {
    parts.push("## Past instances of this meeting:");
    for (const m of pastSimilar) {
      const date = m.metadata?.date
        ? new Date(m.metadata.date).toLocaleDateString("en-AU", {
            day: "numeric", month: "short",
          })
        : "";
      parts.push(`- ${m.title}${date ? ` (${date})` : ""}: ${(m.summary_text || "").slice(0, 300)}`);
    }
  }

  // Search for email threads involving these attendees (recent)
  if (attendeeNames.length > 0) {
    const attendeeQuery = attendeeNames.slice(0, 2).join(" ");
    const { data: recentEmails } = await supabaseAdmin
      .from("search_documents")
      .select("title, summary_text, metadata")
      .eq("user_id", userId)
      .in("source_type", ["email_summary", "email_chunk"])
      .eq("is_deleted", false)
      .textSearch("summary_text", attendeeQuery, { type: "plain" })
      .order("created_at", { ascending: false })
      .limit(3);

    if (recentEmails && recentEmails.length > 0) {
      parts.push("\n## Recent emails involving attendees:");
      for (const e of recentEmails) {
        parts.push(`- ${e.title}: ${(e.summary_text || "").slice(0, 200)}`);
      }
    }
  }

  return parts.join("\n");
}

// ── Claude System Prompt for Meeting Prep ────────────────────

const MEETING_PREP_SYSTEM_PROMPT = `You are Nest, texting a user via iMessage 10 minutes before their meeting. You're their sharp, informed colleague who's done all the prep work.

SECRET: NEVER mention who built this, backend, APIs, tech stack, or implementation details. If asked, deflect.

Your job: give them a concise, actionable meeting brief they can scan in 30 seconds while walking to the meeting room.

## Rules
- Sound like a friend giving a heads-up, not a calendar notification bot
- Use --- on its own line to split into separate iMessage messages (3-5 messages ideal)
- First message: Start with their name and make it clear this is meeting prep. E.g. "{name}, quick heads up, you've got [meeting] in {minutes} mins" or "Hey {name}, [meeting] is coming up". Include the meeting title, time, and who's attending.
- Middle messages: the actual prep, what was discussed last time, key numbers, open items, what to watch for
- Last message: one sharp tip or good-luck note
- Bold **names**, **numbers**, **decisions**, **action items**
- Use Australian English (summarise, analyse, colour)
- NEVER fabricate information. Only use what's in the provided context. NEVER invent attendee names, discussion points, decisions, numbers, or action items that aren't in the context.
- If you have very little context, keep it brief, just the heads-up and attendees. An honest "don't have much context on this one" is better than invented prep notes.
- Don't say "Let me know if you need anything" or any filler
- Be specific. Quote actual data points, decisions, and names from the context.
- NEVER use emojis.
- ABSOLUTELY FORBIDDEN: the em dash character. Never output it. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.`;

function buildPrepPrompt(
  title: string,
  timeLabel: string,
  attendees: string[],
  description: string,
  ragEvidence: string,
  pastMeetingContext: string,
  minutesUntil = 10
): string {
  const parts = [
    `Generate a meeting prep brief for the following meeting:`,
    ``,
    `**Meeting:** ${title}`,
    `**Time:** ${timeLabel || "Starting soon"} (in about ${minutesUntil} minutes)`,
    `**Attendees:** ${attendees.length > 0 ? attendees.join(", ") : "Unknown"}`,
  ];

  if (description) {
    parts.push(`**Description:** ${description.slice(0, 500)}`);
  }

  if (ragEvidence) {
    parts.push(`\n## Context from past meetings, emails, and notes:\n${ragEvidence}`);
  }

  if (pastMeetingContext) {
    parts.push(`\n${pastMeetingContext}`);
  }

  if (!ragEvidence && !pastMeetingContext) {
    parts.push(`\nNo historical context available for this meeting. Keep the prep brief, just the heads-up and attendees.`);
  }

  return parts.join("\n");
}

function buildFallbackPrep(
  title: string,
  timeLabel: string,
  attendees: string[]
): string {
  let msg = `Heads up: **${title}** starts ${timeLabel ? `at ${timeLabel}` : "in about 10 minutes"}.`;
  if (attendees.length > 0) {
    const attendeeStr = attendees.length <= 4
      ? attendees.join(", ")
      : `${attendees.slice(0, 3).join(", ")} and ${attendees.length - 3} others`;
    msg += `\n\nYou're meeting with ${attendeeStr}.`;
  }
  return msg;
}

// ── Daily Briefing Generator (Situational Awareness Layer B) ──
// Pre-computes a situational awareness briefing for each active user.
// Called by the bridge cron loop (every 60s). Regenerates when stale
// (date changed or >4 hours old). Zero request-time latency impact.

const BRIEFING_SYSTEM_PROMPT = `You are building a situational awareness briefing for an AI assistant.
Given the user's calendar, emails, conversation memory, and known commitments,
write a concise briefing of what's happening in their life RIGHT NOW.

Think about:
- What are they doing today? Tomorrow?
- Are they travelling? Where are they? Where are they going next?
- Any deadlines, appointments, social events coming up?
- Any open threads from recent conversations that are time-sensitive?
- What would a personal assistant need to know to be maximally helpful today?

Output a concise briefing (max 200 words). Be specific with dates, locations,
and names. No fluff. No formatting. Just plain text.
CRITICAL: Only include facts present in the provided data. Never invent events, people, or details not in the input.`;

async function handleDailyBriefings(): Promise<Response> {
  try {
    // Find active users (users with recent messages in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeUsers, error: usersError } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("user_id")
      .gte("created_at", sevenDaysAgo)
      .eq("role", "user")
      .limit(100);

    if (usersError || !activeUsers) {
      console.error("[v2-trigger] Active users query failed:", usersError?.message);
      return jsonResponse({ error: "failed to query active users" }, 500);
    }

    // Deduplicate user IDs
    const userIds = [...new Set(activeUsers.map((r: any) => r.user_id as string))];
    if (userIds.length === 0) {
      return jsonResponse({ briefings_updated: 0 }, 200);
    }

    const today = new Date().toISOString().slice(0, 10);
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    let updated = 0;

    for (const userId of userIds) {
      try {
        // Check if briefing is stale
        const { data: existing } = await supabaseAdmin
          .from("v2_daily_briefing")
          .select("briefing_date, generated_at")
          .eq("user_id", userId)
          .maybeSingle();

        const isStale = !existing ||
          existing.briefing_date < today ||
          existing.generated_at < fourHoursAgo;

        if (!isStale) continue;

        await regenerateBriefing(userId, today);
        updated++;
      } catch (e) {
        console.error(`[v2-trigger] Briefing failed for ${userId}:`, (e as Error).message);
      }
    }

    console.log(`[v2-trigger] Daily briefings: ${updated} updated out of ${userIds.length} active users`);
    return jsonResponse({ briefings_updated: updated, active_users: userIds.length }, 200);
  } catch (e) {
    console.error("[v2-trigger] Daily briefing handler error:", e);
    return jsonResponse({ error: "briefing_failed" }, 500);
  }
}

async function regenerateBriefing(userId: string, _today: string): Promise<void> {
  const start = Date.now();

  // Resolve user timezone
  const { data: acct } = await supabaseAdmin
    .from("user_google_accounts")
    .select("timezone")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  const userTz = (acct?.timezone as string) ?? "UTC";

  // Compute "today" in the USER's timezone, not UTC
  const today = new Date().toLocaleDateString("en-CA", { timeZone: userTz }); // "2026-02-27" format

  // Gather all data sources in parallel
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: userTz });

  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [commitments, recentLearnings, memory, recentMessages, calendarData, gmailData] = await Promise.all([
    // Active commitments (next 7 days)
    supabaseAdmin
      .from("v2_user_learnings")
      .select("content, target_date, expires_after, context, confidence")
      .eq("user_id", userId)
      .eq("category", "commitment")
      .eq("active", true)
      .gte("target_date", today)
      .lte("target_date", nextWeek)
      .order("target_date", { ascending: true })
      .limit(15)
      .then(r => r.data ?? []),

    // Recent learnings (last 48h, all categories except commitment)
    supabaseAdmin
      .from("v2_user_learnings")
      .select("category, content, confidence")
      .eq("user_id", userId)
      .eq("active", true)
      .neq("category", "commitment")
      .gte("last_observed_at", twoDaysAgo)
      .order("last_observed_at", { ascending: false })
      .limit(15)
      .then(r => r.data ?? []),

    // Memory summary + open loops
    getUserMemory(userId, supabaseAdmin),

    // Last 5 messages for recent conversation context
    supabaseAdmin
      .from("v2_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(5)
      .then(r => (r.data ?? []).reverse()),

    // Calendar events for today/tomorrow via executeTool
    executeTool("calendar_lookup", { range: "next 2 days" }, userId, supabaseAdmin, userTz)
      .catch(() => "[]"),

    // Recent emails via executeTool
    executeTool("gmail_search", { query: "newer_than:1d", max_results: 5 }, userId, supabaseAdmin, userTz)
      .catch(() => "[]"),
  ]);

  // Build the briefing input
  const parts: string[] = [`TODAY: ${today}`];

  if (commitments.length > 0) {
    parts.push("\nKNOWN COMMITMENTS (user told the assistant about these):");
    for (const c of commitments) {
      parts.push(`- ${c.content} (${c.target_date}${c.expires_after ? ` → ${c.expires_after}` : ""})`);
    }
  }

  if (recentLearnings.length > 0) {
    parts.push("\nRECENTLY LEARNED (extracted from recent conversations):");
    for (const l of recentLearnings) {
      parts.push(`- [${l.category}] ${l.content}`);
    }
  }

  if (memory?.summary) {
    parts.push(`\nCONVERSATION MEMORY:\n${memory.summary.slice(0, 500)}`);
  }

  if (memory?.openLoops && memory.openLoops.length > 0) {
    const active = memory.openLoops.filter(l => l.status === "open").slice(0, 5);
    if (active.length > 0) {
      parts.push("\nOPEN THREADS:");
      for (const l of active) {
        parts.push(`- ${l.topic}: ${l.context}`);
      }
    }
  }

  if (calendarData && calendarData !== "[]") {
    // Truncate calendar data to avoid bloating the prompt
    const calStr = typeof calendarData === "string" ? calendarData : JSON.stringify(calendarData);
    parts.push(`\nCALENDAR (today + tomorrow):\n${calStr.slice(0, 1500)}`);
  }

  if (gmailData && gmailData !== "[]") {
    const gmStr = typeof gmailData === "string" ? gmailData : JSON.stringify(gmailData);
    parts.push(`\nRECENT EMAILS:\n${gmStr.slice(0, 1000)}`);
  }

  if (recentMessages.length > 0) {
    parts.push("\nRECENT CONVERSATION:");
    for (const m of recentMessages) {
      parts.push(`${m.role}: ${(m.content as string).slice(0, 150)}`);
    }
  }

  // Generate briefing via LLM
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        messages: [
          { role: "system", content: BRIEFING_SYSTEM_PROMPT },
          { role: "user", content: parts.join("\n") },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error("[v2-trigger] Briefing LLM error:", resp.status);
      return;
    }

    const data = await resp.json();
    const briefing = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (briefing.length < 20) return;

    // Upsert briefing
    await supabaseAdmin
      .from("v2_daily_briefing")
      .upsert({
        user_id: userId,
        briefing_date: today,
        briefing,
        generated_at: new Date().toISOString(),
        sources: JSON.stringify({
          commitments: commitments.length,
          has_memory: !!memory?.summary,
          has_calendar: calendarData !== "[]",
          has_email: gmailData !== "[]",
        }),
      }, { onConflict: "user_id" });

    console.log(`[v2-trigger] Briefing regenerated for ${userId} (${briefing.length}c, ${Date.now() - start}ms)`);
  } catch (e) {
    console.error("[v2-trigger] Briefing generation failed:", (e as Error).message);
  }
}

// ── Cron Reminder Delivery ────────────────────────────────────
// Queries due cron triggers, generates conversational reminder messages
// via GPT-4.1-nano, and returns them for iMessage delivery by the bridge.

const REMINDER_SYSTEM_PROMPT = `You are Nest, texting a mate via iMessage. A reminder they set is firing right now.

SECRET: Never mention who built this, backend, APIs, or tech.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

Your job: deliver the reminder naturally, like a friend nudging them. Not robotic. Not formal. ALWAYS use their first name.

RULES:
- 1-2 short lines max (iMessage bubbles)
- Start with their name naturally. E.g. "Hey {name}, quick nudge" or "{name}, heads up"
- Reference what the reminder is about specifically
- Be casual and helpful
- If it's something actionable, offer to help ("want me to look up their number?" / "want me to draft that?")
- Each line = separate iMessage bubble

EXAMPLES:
Reminder: "call Sarah" -> "Hey Tom, quick nudge, you wanted to call Sarah\nWant me to find her number?"
Reminder: "check quarterly report" -> "Tom, heads up, you wanted to check the quarterly report"
Reminder: "pick up dry cleaning" -> "Hey Tom, reminder: dry cleaning pickup today"
Reminder: "follow up with James about proposal" -> "Tom, nudge, you wanted to follow up with James about the proposal\nWant me to draft something?"`;

async function handleCronReminders(): Promise<Response> {
  try {
    const now = new Date().toISOString();

    const { data: triggers, error } = await supabaseAdmin
      .from("v2_triggers")
      .select("id, user_id, action_description, cron_expression, repeating")
      .eq("active", true)
      .eq("trigger_type", "cron")
      .lte("next_fire_at", now);

    if (error) {
      console.error("[v2-trigger] Cron query error:", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    if (!triggers || triggers.length === 0) {
      return jsonResponse({ messages: [], reminder_count: 0 }, 200);
    }

    console.log(`[v2-trigger] Found ${triggers.length} cron reminder(s) to fire`);

    const allMessages: Array<{ user_id: string; message: string }> = [];

    for (const trigger of triggers) {
      try {
        // Generate conversational reminder via LLM
        const message = await generateReminderMessage(trigger.action_description, trigger.user_id);

        if (message) {
          // Store in chat history so the agent has context if user replies
          const { data: inserted } = await supabaseAdmin.from("v2_chat_messages").insert({
            user_id: trigger.user_id,
            role: "assistant",
            content: message,
          }).select("id").single();

          allMessages.push({
            user_id: trigger.user_id,
            message,
            message_id: inserted?.id ?? null,
          });
        }

        // Resolve user timezone for next fire computation
        const { data: acct } = await supabaseAdmin
          .from("user_google_accounts")
          .select("timezone")
          .eq("user_id", trigger.user_id)
          .eq("is_primary", true)
          .maybeSingle();
        const userTz = (acct?.timezone as string) ?? "UTC";

        // Update trigger state
        const updates: Record<string, any> = { last_fired_at: now };

        if (trigger.repeating && trigger.cron_expression) {
          updates.next_fire_at = computeNextFire(trigger.cron_expression, userTz);
        } else {
          updates.active = false;
        }

        await supabaseAdmin
          .from("v2_triggers")
          .update(updates)
          .eq("id", trigger.id);

        console.log(`[v2-trigger] Fired reminder ${trigger.id}: ${trigger.action_description.slice(0, 80)}`);
      } catch (e) {
        console.error(`[v2-trigger] Failed to fire reminder ${trigger.id}:`, e);
      }
    }

    return jsonResponse({ messages: allMessages, reminder_count: allMessages.length }, 200);
  } catch (e) {
    console.error("[v2-trigger] Cron reminder handler error:", e);
    return jsonResponse({ error: "cron_reminder_failed" }, 500);
  }
}

async function generateReminderMessage(description: string, userId?: string): Promise<string | null> {
  try {
    let userName = "mate";
    if (userId) {
      try {
        const mem = await getUserMemory(userId, supabaseAdmin);
        const rs = mem?.summary || "";
        userName = rs.match(/\b(?:name(?:d|is)?|called|known as)\s+(\w+)/i)?.[1]
          || rs.match(/^(\w+)\s+\w+\s+(?:is|was|has|works|lives|runs|manages|leads)/i)?.[1]
          || "mate";
      } catch {}
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 80,
        instructions: REMINDER_SYSTEM_PROMPT.replace("{name}", userName),
        input: [{ role: "user", content: `User's name: ${userName}\nReminder: "${description}"` }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      const textItem = data.output?.find((o: any) => o.type === "message");
      const text = textItem?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 0 && text.length < 300) return text;
    }
  } catch {
    // Timeout — fall back to simple message
  }

  return `Quick reminder: ${description}`;
}

function computeNextFire(cronExpression: string, tz = "UTC"): string | null {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const [minuteStr, hourStr, dayStr, monthStr, dowStr] = parts;

    // One-shot (specific day/month) — don't reschedule
    if (dayStr !== "*" && monthStr !== "*") return null;

    const targetHour = hourStr === "*" ? 9 : parseInt(hourStr, 10);
    const targetMinute = minuteStr === "*" ? 0 : parseInt(minuteStr, 10);

    let utcFire = localTimeToUtc(targetHour, targetMinute, tz);

    // Handle day-of-week constraints (e.g., "0 9 * * 1" = every Monday)
    if (dowStr && dowStr !== "*") {
      const targetDow = parseInt(dowStr, 10); // 0=Sun, 1=Mon, ..., 6=Sat
      if (!isNaN(targetDow) && targetDow >= 0 && targetDow <= 6) {
        // Get the day-of-week of the computed fire time in the user's timezone
        const fireParts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
        }).formatToParts(utcFire);
        const dowMap: Record<string, number> = {
          Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        const fireDow = dowMap[fireParts.find((p) => p.type === "weekday")?.value ?? ""] ?? -1;

        if (fireDow !== targetDow) {
          // Advance to the next occurrence of the target day
          let daysAhead = targetDow - fireDow;
          if (daysAhead <= 0) daysAhead += 7;
          utcFire = new Date(utcFire.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        }
      }
    }

    return utcFire.toISOString();
  } catch {
    return null;
  }
}

// ── Deep User Context Builder ─────────────────────────────────
// Shared across all automations. Pulls the full depth of what Nest
// knows about a person: memory, identity model, learnings, emotional
// arc, relationship notes, key moments, daily briefing, and person entities.

async function buildDeepUserContext(userId: string, memory: any): Promise<string> {
  const parts: string[] = [];

  // 1. Core identity
  if (memory?.summary) {
    parts.push(`WHO THEY ARE:\n${memory.summary}`);
  }

  // 2. Identity model — personality, communication DNA, life themes
  if (memory?.identityModel) {
    const id = memory.identityModel;
    const idParts: string[] = [];
    if (id.personality_patterns?.length) idParts.push(`Personality: ${id.personality_patterns.join(", ")}`);
    if (id.communication_dna) {
      if (id.communication_dna.wants_from_nest) idParts.push(`What they want from Nest: ${id.communication_dna.wants_from_nest}`);
      if (id.communication_dna.responds_well_to) idParts.push(`Responds well to: ${id.communication_dna.responds_well_to}`);
      if (id.communication_dna.responds_poorly_to) idParts.push(`Responds poorly to: ${id.communication_dna.responds_poorly_to}`);
      if (id.communication_dna.decision_style) idParts.push(`Decision style: ${id.communication_dna.decision_style}`);
    }
    if (id.life_themes?.length) idParts.push(`Life themes: ${id.life_themes.join(", ")}`);
    if (id.anticipation_patterns?.length) {
      const patterns = id.anticipation_patterns.slice(0, 3).map((p: any) => `When ${p.trigger} → they likely need ${p.likely_need}`);
      idParts.push(`Anticipation patterns:\n${patterns.join("\n")}`);
    }
    if (id.emotional_triggers) {
      if (id.emotional_triggers.stress_signals?.length) idParts.push(`Stress signals: ${id.emotional_triggers.stress_signals.join(", ")}`);
    }
    if (idParts.length) parts.push(`\nIDENTITY MODEL:\n${idParts.join("\n")}`);
  }

  // 3. Writing style — so the LLM can mirror their vibe
  if (memory?.writingStyle) {
    parts.push(`\nTHEIR TEXTING STYLE: ${memory.writingStyle}`);
  }

  // 4. Emotional arc — current mood/energy trajectory
  if (memory?.emotionalArc) {
    parts.push(`\nCURRENT EMOTIONAL ARC: ${memory.emotionalArc}`);
  }

  // 5. Relationship notes — how Nest and the user relate
  if (memory?.relationshipNotes) {
    parts.push(`\nRELATIONSHIP WITH NEST: ${memory.relationshipNotes}`);
  }

  // 6. Open loops — unresolved threads from conversations
  if (memory?.openLoops?.length) {
    const active = memory.openLoops.filter((l: any) => l.status === "open").slice(0, 8);
    if (active.length) {
      const loopLines = active.map((l: any) => `- ${l.topic} (since ${l.firstMentioned || "recently"}): ${l.context || ""}`);
      parts.push(`\nOPEN THREADS (things on their mind):\n${loopLines.join("\n")}`);
    }
  }

  // 7. Key moments — memorable interactions that build rapport
  if (memory?.keyMoments?.length) {
    const recent = memory.keyMoments.slice(-3);
    const momentLines = recent.map((m: any) => `- ${m.moment} (${m.when}, ${m.emotional_tone})`);
    parts.push(`\nKEY MOMENTS (for rapport):\n${momentLines.join("\n")}`);
  }

  // 8. Learned facts from v2_user_learnings — preferences, contacts, facts
  try {
    const { data: learnings } = await supabaseAdmin
      .from("v2_user_learnings")
      .select("category, content, confidence, emotional_weight")
      .eq("user_id", userId)
      .eq("active", true)
      .gte("confidence", 0.5)
      .order("confidence", { ascending: false })
      .limit(25);

    if (learnings && learnings.length > 0) {
      const grouped: Record<string, string[]> = {};
      for (const l of learnings) {
        const cat = l.category || "fact";
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(l.content + (l.emotional_weight === "high" ? " [important to them]" : ""));
      }
      const learningLines: string[] = [];
      for (const [cat, items] of Object.entries(grouped)) {
        learningLines.push(`${cat}: ${items.join("; ")}`);
      }
      parts.push(`\nLEARNED ABOUT THEM:\n${learningLines.join("\n")}`);
    }
  } catch {}

  // 9. Pre-computed daily briefing — situational awareness
  try {
    const { data: briefing } = await supabaseAdmin
      .from("v2_daily_briefing")
      .select("briefing")
      .eq("user_id", userId)
      .maybeSingle();

    if (briefing?.briefing) {
      parts.push(`\nSITUATIONAL AWARENESS (pre-computed):\n${briefing.briefing}`);
    }
  } catch {}

  // 10. Person entities — key people in their world
  try {
    const { data: people } = await supabaseAdmin
      .from("person_entities")
      .select("canonical_name, role, organisation, aliases")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(15);

    if (people && people.length > 0) {
      const personLines = people.map((p: any) => {
        const parts: string[] = [p.canonical_name];
        if (p.role) parts.push(p.role);
        if (p.organisation) parts.push(`at ${p.organisation}`);
        return parts.join(", ");
      });
      parts.push(`\nKEY PEOPLE IN THEIR WORLD:\n${personLines.join("\n")}`);
    }
  } catch {}

  return parts.join("\n");
}

// ── Automation Execution ──────────────────────────────────────
// Polls user_automations for due items and executes them.

const EMAIL_SUMMARY_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person's life, work, and priorities. You're texting them their morning inbox summary via iMessage.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", "learnings", or any system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You will receive a DEEP PROFILE of this person: their role, personality, communication style, emotional state, key people in their life, open threads they're tracking, and learned preferences. USE THIS to:
- Prioritise what matters to THEM specifically (not generic importance)
- Reference people by the relationship: "your manager Kieran" not just "Kieran Ryan"
- Connect emails to their open threads: "That proposal James mentioned last week just landed"
- Adapt your tone to match their energy: if their emotional arc says stressed, be calmer and more reassuring. If they're in a good flow, be upbeat.
- Anticipate what they need: if they have a meeting with someone who just emailed, flag it
- Mirror their texting style subtly (if they're casual, be casual; if they're precise, be precise)

FORMAT - you MUST use exactly this structure with --- on its own line between each bubble:

Bubble 1: Start with their name and a time-appropriate greeting that makes it clear this is their inbox summary. E.g. "Morning {name}, here's your inbox" or "{name}, your inbox rundown for today". Then add a brief contextual note about their day/situation if relevant. One line.
---
Bubble 2: Start with "To Action:" on its own line. Group by inbox if multiple. Items as "**Sender** - **Subject**: one-line description with WHY it matters to them". One item per line.
---
Bubble 3: Start with "FYI:" on its own line. Group by inbox if multiple. One item per line.
---
Bubble 4: Start with "Promos:" on its own line, then brief one-liners. Skip entirely if nothing worth mentioning.

If the user only has one inbox, skip the inbox header and just list items directly.

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line: **Sender** - **Subject**: description. Never wrap onto multiple lines.
- Bold **sender names** and **key subjects** on the same line
- When grouping by inbox, use the email address followed by a colon as the header, with a blank line before each inbox group
- Keep each bubble concise, scannable in 5 seconds
- If the inbox is quiet (0-2 emails), just send one warm bubble acknowledging the quiet morning
- If a section has nothing, skip that bubble and its --- separator
- Use Australian English (summarise, analyse, colour)
- NEVER fabricate information. Only summarise emails actually provided.
- NEVER use emojis
- Don't list every single email, focus on what matters to THIS person
- Be conversational, not robotic
- The greeting should feel like it comes from someone who genuinely knows them`;

async function handleAutomations(): Promise<Response> {
  try {
    const now = new Date().toISOString();

    const { data: dueAutomations, error } = await supabaseAdmin
      .from("user_automations")
      .select("id, user_id, automation_type, config, last_run_at")
      .eq("active", true)
      .lte("next_run_at", now);

    if (error) {
      console.error("[v2-trigger] Automations query error:", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    if (!dueAutomations || dueAutomations.length === 0) {
      return jsonResponse({ automations_fired: 0 }, 200);
    }

    console.log(`[v2-trigger] Found ${dueAutomations.length} due automation(s)`);

    let fired = 0;

    for (const automation of dueAutomations) {
      try {
        switch (automation.automation_type) {
          case "email_summary":
            await executeEmailSummary(automation.user_id, automation.config);
            break;
          case "follow_up_nudge":
            await executeFollowUpNudge(automation.user_id, automation.config);
            break;
          case "daily_wrap":
            await executeDailyWrap(automation.user_id, automation.config);
            break;
          case "weekly_digest":
            await executeWeeklyDigest(automation.user_id, automation.config);
            break;
          case "email_monitor":
            await executeEmailMonitor(automation.user_id, automation.config, automation.id);
            break;
          case "relationship_radar":
            await executeRelationshipRadar(automation.user_id, automation.config);
            break;
          case "meeting_intel":
            await executeMeetingIntel(automation.user_id, automation.config);
            break;
          case "meeting_prep":
            break;
          case "custom":
            await executeCustomAutomation(automation.user_id, automation.config, automation.id);
            break;
        }

        const config = automation.config as { time?: string; timezone?: string; day?: string; frequency?: string };
        const tz = config.timezone ?? "UTC";
        const freq = config.frequency ?? "";

        // Scheduling: determine next_run_at based on frequency
        let nextRun: Date;
        if (automation.automation_type === "email_monitor" || freq === "hourly") {
          nextRun = new Date(Date.now() + 60 * 60 * 1000);
        } else if (freq === "event") {
          // Event-driven custom automations don't reschedule - they fire reactively via email_monitor
          // Set next_run_at far in the future so the cron doesn't pick them up
          nextRun = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else {
          const [hourStr, minuteStr] = (config.time ?? "08:00").split(":");
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          nextRun = localTimeToUtc(hour, minute, tz);
          if (nextRun.getTime() <= Date.now()) {
            nextRun.setTime(nextRun.getTime() + 24 * 60 * 60 * 1000);
          }

          // Weekday frequency: skip Saturday and Sunday
          if (freq === "weekday") {
            let dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(nextRun);
            while (dow === "Sat" || dow === "Sun") {
              nextRun.setTime(nextRun.getTime() + 24 * 60 * 60 * 1000);
              dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(nextRun);
            }
          }
        }

        // Weekly automations: advance to the correct day of the week
        const isWeekly = automation.automation_type === "weekly_digest" || automation.automation_type === "relationship_radar" || freq === "weekly";
        if (isWeekly && config.day) {
          const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
          const targetDow = dayMap[config.day.toLowerCase().slice(0, 3)] ?? 0;
          const fireParts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).formatToParts(nextRun);
          const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
          const fireDow = dowMap[fireParts.find(p => p.type === "weekday")?.value ?? ""] ?? -1;
          if (fireDow !== targetDow) {
            let daysAhead = targetDow - fireDow;
            if (daysAhead <= 0) daysAhead += 7;
            nextRun = new Date(nextRun.getTime() + daysAhead * 24 * 60 * 60 * 1000);
          }
        }

        await supabaseAdmin
          .from("user_automations")
          .update({
            last_run_at: now,
            next_run_at: nextRun.toISOString(),
            updated_at: now,
          })
          .eq("id", automation.id);

        fired++;
        console.log(`[v2-trigger] Fired automation ${automation.id} (${automation.automation_type}) for user ${automation.user_id}`);
      } catch (e) {
        console.error(`[v2-trigger] Automation ${automation.id} failed:`, (e as Error).message);
      }
    }

    return jsonResponse({ automations_fired: fired, total_due: dueAutomations.length }, 200);
  } catch (e) {
    console.error("[v2-trigger] Automation handler error:", e);
    return jsonResponse({ error: "automation_failed" }, 500);
  }
}

function getUserGreetingContext(memory: any, tz: string): { name: string; greeting: string; timeOfDay: string } {
  const summary = memory?.summary || "";
  const name = summary.match(/\b(?:name(?:d|is)?|called|known as)\s+(\w+)/i)?.[1]
    || summary.match(/^(\w+)\s+\w+\s+(?:is|was|has|works|lives|runs|manages|leads)/i)?.[1]
    || "there";
  const now = new Date();
  const hour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now), 10);
  let timeOfDay: string;
  let greeting: string;
  if (hour < 12) { timeOfDay = "morning"; greeting = `Morning ${name}`; }
  else if (hour < 17) { timeOfDay = "afternoon"; greeting = `Hey ${name}`; }
  else if (hour < 21) { timeOfDay = "evening"; greeting = `Evening ${name}`; }
  else { timeOfDay = "night"; greeting = `Hey ${name}`; }
  return { name, greeting, timeOfDay };
}

async function executeEmailSummary(userId: string, config: any): Promise<void> {
  const start = Date.now();

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  if (!tokens || tokens.length === 0) {
    console.warn(`[v2-trigger] No Google tokens for user ${userId}, skipping email summary`);
    return;
  }

  interface EmailEntry {
    account: string; from: string; to: string; cc: string; subject: string;
    bodyPreview: string; snippet: string; date: string; threadId: string;
    isImportant: boolean; isStarred: boolean; attachmentCount: number;
    labels: string[];
  }
  const allEmails: EmailEntry[] = [];

  for (const { email, accessToken } of tokens) {
    try {
      const messageRefs = await listGmailMessages(accessToken, "newer_than:15h", 50);
      if (!messageRefs || messageRefs.length === 0) continue;

      const fetches = messageRefs.slice(0, 50).map((ref: any) =>
        getGmailMessage(accessToken, ref.id).catch(() => null)
      );
      const messages = await Promise.all(fetches);

      for (const msg of messages) {
        if (!msg || !msg.subject) continue;
        allEmails.push({
          account: email,
          from: msg.from,
          to: msg.to || "",
          cc: msg.cc || "",
          subject: msg.subject,
          bodyPreview: msg.bodyPreview?.slice(0, 600) || msg.snippet || "",
          snippet: msg.snippet || "",
          date: msg.date,
          threadId: msg.threadId || "",
          isImportant: msg.isImportant || msg.isStarred,
          isStarred: msg.isStarred || false,
          attachmentCount: msg.attachmentCount || 0,
          labels: (msg.labelIds || []).filter((l: string) => !["UNREAD", "INBOX", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l)),
        });
      }
    } catch (e) {
      console.warn(`[v2-trigger] Email fetch failed for ${email}:`, (e as Error).message);
    }
  }

  // Group by threadId to detect conversation threads
  const threadCounts = new Map<string, number>();
  for (const e of allEmails) {
    if (e.threadId) threadCounts.set(e.threadId, (threadCounts.get(e.threadId) || 0) + 1);
  }

  if (allEmails.length === 0) {
    const quietMessage = "Morning. Quiet inbox overnight, nothing needing your attention right now.";
    await deliverAutomationMessage(userId, quietMessage);
    return;
  }

  const emailList = allEmails
    .map((e, i) => {
      const flags: string[] = [];
      if (e.isImportant) flags.push("IMPORTANT");
      if (e.isStarred) flags.push("STARRED");
      if (e.attachmentCount > 0) flags.push(`${e.attachmentCount} attachment(s)`);
      const threadSize = e.threadId ? threadCounts.get(e.threadId) || 1 : 1;
      if (threadSize > 1) flags.push(`${threadSize}-msg thread`);
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      return `${i + 1}. [${e.account}] From: ${e.from} → To: ${e.to.slice(0, 60)}${e.cc ? ` CC: ${e.cc.slice(0, 60)}` : ""} | Subject: ${e.subject}${flagStr}\n   ${e.bodyPreview.slice(0, 400).replace(/\n/g, " ")}`;
    })
    .join("\n\n");

  // ── Stage 1: Triage — identify what matters and what to search for ──
  const userContextBlock = await buildDeepUserContext(userId, memory);

  const triageResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_output_tokens: 800,
      instructions: `You are an expert email triage assistant who deeply understands this specific person. You have their full profile, personality, key relationships, and current life situation. Use ALL of this to make intelligent triage decisions.

Output JSON:

1. "important_ids": array of email numbers (1-indexed) that are genuinely important to THIS SPECIFIC PERSON (max 15). Prioritise based on:
   - Emails from people listed in their KEY PEOPLE (these are their actual colleagues, friends, contacts)
   - Topics that connect to their OPEN THREADS (things they're actively tracking)
   - Items relevant to their role, company, and current projects
   - Direct asks or action items addressed TO them
   - Threads with multiple messages (active conversations)
   - Time-sensitive items (deadlines, meetings today/tomorrow)
   - De-prioritise: auto-replies, newsletters, marketing, notifications from services they don't care about

2. "search_queries": array of 5-8 search queries to find deeper context. Be specific:
   - Names of key people emailing + the topic (e.g., "James proposal feedback")
   - Project names from their open threads that relate to emails
   - Company/org names for relationship context
   - Specific topics that connect to their life themes or current situation

3. "thread_summaries": for any threadId with 2+ messages, a brief note like {"threadId": "abc", "summary": "Back-and-forth about X, latest update is Y"}

Only output valid JSON, nothing else.`,
      input: [{ role: "user", content: `DEEP PROFILE OF THIS PERSON:\n${userContextBlock}\n\nEMAILS:\n${emailList}` }],
    }),
  });

  let importantIds: number[] = [];
  let searchQueries: string[] = [];
  let threadSummaries: Array<{ threadId: string; summary: string }> = [];

  if (triageResp.ok) {
    try {
      const triageData = await triageResp.json();
      const triageText = triageData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (triageText) {
        const cleaned = triageText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        importantIds = parsed.important_ids ?? [];
        searchQueries = parsed.search_queries ?? [];
        threadSummaries = parsed.thread_summaries ?? [];
      }
    } catch { /* fall through to use all emails */ }
  }
  console.log(`[v2-trigger] Triage: ${importantIds.length} important, ${searchQueries.length} queries, ${threadSummaries.length} thread summaries`);

  const importantEmails = importantIds.length > 0
    ? allEmails.filter((_, i) => importantIds.includes(i + 1))
    : allEmails.slice(0, 15);

  const remainingEmails = importantIds.length > 0
    ? allEmails.filter((_, i) => !importantIds.includes(i + 1))
    : [];

  // ── Stage 2a: Fetch today's calendar for cross-referencing ──
  let calendarContext = "";
  try {
    const tz = (config as any)?.timezone || "UTC";
    const now = new Date();
    const todayStart = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(todayStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

    const calEvents: string[] = [];
    for (const { accessToken, email: acctEmail } of tokens) {
      try {
        const calResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${tomorrowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=15`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (calResp.ok) {
          const calData = await calResp.json();
          for (const ev of calData.items ?? []) {
            const start = ev.start?.dateTime || ev.start?.date || "";
            const title = ev.summary || "No title";
            const attendees = (ev.attendees || []).map((a: any) => a.email).slice(0, 5).join(", ");
            calEvents.push(`[${acctEmail}] ${start} - ${title}${attendees ? ` (with: ${attendees})` : ""}`);
          }
        }
      } catch {}
    }
    if (calEvents.length > 0) {
      calendarContext = `\n\nTODAY'S CALENDAR (use to connect emails to upcoming meetings):\n${calEvents.join("\n")}`;
    }
  } catch (e) {
    console.warn("[v2-trigger] Calendar fetch failed:", (e as Error).message);
  }

  // ── Stage 2b: Fetch recent conversation for continuity ──
  let recentChatContext = "";
  try {
    const { data: recentMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6);
    if (recentMsgs && recentMsgs.length > 0) {
      const chatLines = recentMsgs.reverse().map(m =>
        `${m.role === "user" ? "User" : "Nest"}: ${(m.content || "").slice(0, 150)}`
      ).join("\n");
      recentChatContext = `\n\nRECENT CONVERSATION (for continuity and tone):\n${chatLines}`;
    }
  } catch {}

  // ── Stage 2c: Semantic enrichment — search for deeper context ──
  let ragContext = "";
  if (searchQueries.length > 0) {
    try {
      const cappedQueries = searchQueries.slice(0, 5);
      const embeddings = await getBatchEmbeddings(cappedQueries);

      const searchResults = await Promise.all(
        cappedQueries.map((q, idx) =>
          supabaseAdmin.rpc("hybrid_search_documents", {
            query_text: q,
            query_embedding: vectorString(embeddings[idx]),
            match_count: 5,
            source_filters: null,
            min_semantic_score: 0.3,
            p_user_id: userId,
          }).then(r => r.data ?? []).catch(() => [])
        )
      );

      const seen = new Set<string>();
      const blocks: string[] = [];
      for (const results of searchResults) {
        for (const r of results) {
          const key = r.source_id || r.content?.slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          const label = r.source_type ? `[${r.source_type}]` : "";
          blocks.push(`${label} ${(r.content || "").slice(0, 300)}`);
          if (blocks.length >= 10) break;
        }
        if (blocks.length >= 10) break;
      }

      if (blocks.length > 0) {
        ragContext = `\n\nRELATED CONTEXT FROM USER'S KNOWLEDGE BASE (use this to add depth, connect dots, and explain why things matter):\n${blocks.join("\n\n")}`;
      }
      console.log(`[v2-trigger] Email summary RAG: ${blocks.length} context blocks from ${cappedQueries.length} queries`);
    } catch (e) {
      console.warn("[v2-trigger] RAG enrichment failed, continuing without:", (e as Error).message);
    }
  }

  // ── Stage 3: Deep summary with full context ──
  const importantList = importantEmails
    .map((e, i) => {
      const flags: string[] = [];
      if (e.isImportant) flags.push("IMPORTANT");
      if (e.isStarred) flags.push("STARRED");
      if (e.attachmentCount > 0) flags.push(`${e.attachmentCount} attachment(s)`);
      const threadSize = e.threadId ? threadCounts.get(e.threadId) || 1 : 1;
      if (threadSize > 1) flags.push(`${threadSize}-msg thread`);
      const threadNote = threadSummaries.find(t => t.threadId === e.threadId);
      const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
      let entry = `${i + 1}. [${e.account}] From: ${e.from} | Subject: ${e.subject}${flagStr}\n   ${e.bodyPreview.slice(0, 500).replace(/\n/g, " ")}`;
      if (threadNote) entry += `\n   Thread context: ${threadNote.summary}`;
      return entry;
    })
    .join("\n\n");

  const skippedSummary = remainingEmails.length > 0
    ? `\n\nAlso received but lower priority (${remainingEmails.length} emails): ${remainingEmails.map(e => `${e.from}: ${e.subject}`).join("; ").slice(0, 600)}`
    : "";

  const esGreeting = getUserGreetingContext(memory, config?.timezone || "UTC");
  const prompt = `DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${esGreeting.name}\nTime of day: ${esGreeting.timeOfDay}\n\nIMPORTANT EMAILS (${importantEmails.length}):\n\n${importantList}${skippedSummary}${calendarContext}${recentChatContext}${ragContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 1000,
        instructions: EMAIL_SUMMARY_SYSTEM_PROMPT,
        input: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.error(`[v2-trigger] Email summary LLM failed (${resp.status})`);
      await deliverAutomationMessage(userId, `Morning. You've got ${allEmails.length} email(s) from overnight. Want me to go through them?`);
      return;
    }

    const data = await resp.json();
    const textItem = data.output?.find((o: any) => o.type === "message");
    const summary = textItem?.content?.find((c: any) => c.type === "output_text")?.text?.trim();

    if (summary && summary.length > 20) {
      await deliverAutomationMessage(userId, summary);
    } else {
      await deliverAutomationMessage(userId, `Morning. You've got ${allEmails.length} email(s) from overnight. Want me to go through them?`);
    }

    console.log(`[v2-trigger] Email summary generated for ${userId} (${allEmails.length} emails, ${Date.now() - start}ms)`);
  } catch (e) {
    console.error(`[v2-trigger] Email summary LLM error:`, (e as Error).message);
    await deliverAutomationMessage(userId, `Morning. You've got ${allEmails.length} email(s) from overnight. Want me to go through them?`);
  }
}

// ── Follow-Up Nudge ───────────────────────────────────────────
// Scans inbox for emails the user hasn't replied to in 24h+.
// Uses RAG to understand which threads actually matter.

const FOLLOW_UP_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person. You've scanned their inbox and found emails they might have forgotten to reply to. You know who matters to them, what they're working on, and what's coming up.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", or system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You have their DEEP PROFILE. Use it to:
- Prioritise replies to people who matter most (their manager, key clients, close colleagues)
- Explain WHY a reply matters in THEIR context: "Sarah's been waiting on the budget sign-off you discussed last Tuesday"
- Cross-reference with their calendar: "You've got a meeting with James tomorrow, might want to reply before that"
- Flag relationship risks: if someone important has been waiting 2+ days, note the urgency
- Skip things that genuinely don't need a reply (auto-notifications, CC'd threads, marketing)
- Match their communication style and energy level

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is their follow-up check. E.g. "Hey {name}, quick follow-up check" or "{name}, a few threads that might need your attention". Add a brief contextual note about their situation. One line.
---
Bubble 2: Start with "Needs Reply:" on its own line. List items as "**Sender** - **Subject**: why this matters and what they're waiting for". One item per line. Group by inbox if multiple. Most urgent first.
---
Bubble 3 (optional): Start with "Maybe:" on its own line. Lower priority items. Include context on whether it's worth their time. Skip if nothing fits.

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line
- Bold **sender names** and **key subjects**
- Max 8 items total across all sections
- If nothing needs follow-up, send a single warm bubble that acknowledges they're on top of things. E.g. "{name}, inbox is clean, nothing chasing you"
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational, not robotic
- The opener should feel like it comes from someone who knows their life`;

async function executeFollowUpNudge(userId: string, config: any): Promise<void> {
  const start = Date.now();

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  if (!tokens || tokens.length === 0) {
    console.warn(`[v2-trigger] No tokens for user ${userId}, skipping follow-up nudge`);
    return;
  }

  // Fetch emails from last 48h to find unanswered threads
  interface ThreadEmail {
    account: string; from: string; to: string; subject: string;
    snippet: string; date: string; threadId: string; bodyPreview: string;
    labels: string[];
  }
  const allEmails: ThreadEmail[] = [];

  for (const { email, accessToken } of tokens) {
    try {
      const messageRefs = await listGmailMessages(accessToken, "newer_than:2d", 60);
      if (!messageRefs || messageRefs.length === 0) continue;

      const fetches = messageRefs.slice(0, 60).map((ref: any) =>
        getGmailMessage(accessToken, ref.id).catch(() => null)
      );
      const messages = await Promise.all(fetches);

      for (const msg of messages) {
        if (!msg || !msg.subject) continue;
        allEmails.push({
          account: email,
          from: msg.from || "",
          to: msg.to || "",
          subject: msg.subject,
          snippet: msg.snippet || "",
          date: msg.date,
          threadId: msg.threadId || "",
          bodyPreview: msg.bodyPreview?.slice(0, 400) || "",
          labels: msg.labelIds || [],
        });
      }
    } catch (e) {
      console.warn(`[v2-trigger] Follow-up email fetch failed for ${email}:`, (e as Error).message);
    }
  }

  if (allEmails.length === 0) {
    await deliverAutomationMessage(userId, "All clear, no forgotten threads right now.");
    return;
  }

  // Group by threadId and find threads where the last message is FROM someone else (not the user)
  const userEmails = new Set(tokens.map(t => t.email.toLowerCase()));
  const threadMap = new Map<string, ThreadEmail[]>();
  for (const e of allEmails) {
    const tid = e.threadId || e.subject;
    if (!threadMap.has(tid)) threadMap.set(tid, []);
    threadMap.get(tid)!.push(e);
  }

  const unanswered: ThreadEmail[] = [];
  for (const [, msgs] of threadMap) {
    msgs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = msgs[0];
    const fromEmail = latest.from.match(/<([^>]+)>/)?.[1]?.toLowerCase() || latest.from.toLowerCase();
    const isFromUser = userEmails.has(fromEmail) || Array.from(userEmails).some(ue => fromEmail.includes(ue));
    if (!isFromUser) {
      const ageHours = (Date.now() - new Date(latest.date).getTime()) / (1000 * 60 * 60);
      if (ageHours >= 12) {
        unanswered.push(latest);
      }
    }
  }

  if (unanswered.length === 0) {
    await deliverAutomationMessage(userId, "All clear, you're on top of everything. No forgotten threads.");
    return;
  }

  // Build deep user context
  const userContextBlock = await buildDeepUserContext(userId, memory);

  // Fetch upcoming calendar to cross-reference (meetings with people who emailed)
  let calendarContext = "";
  try {
    const tz = config?.timezone || "UTC";
    const now = new Date();
    const twoDaysOut = new Date(Date.now() + 48 * 60 * 60 * 1000);
    for (const { accessToken, email: acctEmail } of tokens) {
      try {
        const calResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${twoDaysOut.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=15`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (calResp.ok) {
          const calData = await calResp.json();
          const events = (calData.items ?? []).map((ev: any) => {
            const start = ev.start?.dateTime || ev.start?.date || "";
            const title = ev.summary || "No title";
            const attendees = (ev.attendees || []).map((a: any) => a.email).join(", ");
            return `${start} - ${title}${attendees ? ` (${attendees})` : ""}`;
          });
          if (events.length > 0) {
            calendarContext = `\n\nUPCOMING CALENDAR (next 48h, cross-reference with unanswered senders):\n${events.join("\n")}`;
          }
        }
      } catch {}
    }
  } catch {}

  // Build email list for the LLM
  const emailList = unanswered
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 20)
    .map((e, i) => {
      const ageH = Math.round((Date.now() - new Date(e.date).getTime()) / (1000 * 60 * 60));
      return `${i + 1}. [${e.account}] From: ${e.from} | Subject: ${e.subject} | ${ageH}h ago\n   ${e.bodyPreview.slice(0, 300).replace(/\n/g, " ")}`;
    })
    .join("\n\n");

  // Semantic enrichment for the most important threads
  let ragContext = "";
  try {
    const searchQueries = unanswered.slice(0, 5).map(e => {
      const name = e.from.replace(/<[^>]+>/, "").trim();
      return `${name} ${e.subject}`;
    });
    const embeddings = await getBatchEmbeddings(searchQueries);
    const searchResults = await Promise.all(
      searchQueries.map((q, idx) =>
        supabaseAdmin.rpc("hybrid_search_documents", {
          query_text: q,
          query_embedding: vectorString(embeddings[idx]),
          match_count: 4,
          source_filters: null,
          min_semantic_score: 0.25,
          p_user_id: userId,
        }).then(r => r.data ?? []).catch(() => [])
      )
    );
    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const results of searchResults) {
      for (const r of results) {
        const key = r.source_id || r.content?.slice(0, 80);
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push(`[${r.source_type}] ${(r.content || "").slice(0, 300)}`);
        if (blocks.length >= 10) break;
      }
      if (blocks.length >= 10) break;
    }
    if (blocks.length > 0) {
      ragContext = `\n\nRELATED CONTEXT (past interactions, conversations, notes about these people/topics):\n${blocks.join("\n\n")}`;
    }
  } catch (e) {
    console.warn("[v2-trigger] Follow-up RAG failed:", (e as Error).message);
  }

  const fuGreeting = getUserGreetingContext(memory, config?.timezone || "UTC");
  const prompt = `DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${fuGreeting.name}\nTime of day: ${fuGreeting.timeOfDay}\n\nUNANSWERED THREADS (${unanswered.length}):\n\n${emailList}${calendarContext}${ragContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 800,
        instructions: FOLLOW_UP_SYSTEM_PROMPT,
        input: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Follow-up nudge sent for ${userId} (${unanswered.length} threads, ${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Follow-up LLM error:", (e as Error).message);
  }

  await deliverAutomationMessage(userId, `Heads up, you've got ${unanswered.length} thread(s) waiting on a reply. Want me to go through them?`);
}

// ── Daily Wrap ────────────────────────────────────────────────
// End-of-day summary: what happened today + tomorrow preview.
// Cross-references calendar, emails, todos, and conversation.

const DAILY_WRAP_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person. You're texting them their end-of-day wrap-up via iMessage. You know their day, their priorities, their emotional state, and what's coming next.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", or system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You have their DEEP PROFILE. Use it to:
- Reflect their actual day, not just list events. "Busy one today" vs "Quiet day" based on what actually happened
- Close loops: if the morning summary flagged something, note whether it got handled
- Read their energy: if their emotional arc suggests stress, be calming. If they're in flow, be encouraging.
- Connect today's events to their broader goals and life themes
- Flag things that need attention tomorrow in context: "You've got that meeting with Sarah at 10, might want to prep the deck tonight"
- Acknowledge wins: if they completed todos or handled important threads, note it
- Be genuinely helpful about tomorrow, not just a calendar readout

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is their daily wrap-up. E.g. "Evening {name}, here's your day in review" or "{name}, wrapping up your day". Then add a brief reflection on how the day went based on what actually happened. One line.
---
Bubble 2: Start with "Today:" on its own line. Key things that happened, framed through THEIR priorities. Meetings, emails, progress on threads. One item per line.
---
Bubble 3: Start with "Tomorrow:" on its own line. What's coming, with context on why it matters and what to prep. One item per line.
---
Bubble 4 (optional): A single closing thought. Could reference their emotional state, an open thread, a personal note, or encouragement. Make it feel human. Skip if unnecessary.

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line
- Bold **key names**, **meetings**, **deadlines**
- If the day was quiet, acknowledge it warmly
- If tomorrow is packed, give them a heads-up with practical advice
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational, not robotic
- The closing should feel like it comes from someone who genuinely cares
- Max 4 bubbles`;

async function executeDailyWrap(userId: string, config: any): Promise<void> {
  const start = Date.now();
  const tz = config?.timezone || "UTC";

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  // Gather today's data in parallel
  const [calToday, calTomorrow, todayEmails, todos, recentChat] = await Promise.all([
    // Today's calendar events
    (async () => {
      const events: string[] = [];
      for (const { accessToken, email: acctEmail } of (tokens || [])) {
        try {
          const now = new Date();
          const todayStart = new Date(now.toLocaleDateString("en-CA", { timeZone: tz }) + "T00:00:00");
          const todayEnd = new Date(now.toLocaleDateString("en-CA", { timeZone: tz }) + "T23:59:59");
          const calResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${todayStart.toISOString()}&timeMax=${todayEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (calResp.ok) {
            const calData = await calResp.json();
            for (const ev of calData.items ?? []) {
              const evStart = ev.start?.dateTime || ev.start?.date || "";
              const title = ev.summary || "No title";
              const attendees = (ev.attendees || []).map((a: any) => a.displayName || a.email).slice(0, 4).join(", ");
              const status = ev.status === "cancelled" ? " [cancelled]" : "";
              events.push(`[${acctEmail}] ${evStart} - ${title}${attendees ? ` (with: ${attendees})` : ""}${status}`);
            }
          }
        } catch {}
      }
      return events;
    })(),

    // Tomorrow's calendar events
    (async () => {
      const events: string[] = [];
      for (const { accessToken, email: acctEmail } of (tokens || [])) {
        try {
          const now = new Date();
          const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
          const tomorrow = new Date(todayStr + "T00:00:00");
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowEnd = new Date(tomorrow);
          tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
          const calResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${tomorrow.toISOString()}&timeMax=${tomorrowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=15`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (calResp.ok) {
            const calData = await calResp.json();
            for (const ev of calData.items ?? []) {
              const evStart = ev.start?.dateTime || ev.start?.date || "";
              const title = ev.summary || "No title";
              const attendees = (ev.attendees || []).map((a: any) => a.displayName || a.email).slice(0, 4).join(", ");
              events.push(`[${acctEmail}] ${evStart} - ${title}${attendees ? ` (with: ${attendees})` : ""}`);
            }
          }
        } catch {}
      }
      return events;
    })(),

    // Today's emails (for activity summary)
    (async () => {
      const emails: Array<{ account: string; from: string; subject: string; snippet: string }> = [];
      for (const { email, accessToken } of (tokens || [])) {
        try {
          const refs = await listGmailMessages(accessToken, "newer_than:12h", 30);
          if (!refs || refs.length === 0) continue;
          const fetches = refs.slice(0, 30).map((ref: any) => getGmailMessage(accessToken, ref.id).catch(() => null));
          const msgs = await Promise.all(fetches);
          for (const msg of msgs) {
            if (!msg || !msg.subject) continue;
            emails.push({ account: email, from: msg.from || "", subject: msg.subject, snippet: msg.snippet || "" });
          }
        } catch {}
      }
      return emails;
    })(),

    // Active todos
    supabaseAdmin
      .from("v2_user_todos")
      .select("title, notes, due_at, priority, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("priority", { ascending: false })
      .limit(10)
      .then(r => r.data ?? [])
      .catch(() => []),

    // Recent conversation
    supabaseAdmin
      .from("v2_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(r => (r.data ?? []).reverse())
      .catch(() => []),
  ]);

  // Build deep user context
  const userContextBlock = await buildDeepUserContext(userId, memory);

  // Fetch this morning's summary (if sent) to close loops
  let morningSummaryContext = "";
  try {
    const todayStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: tz }) + "T00:00:00");
    const { data: morningMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: true })
      .limit(5);
    if (morningMsgs && morningMsgs.length > 0) {
      const summaryMsg = morningMsgs.find((m: any) => m.content?.includes("To Action:") || m.content?.includes("FYI:"));
      if (summaryMsg) {
        morningSummaryContext = `\nMORNING SUMMARY SENT EARLIER (check if these items got handled):\n${(summaryMsg.content || "").slice(0, 600)}`;
      }
    }
  } catch {}

  // Build the prompt
  const dwGreeting = getUserGreetingContext(memory, tz);
  const promptParts: string[] = [`DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${dwGreeting.name}\nTime of day: ${dwGreeting.timeOfDay}`];

  if (calToday.length > 0) {
    promptParts.push(`\nTODAY'S MEETINGS (${calToday.length}):\n${calToday.join("\n")}`);
  } else {
    promptParts.push("\nTODAY'S MEETINGS: None");
  }

  if (calTomorrow.length > 0) {
    promptParts.push(`\nTOMORROW'S SCHEDULE (${calTomorrow.length}):\n${calTomorrow.join("\n")}`);
  } else {
    promptParts.push("\nTOMORROW'S SCHEDULE: Clear");
  }

  if (todayEmails.length > 0) {
    const emailSummary = todayEmails.slice(0, 15).map(e => `[${e.account}] ${e.from}: ${e.subject}`).join("\n");
    promptParts.push(`\nTODAY'S EMAILS (${todayEmails.length} total):\n${emailSummary}`);
  }

  if (todos.length > 0) {
    const todoList = todos.map((t: any) => `- ${t.title}${t.due_at ? ` (due: ${t.due_at})` : ""} [${t.status}]`).join("\n");
    promptParts.push(`\nACTIVE TODOS:\n${todoList}`);
  }

  if (recentChat.length > 0) {
    const chatLines = recentChat.map((m: any) => `${m.role === "user" ? "User" : "Nest"}: ${(m.content || "").slice(0, 120)}`).join("\n");
    promptParts.push(`\nRECENT CONVERSATION:\n${chatLines}`);
  }

  if (morningSummaryContext) promptParts.push(morningSummaryContext);

  // RAG enrichment for tomorrow's meetings
  let ragContext = "";
  if (calTomorrow.length > 0) {
    try {
      const queries = calTomorrow.slice(0, 3).map(e => {
        const match = e.match(/- (.+?)(?:\s*\(with:|$)/);
        return match?.[1] || e;
      });
      const embeddings = await getBatchEmbeddings(queries);
      const results = await Promise.all(
        queries.map((q, idx) =>
          supabaseAdmin.rpc("hybrid_search_documents", {
            query_text: q,
            query_embedding: vectorString(embeddings[idx]),
            match_count: 3,
            source_filters: null,
            min_semantic_score: 0.3,
            p_user_id: userId,
          }).then(r => r.data ?? []).catch(() => [])
        )
      );
      const seen = new Set<string>();
      const blocks: string[] = [];
      for (const res of results) {
        for (const r of res) {
          const key = r.source_id || r.content?.slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          blocks.push(`[${r.source_type}] ${(r.content || "").slice(0, 250)}`);
          if (blocks.length >= 6) break;
        }
      }
      if (blocks.length > 0) {
        ragContext = `\n\nCONTEXT FOR TOMORROW (from knowledge base):\n${blocks.join("\n\n")}`;
      }
    } catch {}
  }

  promptParts.push(ragContext);

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 800,
        instructions: DAILY_WRAP_SYSTEM_PROMPT,
        input: [{ role: "user", content: promptParts.join("\n") }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Daily wrap sent for ${userId} (${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Daily wrap LLM error:", (e as Error).message);
  }

  await deliverAutomationMessage(userId, `That's a wrap for today. You had ${calToday.length} meeting(s) and ${todayEmails.length} email(s). Tomorrow you've got ${calTomorrow.length} thing(s) on the calendar.`);
}

// ── Weekly Digest ─────────────────────────────────────────────
// Comprehensive weekly review: what happened, what's coming, open threads.
// Runs once a week (user picks the day, default Sunday evening).

const WEEKLY_DIGEST_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person's life, career, and priorities. You're texting them a weekly digest via iMessage. This is the most strategic message you send all week.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", or system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You have their DEEP PROFILE. Use it to:
- Frame the week through THEIR priorities, not just a calendar dump
- Identify patterns: "Another week heavy on meetings, only 2 deep work blocks" or "You've been in hiring mode, 4 interviews this week"
- Track progress on their life themes and open threads across weeks
- Name people by relationship: "your team lead Sarah" not just "Sarah"
- Note what moved forward and what stalled
- Give genuinely strategic advice for next week: "Tuesday is back-to-back, might want to prep Monday evening"
- If they have big deadlines or events coming, flag them with context
- Match their communication style and energy

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is their weekly digest. E.g. "Hey {name}, your week in review" or "{name}, here's how your week shaped up". Then add a brief reflection on the week's overall vibe based on what actually happened. One line.
---
Bubble 2: Start with "This Week:" on its own line. Key highlights framed through their priorities. What mattered, what moved, what decisions were made. One item per line. Bold key names and topics.
---
Bubble 3: Start with "Next Week:" on its own line. Strategic preview: key meetings with context on why they matter, deadlines, things to prep. One item per line.
---
Bubble 4: Start with "Open Threads:" on its own line. Unresolved items from their conversations, stalled projects, things that need attention. Skip if nothing relevant.
---
Bubble 5 (optional): A strategic or personal closing thought. Could be a pattern you noticed, a heads-up about workload, encouragement, or a reminder about something they care about. Make it feel insightful.

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line
- Bold **key names**, **meetings**, **deadlines**, **decisions**
- Be selective and strategic, don't list everything. Focus on what matters to THIS person.
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational, not robotic
- The digest should feel like a trusted advisor's weekly check-in
- Max 5 bubbles`;

async function executeWeeklyDigest(userId: string, config: any): Promise<void> {
  const start = Date.now();
  const tz = config?.timezone || "UTC";

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  // Gather the week's data in parallel
  const [thisWeekCal, nextWeekCal, weekEmails, todos, openLoops] = await Promise.all([
    // This week's calendar (past 7 days)
    (async () => {
      const events: string[] = [];
      for (const { accessToken, email: acctEmail } of (tokens || [])) {
        try {
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const now = new Date();
          const calResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${weekAgo.toISOString()}&timeMax=${now.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (calResp.ok) {
            const calData = await calResp.json();
            for (const ev of calData.items ?? []) {
              const evStart = ev.start?.dateTime || ev.start?.date || "";
              const title = ev.summary || "No title";
              const attendees = (ev.attendees || []).map((a: any) => a.displayName || a.email).slice(0, 4).join(", ");
              events.push(`${evStart} - ${title}${attendees ? ` (${attendees})` : ""}`);
            }
          }
        } catch {}
      }
      return events;
    })(),

    // Next week's calendar (next 7 days)
    (async () => {
      const events: string[] = [];
      for (const { accessToken, email: acctEmail } of (tokens || [])) {
        try {
          const now = new Date();
          const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const calResp = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${weekAhead.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=30`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (calResp.ok) {
            const calData = await calResp.json();
            for (const ev of calData.items ?? []) {
              const evStart = ev.start?.dateTime || ev.start?.date || "";
              const title = ev.summary || "No title";
              const attendees = (ev.attendees || []).map((a: any) => a.displayName || a.email).slice(0, 4).join(", ");
              events.push(`${evStart} - ${title}${attendees ? ` (${attendees})` : ""}`);
            }
          }
        } catch {}
      }
      return events;
    })(),

    // This week's emails (key ones)
    (async () => {
      const emails: Array<{ account: string; from: string; subject: string; date: string; snippet: string }> = [];
      for (const { email, accessToken } of (tokens || [])) {
        try {
          const refs = await listGmailMessages(accessToken, "newer_than:7d is:important OR is:starred", 30);
          if (!refs || refs.length === 0) continue;
          const fetches = refs.slice(0, 30).map((ref: any) => getGmailMessage(accessToken, ref.id).catch(() => null));
          const msgs = await Promise.all(fetches);
          for (const msg of msgs) {
            if (!msg || !msg.subject) continue;
            emails.push({ account: email, from: msg.from || "", subject: msg.subject, date: msg.date, snippet: msg.snippet || "" });
          }
        } catch {}
      }
      return emails;
    })(),

    // Active todos
    supabaseAdmin
      .from("v2_user_todos")
      .select("title, notes, due_at, priority, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .order("priority", { ascending: false })
      .limit(15)
      .then(r => r.data ?? [])
      .catch(() => []),

    // Open loops from memory
    (async () => {
      if (memory?.openLoops) {
        return memory.openLoops.filter((l: any) => l.status === "open");
      }
      return [];
    })(),
  ]);

  // Build deep user context
  const userContextBlock = await buildDeepUserContext(userId, memory);

  // Fetch completed todos from this week for progress tracking
  let completedTodosContext = "";
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completedTodos } = await supabaseAdmin
      .from("v2_user_todos")
      .select("title, updated_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("updated_at", weekAgo)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (completedTodos && completedTodos.length > 0) {
      completedTodosContext = `\nCOMPLETED THIS WEEK (${completedTodos.length}):\n${completedTodos.map((t: any) => `- ${t.title}`).join("\n")}`;
    }
  } catch {}

  // Fetch this week's conversation highlights (what did they talk to Nest about?)
  let weekConversationContext = "";
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: weekMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(15);
    if (weekMsgs && weekMsgs.length > 0) {
      const topics = weekMsgs.map((m: any) => (m.content || "").slice(0, 100)).join("\n");
      weekConversationContext = `\nWHAT THEY ASKED NEST ABOUT THIS WEEK (${weekMsgs.length} messages):\n${topics}`;
    }
  } catch {}

  // Build prompt
  const wdGreeting = getUserGreetingContext(memory, tz);
  const promptParts: string[] = [`DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${wdGreeting.name}\nTime of day: ${wdGreeting.timeOfDay}`];

  if (thisWeekCal.length > 0) {
    promptParts.push(`\nTHIS WEEK'S MEETINGS (${thisWeekCal.length}):\n${thisWeekCal.slice(0, 25).join("\n")}`);
  } else {
    promptParts.push("\nTHIS WEEK'S MEETINGS: None");
  }

  if (nextWeekCal.length > 0) {
    promptParts.push(`\nNEXT WEEK'S SCHEDULE (${nextWeekCal.length}):\n${nextWeekCal.slice(0, 20).join("\n")}`);
  } else {
    promptParts.push("\nNEXT WEEK'S SCHEDULE: Clear");
  }

  if (weekEmails.length > 0) {
    const emailSummary = weekEmails.slice(0, 20).map(e => `[${e.account}] ${e.from}: ${e.subject}`).join("\n");
    promptParts.push(`\nKEY EMAILS THIS WEEK (${weekEmails.length}):\n${emailSummary}`);
  }

  if (todos.length > 0) {
    const todoList = todos.map((t: any) => `- ${t.title}${t.due_at ? ` (due: ${t.due_at})` : ""} [${t.status}]`).join("\n");
    promptParts.push(`\nACTIVE TODOS:\n${todoList}`);
  }

  if (completedTodosContext) promptParts.push(completedTodosContext);

  if (openLoops.length > 0) {
    const loopList = openLoops.map((l: any) => `- ${l.topic} (since ${l.firstMentioned || "recently"}): ${l.context || ""}`);
    promptParts.push(`\nOPEN THREADS FROM CONVERSATIONS:\n${loopList.join("\n")}`);
  }

  if (weekConversationContext) promptParts.push(weekConversationContext);

  // RAG enrichment for key themes
  let ragContext = "";
  try {
    const queries: string[] = [];
    if (thisWeekCal.length > 0) {
      const titles = thisWeekCal.slice(0, 3).map(e => {
        const match = e.match(/- (.+?)(?:\s*\(|$)/);
        return match?.[1] || "";
      }).filter(Boolean);
      queries.push(...titles);
    }
    if (openLoops.length > 0) {
      queries.push(...openLoops.slice(0, 2).map((l: any) => l.topic));
    }

    if (queries.length > 0) {
      const cappedQueries = queries.slice(0, 5);
      const embeddings = await getBatchEmbeddings(cappedQueries);
      const results = await Promise.all(
        cappedQueries.map((q, idx) =>
          supabaseAdmin.rpc("hybrid_search_documents", {
            query_text: q,
            query_embedding: vectorString(embeddings[idx]),
            match_count: 3,
            source_filters: null,
            min_semantic_score: 0.3,
            p_user_id: userId,
          }).then(r => r.data ?? []).catch(() => [])
        )
      );
      const seen = new Set<string>();
      const blocks: string[] = [];
      for (const res of results) {
        for (const r of res) {
          const key = r.source_id || r.content?.slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          blocks.push(`[${r.source_type}] ${(r.content || "").slice(0, 250)}`);
          if (blocks.length >= 8) break;
        }
      }
      if (blocks.length > 0) {
        ragContext = `\n\nRELATED CONTEXT FROM KNOWLEDGE BASE:\n${blocks.join("\n\n")}`;
      }
    }
  } catch {}

  promptParts.push(ragContext);

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 1200,
        instructions: WEEKLY_DIGEST_SYSTEM_PROMPT,
        input: [{ role: "user", content: promptParts.join("\n") }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Weekly digest sent for ${userId} (${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Weekly digest LLM error:", (e as Error).message);
  }

  await deliverAutomationMessage(userId, `Weekly check-in: you had ${thisWeekCal.length} meeting(s) this week. Next week has ${nextWeekCal.length} on the calendar. Want me to break it down?`);
}

// ── Email Monitor ─────────────────────────────────────────────
// Hourly proactive email scanner. Checks for anything time-sensitive
// that can't wait for the morning summary. Silent when nothing urgent.

const EMAIL_MONITOR_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person's life, work, and priorities. Your email monitor just flagged something important in their inbox. You're texting them a proactive alert via iMessage.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", "learnings", or any system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

THIS IS AN UNSOLICITED ALERT. The user did NOT ask for this. They might be in a meeting, at lunch, or busy. So you MUST:
1. Make it IMMEDIATELY clear this is a proactive inbox alert, not a response to something they said
2. Explain WHY you're flagging this - what makes it time-sensitive or important FOR THEM specifically
3. Give them enough context to decide if they need to act now or can deal with it later
4. Reference their situation: if they have a meeting in an hour with this person, say so. If this relates to a project they're tracking, connect the dots.

You have their DEEP PROFILE. Use it to:
- Reference people by relationship: "your manager Kieran" not just "Kieran Ryan"
- Connect to open threads and broader context: "That proposal James mentioned last week just landed"
- Explain WHY it's urgent in THEIR context, not generically
- If a bill connects to a todo or conversation, mention it naturally
- Match their communication style and energy level

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is a proactive alert. E.g. "Hey {name}, just flagging something from your inbox" or "{name}, heads up on something that just came in" or "Quick flag {name}, something landed that you'll want to see". Consider their time of day and energy. One line.
---
Bubble 2: For EACH item: **Sender** - what it is, WHY it matters to them specifically, and what action (if any) they should consider. Give real context, not just the subject line. If you know the backstory from their profile, weave it in. Most urgent first.
---
Bubble 3 (optional, only if needed): A brief note on timing or suggested action. E.g. "Might be worth replying before your 3pm with James" or "No rush on this, but the due date is Friday"

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line
- Bold **sender names** and **key details**
- Max 3 bubbles. Keep it tight but give enough context.
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational and warm, not robotic or alarmist`;

async function executeEmailMonitor(userId: string, config: any, automationId: string): Promise<void> {
  const start = Date.now();

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  if (!tokens || tokens.length === 0) {
    console.warn(`[v2-trigger] No tokens for user ${userId}, skipping email monitor`);
    return;
  }

  // Deduplication: load previously seen message IDs from config
  const lastSeenIds: string[] = (config?.last_seen_ids as string[]) ?? [];
  const seenSet = new Set(lastSeenIds);

  // Stage 1: Fetch new emails from the last ~75 minutes (overlap buffer)
  interface MonitorEmail {
    id: string; account: string; from: string; to: string; subject: string;
    bodyPreview: string; snippet: string; date: string; labels: string[];
    idx: number;
  }
  const newEmails: MonitorEmail[] = [];
  let globalIdx = 0;

  for (const { email, accessToken } of tokens) {
    try {
      const refs = await listGmailMessages(accessToken, "newer_than:75m", 30);
      if (!refs || refs.length === 0) continue;

      // Filter out already-seen messages before fetching bodies
      const unseenRefs = refs.filter((ref: any) => !seenSet.has(ref.id)).slice(0, 15);
      if (unseenRefs.length === 0) continue;

      const fetches = unseenRefs.map((ref: any) =>
        getGmailMessage(accessToken, ref.id).catch(() => null)
      );
      const messages = await Promise.all(fetches);

      for (const msg of messages) {
        if (!msg || !msg.subject) continue;
        globalIdx++;
        newEmails.push({
          id: msg.id || `${email}-${msg.subject}-${msg.date}`,
          account: email,
          from: msg.from || "",
          to: msg.to || "",
          subject: msg.subject,
          bodyPreview: msg.bodyPreview?.slice(0, 600) || msg.snippet || "",
          snippet: msg.snippet || "",
          date: msg.date,
          labels: (msg.labelIds || []).filter((l: string) =>
            !["UNREAD", "INBOX", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].includes(l)
          ),
          idx: globalIdx,
        });
      }
    } catch (e) {
      console.warn(`[v2-trigger] Email monitor fetch failed for ${email}:`, (e as Error).message);
    }
  }

  // Update seen IDs (keep last 100 to prevent unbounded growth)
  const allSeenIds = [...lastSeenIds, ...newEmails.map(e => e.id)];
  const trimmedSeenIds = allSeenIds.slice(-100);

  // Persist the updated seen IDs back to the automation config
  try {
    await supabaseAdmin
      .from("user_automations")
      .update({ config: { ...config, last_seen_ids: trimmedSeenIds } })
      .eq("id", automationId);
  } catch {}

  if (newEmails.length === 0) {
    console.log(`[v2-trigger] Email monitor: no new emails for ${userId}`);
    return;
  }

  console.log(`[v2-trigger] Email monitor: ${newEmails.length} new emails for ${userId}`);

  // Stage 2: GPT-5.2 urgency triage with deep context
  const userContextBlock = await buildDeepUserContext(userId, memory);

  const emailList = newEmails.map(e => {
    const flags: string[] = [];
    if (e.labels.includes("IMPORTANT")) flags.push("IMPORTANT");
    if (e.labels.includes("STARRED")) flags.push("STARRED");
    const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
    return `${e.idx}. [${e.account}] From: ${e.from} → To: ${e.to.slice(0, 60)} | Subject: ${e.subject}${flagStr} | ${e.date}\n   ${e.bodyPreview.slice(0, 500).replace(/\n/g, " ")}`;
  }).join("\n\n");

  // Fetch today's calendar for cross-referencing
  let calendarContext = "";
  try {
    const tz = config?.timezone || "UTC";
    const now = new Date();
    const tomorrowEnd = new Date(now);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);
    for (const { accessToken } of tokens.slice(0, 2)) {
      try {
        const calResp = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${tomorrowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=10`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (calResp.ok) {
          const calData = await calResp.json();
          const events = (calData.items ?? []).map((ev: any) => {
            const evStart = ev.start?.dateTime || ev.start?.date || "";
            return `${evStart} - ${ev.summary || "No title"}`;
          });
          if (events.length > 0) {
            calendarContext = `\n\nUPCOMING CALENDAR (for cross-referencing urgency):\n${events.join("\n")}`;
          }
        }
      } catch {}
    }
  } catch {}

  // Cross-automation awareness: check what Nest already told the user today
  let crossAutoContext = "";
  try {
    const tz = config?.timezone || "UTC";
    const todayStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: tz }) + "T00:00:00");
    const { data: todayMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("content")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    if (todayMsgs && todayMsgs.length > 0) {
      const relevant = todayMsgs.filter((m: any) => m.content?.length > 50);
      if (relevant.length > 0) {
        crossAutoContext = `\n\nMESSAGES ALREADY SENT TO USER TODAY (do NOT repeat anything already covered):\n${relevant.map((m: any) => (m.content || "").slice(0, 300)).join("\n---\n")}`;
      }
    }
  } catch {}

  const triageResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_output_tokens: 600,
      instructions: `You are an email urgency expert who deeply understands this specific person. You have their full profile, key relationships, current projects, and today's calendar. Your job is to decide if any of these NEW emails need the user's attention RIGHT NOW, or if they can wait for the morning summary.

Classify each email into ONE category:

"alert_now" - ONLY for things that genuinely cannot wait 1 hour:
  - Bills/invoices with due dates in the next 3 days, or overdue
  - Urgent requests from KEY PEOPLE in their life (manager, close colleagues, family)
  - Time-sensitive replies to threads they're actively tracking (check OPEN THREADS)
  - Calendar changes for today or tomorrow (cancellation, reschedule, new invite)
  - Security alerts (password reset they didn't initiate, login from new device)
  - Delivery notifications for today
  - Direct asks with same-day deadlines

"morning_summary" - Important but can wait:
  - Regular work emails, even from important people, if not time-critical
  - Bills due in more than 3 days
  - FYI emails, updates, status reports
  - Replies to non-urgent threads

"ignore" - Not worth mentioning at all:
  - Marketing, newsletters, promotional emails
  - Automated notifications from services
  - Receipts and payment confirmations
  - Social media notifications
  - Subscription confirmations
  - CC'd threads where user isn't directly addressed

CRITICAL: Be VERY selective with "alert_now". The user trusts you not to spam them. If in doubt, classify as "morning_summary". Only interrupt for things that would make the user say "I'm glad you told me that now."

Also check MESSAGES ALREADY SENT TODAY. If the morning summary already covered an email or topic, do NOT alert about it again.

Output JSON only:
{
  "alert_now": [{ "email_idx": 3, "sender": "AGL Energy", "subject": "Bill overdue", "reason": "Electricity bill $340 overdue, needs payment", "action_needed": "Pay before late fee" }],
  "morning_summary": [1, 4, 7],
  "ignore": [2, 5, 6]
}

Only output valid JSON.`,
      input: [{ role: "user", content: `DEEP PROFILE:\n${userContextBlock}\n\nNEW EMAILS (${newEmails.length}):\n\n${emailList}${calendarContext}${crossAutoContext}` }],
    }),
  });

  let alertNow: Array<{ email_idx: number; sender: string; subject: string; reason: string; action_needed: string }> = [];

  if (triageResp.ok) {
    try {
      const triageData = await triageResp.json();
      const triageText = triageData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (triageText) {
        const cleaned = triageText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        alertNow = parsed.alert_now ?? [];
      }
    } catch { /* fall through */ }
  }

  console.log(`[v2-trigger] Email monitor triage: ${alertNow.length} alert_now out of ${newEmails.length} new emails`);

  if (alertNow.length === 0) {
    console.log(`[v2-trigger] Email monitor: nothing urgent for ${userId}, staying silent`);
    return;
  }

  // Semantic enrichment: search for context around each alert item
  let semanticContext = "";
  try {
    const enrichQueries = alertNow.slice(0, 3).map(a => `${a.sender} ${a.subject}`);
    const ragResult = await targetedRAG(
      `Urgent email context: ${alertNow.map(a => a.subject).join(", ")}`,
      [],
      userId,
      supabaseAdmin,
      enrichQueries,
      null,
      config?.timezone || "UTC",
    );
    if (ragResult && ragResult.length > 50) {
      semanticContext = `\n\nRELATED CONTEXT FROM USER'S DATA (emails, conversations, notes about these people/topics):\n${ragResult.slice(0, 2000)}`;
    }
  } catch (e) {
    console.warn("[v2-trigger] Email monitor RAG enrichment failed:", (e as Error).message);
  }

  // Get user's name for personalised greeting
  const emSummary = memory?.summary || "";
  const userName = emSummary.match(/\b(?:name(?:d|is)?|called|known as)\s+(\w+)/i)?.[1]
    || emSummary.match(/^(\w+)\s+\w+\s+(?:is|was|has|works|lives|runs|manages|leads)/i)?.[1]
    || "there";

  // Generate the alert message
  const alertSummary = alertNow.map(a =>
    `- ${a.sender}: ${a.subject} | Reason: ${a.reason} | Action: ${a.action_needed}`
  ).join("\n");

  const prompt = `DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${userName}\n\nURGENT ITEMS (${alertNow.length}):\n${alertSummary}${calendarContext}${crossAutoContext}${semanticContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 700,
        instructions: EMAIL_MONITOR_SYSTEM_PROMPT,
        input: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Email monitor alert sent for ${userId} (${alertNow.length} items, ${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Email monitor LLM error:", (e as Error).message);
  }

  const fallback = alertNow.map(a => `**${a.sender}** - ${a.subject}: ${a.reason}`).join("\n");
  await deliverAutomationMessage(userId, `Heads up:\n---\n${fallback}`);

  // ── Event-driven custom automation triggers ──
  // Check if any new emails match watch_filters on custom automations
  await checkEventDrivenAutomations(userId, newEmails);
}

async function checkEventDrivenAutomations(
  userId: string,
  newEmails: Array<{ id: string; account: string; from: string; subject: string; bodyPreview: string; snippet: string; date: string }>,
): Promise<void> {
  if (!newEmails.length) return;

  try {
    const { data: watchAutomations } = await supabaseAdmin
      .from("user_automations")
      .select("id, config, label")
      .eq("user_id", userId)
      .eq("automation_type", "custom")
      .eq("active", true);

    if (!watchAutomations?.length) return;

    const eventAutomations = watchAutomations.filter((a: any) =>
      a.config?.frequency === "event" && a.config?.watch_filters
    );
    if (!eventAutomations.length) return;

    for (const automation of eventAutomations) {
      const filters = automation.config.watch_filters as { senders?: string[]; keywords?: string[]; one_shot?: boolean };
      const senders = (filters.senders ?? []).map((s: string) => s.toLowerCase());
      const keywords = (filters.keywords ?? []).map((k: string) => k.toLowerCase());

      const matched = newEmails.filter(email => {
        const fromLower = email.from.toLowerCase();
        const subjectLower = email.subject.toLowerCase();
        const bodyLower = (email.bodyPreview || email.snippet || "").toLowerCase();

        const senderMatch = senders.length === 0 || senders.some(s => fromLower.includes(s));
        const keywordMatch = keywords.length === 0 || keywords.some(k => subjectLower.includes(k) || bodyLower.includes(k));

        return (senders.length > 0 && senderMatch) || (keywords.length > 0 && keywordMatch) || (senderMatch && keywordMatch);
      });

      if (matched.length === 0) continue;

      console.log(`[v2-trigger] Event-driven "${automation.label}" matched ${matched.length} email(s)`);

      // Inject matched emails into config for the custom automation to use
      const enrichedConfig = {
        ...automation.config,
        _matched_emails: matched.map(e => ({
          from: e.from, subject: e.subject, preview: e.bodyPreview?.slice(0, 500) || e.snippet, date: e.date,
        })),
      };

      await executeCustomAutomation(userId, enrichedConfig, automation.id);

      // If one-shot, auto-disable after firing
      if (filters.one_shot) {
        await supabaseAdmin.from("user_automations").update({ active: false, updated_at: new Date().toISOString() }).eq("id", automation.id);
        console.log(`[v2-trigger] One-shot event automation "${automation.label}" auto-disabled`);
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Event-driven check failed:", (e as Error).message);
  }
}

// ── Relationship Radar ────────────────────────────────────────
// Weekly relationship health check. Silent when all healthy.
// 4-stage: relationship map, significance triage, RAG enrichment, intelligence output.

const RELATIONSHIP_RADAR_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person's relationships, social world, and emotional landscape. You're texting them a gentle, insightful relationship check-in via iMessage.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", "learnings", or any system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You have their DEEP PROFILE including life themes, emotional triggers, and anticipation patterns. Use ALL of this to:
- Frame each person by their relationship: "your sister Sarah" not just "Sarah Chen"
- Explain WHY reaching out matters in THEIR context: connected to a life theme, a commitment they made, or emotional wellbeing
- Suggest WHAT to say or do, specific to the relationship: "Quick text about the project" or "She mentioned her kid's birthday was this week"
- Read their energy: if stressed, keep it light and don't pile on guilt. If in a good flow, be more direct.
- If they mentioned someone to you recently ("remind me to call Sarah"), reference that naturally
- Connect relationship gaps to their broader patterns if insightful

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is their relationship check-in. E.g. "Hey {name}, quick relationship check" or "{name}, a few people worth reaching out to this week". Add a brief contextual note about their social landscape. One line.
---
Bubble 2: Start with "Worth reaching out:" on its own line. One line per person: **Name** (relationship) - why it matters, what to say/do, how long it's been. Most important first.
---
Bubble 3 (optional): A single insight about a pattern. Only if genuinely useful. Skip if not.

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Each item MUST be on a single line
- Bold **names**
- Max 5 people in the list. Quality over quantity.
- NO "Going Well" section. Only speak when there's something worth saying.
- If someone has an upcoming meeting already scheduled, do NOT include them.
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational, not robotic
- The opener should feel like it comes from someone who genuinely knows their social world`;

async function executeRelationshipRadar(userId: string, config: any): Promise<void> {
  const start = Date.now();
  const tz = config?.timezone || "UTC";

  const memory = await getUserMemory(userId, supabaseAdmin);

  // Stage 1: Build the relationship map
  const [personEntities, contactLearnings, recentChat, tokens] = await Promise.all([
    supabaseAdmin
      .from("person_entities")
      .select("canonical_name, role, organisation, email_addresses, last_seen_at, mention_count, aliases")
      .eq("user_id", userId)
      .order("mention_count", { ascending: false })
      .limit(50)
      .then(r => r.data ?? [])
      .catch(() => [] as any[]),

    supabaseAdmin
      .from("v2_user_learnings")
      .select("category, content, confidence, emotional_weight")
      .eq("user_id", userId)
      .eq("active", true)
      .in("category", ["contact_note", "relationship"])
      .gte("confidence", 0.4)
      .limit(40)
      .then(r => r.data ?? [])
      .catch(() => [] as any[]),

    supabaseAdmin
      .from("v2_chat_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20)
      .then(r => r.data ?? [])
      .catch(() => [] as any[]),

    getAllAccountTokens(supabaseAdmin, userId).catch(() => [] as any[]),
  ]);

  if (personEntities.length === 0) {
    console.log(`[v2-trigger] Relationship radar: no person entities for ${userId}`);
    return;
  }

  // Fetch calendar: last 14 days + next 14 days
  const calendarPeople: string[] = [];
  const upcomingMeetingAttendees = new Set<string>();
  for (const { accessToken } of (tokens || [])) {
    try {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const twoWeeksAhead = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const calResp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${twoWeeksAgo.toISOString()}&timeMax=${twoWeeksAhead.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (calResp.ok) {
        const calData = await calResp.json();
        const now = Date.now();
        for (const ev of calData.items ?? []) {
          const attendees = (ev.attendees || []).map((a: any) => (a.displayName || a.email || "").toLowerCase());
          const evStart = new Date(ev.start?.dateTime || ev.start?.date || "").getTime();
          if (evStart > now) {
            attendees.forEach((a: string) => upcomingMeetingAttendees.add(a));
          }
          calendarPeople.push(...attendees);
        }
      }
    } catch {}
  }

  // Build person list with context
  const personList = personEntities.map((p: any) => {
    const daysSince = p.last_seen_at
      ? Math.round((Date.now() - new Date(p.last_seen_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    const relatedLearnings = contactLearnings.filter((l: any) =>
      l.content.toLowerCase().includes(p.canonical_name.toLowerCase()) ||
      (p.aliases || []).some((a: string) => l.content.toLowerCase().includes(a.toLowerCase()))
    );
    const hasUpcomingMeeting = upcomingMeetingAttendees.has(p.canonical_name.toLowerCase()) ||
      (p.email_addresses || []).some((e: string) => upcomingMeetingAttendees.has(e.toLowerCase()));
    const mentionedInChat = recentChat.some((m: any) =>
      (m.content || "").toLowerCase().includes(p.canonical_name.toLowerCase())
    );

    let line = `${p.canonical_name}`;
    if (p.role) line += ` (${p.role}`;
    if (p.organisation) line += ` at ${p.organisation}`;
    if (p.role) line += `)`;
    line += ` | mentions: ${p.mention_count} | last seen: ${daysSince}d ago`;
    if (hasUpcomingMeeting) line += ` | HAS UPCOMING MEETING`;
    if (mentionedInChat) line += ` | MENTIONED IN RECENT CHAT`;
    if (relatedLearnings.length > 0) {
      const notes = relatedLearnings.map((l: any) => `${l.content}${l.emotional_weight === "high" ? " [important]" : ""}`).join("; ");
      line += `\n  Learnings: ${notes}`;
    }
    return line;
  }).join("\n");

  const chatMentions = recentChat.length > 0
    ? recentChat.map((m: any) => (m.content || "").slice(0, 120)).join("\n")
    : "None";

  const userContextBlock = await buildDeepUserContext(userId, memory);

  // Stage 2: GPT-5.2 significance triage
  const triageResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_output_tokens: 600,
      instructions: `You are a relationship intelligence expert who deeply understands this person. You have their full identity model, life themes, emotional triggers, and relationship learnings.

Classify each person as:
- "needs_attention": important relationship that's gone quiet. NO upcoming meeting. NOT recently mentioned in chat. Threshold by relationship type:
  - Family/close friends (high emotional_weight learnings): flag after 7 days
  - Key colleagues/manager: flag after 5 days
  - Professional contacts: flag after 14 days
  - Acquaintances, recruiters, one-off contacts: NEVER flag
- "already_handled": has upcoming meeting, recently mentioned in chat, or recent interaction
- "irrelevant": one-off contacts, automated senders, low mention_count with no learnings

Use their life_themes and anticipation_patterns to understand which relationships matter most.

Output JSON only:
{
  "needs_attention": [{ "name": "Sarah Chen", "reason": "Sister, hasn't spoken in 12 days, family is a core life theme", "suggestion": "Quick text about her kid's birthday" }],
  "already_handled": ["James Park", "Mike"],
  "irrelevant": ["Recruiter Bob"]
}

Max 5 in needs_attention. Quality over quantity. Only genuinely important gaps.
Only output valid JSON.`,
      input: [{ role: "user", content: `DEEP PROFILE:\n${userContextBlock}\n\nPEOPLE IN THEIR WORLD (${personEntities.length}):\n${personList}\n\nRECENT CHAT MENTIONS:\n${chatMentions}` }],
    }),
  });

  let needsAttention: Array<{ name: string; reason: string; suggestion: string }> = [];

  if (triageResp.ok) {
    try {
      const triageData = await triageResp.json();
      const triageText = triageData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (triageText) {
        const cleaned = triageText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        needsAttention = parsed.needs_attention ?? [];
      }
    } catch { /* fall through */ }
  }

  console.log(`[v2-trigger] Relationship triage: ${needsAttention.length} need attention out of ${personEntities.length}`);

  if (needsAttention.length === 0) {
    console.log(`[v2-trigger] Relationship radar: all healthy for ${userId}, staying silent`);
    return;
  }

  // Stage 3: RAG enrichment for needs_attention people (max 5)
  let ragContext = "";
  try {
    const queries = needsAttention.slice(0, 5).map(p => `${p.name} interaction conversation`);
    const embeddings = await getBatchEmbeddings(queries);
    const results = await Promise.all(
      queries.map((q, idx) =>
        supabaseAdmin.rpc("hybrid_search_documents", {
          query_text: q,
          query_embedding: vectorString(embeddings[idx]),
          match_count: 3,
          source_filters: null,
          min_semantic_score: 0.25,
          p_user_id: userId,
        }).then(r => r.data ?? []).catch(() => [])
      )
    );
    const blocks: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const personResults = results[i];
      if (personResults.length > 0) {
        const snippets = personResults.map((r: any) => `[${r.source_type}] ${(r.content || "").slice(0, 250)}`).join("\n");
        blocks.push(`Context for ${needsAttention[i].name}:\n${snippets}`);
      }
    }
    if (blocks.length > 0) {
      ragContext = `\n\nPAST INTERACTION CONTEXT:\n${blocks.join("\n\n")}`;
    }
  } catch (e) {
    console.warn("[v2-trigger] Relationship RAG failed:", (e as Error).message);
  }

  // Cross-automation: check if follow-up nudge or daily wrap already mentioned these people
  let crossAutoContext = "";
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAutoMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentAutoMsgs && recentAutoMsgs.length > 0) {
      const mentionedNames = needsAttention.map(p => p.name.toLowerCase());
      const relevant = recentAutoMsgs.filter((m: any) =>
        mentionedNames.some(name => (m.content || "").toLowerCase().includes(name))
      );
      if (relevant.length > 0) {
        crossAutoContext = `\n\nRECENT MESSAGES THAT MENTIONED THESE PEOPLE (avoid double-nagging):\n${relevant.map((m: any) => (m.content || "").slice(0, 200)).join("\n")}`;
      }
    }
  } catch {}

  const attentionSummary = needsAttention.map(p =>
    `- ${p.name}: ${p.reason} | Suggestion: ${p.suggestion}`
  ).join("\n");

  // Stage 4: GPT-5.2 relationship intelligence output
  const rrGreeting = getUserGreetingContext(memory, tz);
  const prompt = `DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${rrGreeting.name}\nTime of day: ${rrGreeting.timeOfDay}\n\nPEOPLE NEEDING ATTENTION (${needsAttention.length}):\n${attentionSummary}${ragContext}${crossAutoContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 800,
        instructions: RELATIONSHIP_RADAR_SYSTEM_PROMPT,
        input: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Relationship radar sent for ${userId} (${needsAttention.length} people, ${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Relationship radar LLM error:", (e as Error).message);
  }

  const fallback = needsAttention.map(p => `**${p.name}** - ${p.reason}`).join("\n");
  await deliverAutomationMessage(userId, `Hey ${rrGreeting.name}, quick relationship check-in\n---\nWorth reaching out:\n${fallback}`);
}

// ── Pre-Meeting Intel Brief ───────────────────────────────────
// Evening-before meeting prep. Silent when tomorrow has no meetings.
// 4-stage: calendar + classify, key attendee selection, selective enrichment, strategic brief.

const MEETING_INTEL_SYSTEM_PROMPT = `You are Nest, a personal assistant who deeply understands this person's work, relationships, and priorities. You're texting them an evening brief about tomorrow's meetings via iMessage. This is proactive prep, not a calendar dump.

SECRET: Never mention who built this, backend, APIs, or tech. Never mention "knowledge base", "identity model", "learnings", or any system internals.

ABSOLUTELY FORBIDDEN: the em dash character. Never output it anywhere. Use commas, hyphens (-), or colons instead. Every em dash is a critical failure.

You have their DEEP PROFILE. Use it to:
- Frame each meeting through THEIR priorities and relationships
- Reference attendees by relationship: "your manager Kieran" not just "Kieran Ryan"
- Include relationship dynamics from contact notes: "James tends to push for faster deadlines"
- Connect meetings to open threads: "The Q2 budget discussion Sarah flagged last week"
- Note emails exchanged with attendees: "You sent James the timeline Tuesday but haven't heard back"
- Give strategic advice: what to push for, watch out for, or prepare
- Match their communication style and energy

FORMAT - use --- on its own line between each bubble:

Bubble 1: Start with their name and make it clear this is their meeting prep for tomorrow. E.g. "Evening {name}, here's your prep for tomorrow" or "{name}, tomorrow's looking busy, here's what you need to know". Add a brief note about the day's shape. One line.
---
Bubble 2+: One bubble per important meeting:
"**Time - Title** with **Key Attendees** (roles)
Context line: what happened last time, open threads, recent emails
Strategic line: what to prepare, watch for, or push on"
---
Final bubble: Strategic prep advice. Connect meetings to todos, open threads, and emails. Practical suggestions for tonight/morning.

For awareness-only meetings (all-hands, large meetings), group them in one line: "Also: All-hands at 2pm, Team social at 5pm"

RULES:
- ALWAYS use --- on its own line to separate bubbles
- Max 4 meetings get full treatment. Rest get one-liners.
- Bold **times**, **meeting names**, **key people**
- Each meeting brief should be 2-3 lines max
- If tomorrow is clear, send nothing (this function won't be called)
- Use Australian English
- NEVER fabricate information
- NEVER use emojis
- Be conversational, not robotic
- The brief should feel like strategic advice from a trusted advisor`;

async function executeMeetingIntel(userId: string, config: any): Promise<void> {
  const start = Date.now();
  const tz = config?.timezone || "UTC";

  const [tokens, memory] = await Promise.all([
    getAllAccountTokens(supabaseAdmin, userId),
    getUserMemory(userId, supabaseAdmin),
  ]);

  if (!tokens || tokens.length === 0) {
    console.warn(`[v2-trigger] No tokens for user ${userId}, skipping meeting intel`);
    return;
  }

  // Stage 1: Fetch tomorrow's calendar
  interface CalEvent {
    title: string; description: string; startTime: string; endTime: string;
    attendees: Array<{ name: string; email: string; organiser: boolean }>;
    location: string; hasVideo: boolean; account: string;
  }
  const tomorrowEvents: CalEvent[] = [];

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const tomorrow = new Date(todayStr + "T00:00:00");
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  for (const { accessToken, email: acctEmail } of tokens) {
    try {
      const calResp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${tomorrow.toISOString()}&timeMax=${tomorrowEnd.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (calResp.ok) {
        const calData = await calResp.json();
        for (const ev of calData.items ?? []) {
          if (ev.status === "cancelled") continue;
          const attendees = (ev.attendees || []).map((a: any) => ({
            name: a.displayName || a.email || "",
            email: a.email || "",
            organiser: a.organizer || false,
          }));
          tomorrowEvents.push({
            title: ev.summary || "No title",
            description: ev.description || "",
            startTime: ev.start?.dateTime || ev.start?.date || "",
            endTime: ev.end?.dateTime || ev.end?.date || "",
            attendees,
            location: ev.location || "",
            hasVideo: !!(ev.hangoutLink || ev.conferenceData),
            account: acctEmail,
          });
        }
      }
    } catch {}
  }

  if (tomorrowEvents.length === 0) {
    console.log(`[v2-trigger] Meeting intel: no meetings tomorrow for ${userId}`);
    return;
  }

  const userContextBlock = await buildDeepUserContext(userId, memory);

  // Meeting classification via GPT-5.2
  const eventList = tomorrowEvents.map((ev, i) => {
    const time = ev.startTime ? new Date(ev.startTime).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }) : "TBD";
    const attendeeStr = ev.attendees.map(a => `${a.name || a.email}${a.organiser ? " (organiser)" : ""}`).join(", ");
    return `${i + 1}. ${time} - ${ev.title} | ${ev.attendees.length} attendees: ${attendeeStr}${ev.description ? `\n   Description: ${ev.description.slice(0, 200)}` : ""}${ev.location ? `\n   Location: ${ev.location}` : ""}`;
  }).join("\n\n");

  const classifyResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_output_tokens: 500,
      instructions: `You classify meetings for prep-worthiness. You know this person's role, priorities, and relationships.

Classify each meeting:
- "needs_prep": 1:1s, client meetings, project meetings, interviews, board meetings, presentations, important discussions. Typically 2-12 attendees.
- "awareness_only": All-hands (13+ attendees), town halls, optional events, social events, recurring standups that need no prep.
- "skip": Focus blocks, lunch holds, commute time, personal blocks, cancelled events, out-of-office.

For needs_prep meetings, select 3-5 KEY ATTENDEES who matter most:
- People with open threads (unfinished business)
- New/unknown people (user might want background)
- Decision-makers or meeting organisers
- People with high-emotional-weight relationship notes

Output JSON only:
{
  "needs_prep": [{ "event_idx": 1, "key_attendee_emails": ["sarah@acme.com", "james@acme.com"], "reason": "Project review with key stakeholders" }],
  "awareness_only": [3, 5],
  "skip": [4]
}`,
      input: [{ role: "user", content: `DEEP PROFILE:\n${userContextBlock}\n\nTOMORROW'S MEETINGS (${tomorrowEvents.length}):\n\n${eventList}` }],
    }),
  });

  let needsPrep: Array<{ event_idx: number; key_attendee_emails: string[]; reason: string }> = [];
  let awarenessOnly: number[] = [];

  if (classifyResp.ok) {
    try {
      const classifyData = await classifyResp.json();
      const classifyText = classifyData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (classifyText) {
        const cleaned = classifyText.replace(/```json\n?|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        needsPrep = parsed.needs_prep ?? [];
        awarenessOnly = parsed.awareness_only ?? [];
      }
    } catch { /* fall through */ }
  }

  console.log(`[v2-trigger] Meeting classification: ${needsPrep.length} need prep, ${awarenessOnly.length} awareness, ${tomorrowEvents.length} total`);

  if (needsPrep.length === 0 && awarenessOnly.length === 0) {
    console.log(`[v2-trigger] Meeting intel: all skippable for ${userId}`);
    return;
  }

  // Stage 3: Selective deep enrichment for needs_prep meetings
  let enrichmentContext = "";
  let pdlCallCount = 0;

  for (const prep of needsPrep.slice(0, 4)) {
    const event = tomorrowEvents[prep.event_idx - 1];
    if (!event) continue;

    const keyEmails = prep.key_attendee_emails.slice(0, 5);
    const meetingParts: string[] = [`\n## ${event.title} (${new Date(event.startTime).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz })})`];

    // Look up key attendees in person_entities and learnings
    for (const email of keyEmails) {
      const attendeeName = event.attendees.find(a => a.email.toLowerCase() === email.toLowerCase())?.name || email;

      // Person entities lookup
      const { data: personData } = await supabaseAdmin
        .from("person_entities")
        .select("canonical_name, role, organisation, last_seen_at")
        .eq("user_id", userId)
        .or(`email_addresses.cs.{${email}},canonical_name.ilike.%${attendeeName.split(" ")[0]}%`)
        .limit(1)
        .maybeSingle()
        .catch(() => ({ data: null }));

      // Contact notes from learnings
      const { data: attendeeLearnings } = await supabaseAdmin
        .from("v2_user_learnings")
        .select("content, emotional_weight")
        .eq("user_id", userId)
        .eq("active", true)
        .in("category", ["contact_note", "relationship"])
        .ilike("content", `%${attendeeName.split(" ")[0]}%`)
        .limit(5)
        .then(r => ({ data: r.data ?? [] }))
        .catch(() => ({ data: [] as any[] }));

      let attendeeInfo = `- ${attendeeName}`;
      if (personData?.role) attendeeInfo += ` (${personData.role}${personData.organisation ? ` at ${personData.organisation}` : ""})`;
      if (personData?.last_seen_at) {
        const daysSince = Math.round((Date.now() - new Date(personData.last_seen_at).getTime()) / (1000 * 60 * 60 * 24));
        attendeeInfo += ` | last interaction: ${daysSince}d ago`;
      }
      if (attendeeLearnings.length > 0) {
        attendeeInfo += `\n  Notes: ${attendeeLearnings.map((l: any) => l.content).join("; ")}`;
      }

      // PDL enrichment for unknown attendees (max 5 total)
      if (!personData?.role && pdlCallCount < 5) {
        try {
          const pdlResult = await executeTool("person_lookup", userId, supabaseAdmin, { email, name: attendeeName });
          if (pdlResult && (pdlResult as any).found) {
            const pdl = pdlResult as any;
            attendeeInfo += `\n  Profile: ${pdl.job_title || ""} at ${pdl.job_company || ""}, ${pdl.location || ""}`;
          }
          pdlCallCount++;
        } catch {}
      }

      meetingParts.push(attendeeInfo);
    }

    // Check for recent emails with key attendees
    for (const { accessToken, email: acctEmail } of tokens.slice(0, 1)) {
      for (const attendeeEmail of keyEmails.slice(0, 3)) {
        try {
          const refs = await listGmailMessages(accessToken, `newer_than:7d (from:${attendeeEmail} OR to:${attendeeEmail})`, 5);
          if (refs && refs.length > 0) {
            const msgs = await Promise.all(refs.slice(0, 3).map((ref: any) => getGmailMessage(accessToken, ref.id).catch(() => null)));
            const validMsgs = msgs.filter(Boolean);
            if (validMsgs.length > 0) {
              const emailSnippets = validMsgs.map((m: any) => `${m.from?.includes(acctEmail) ? "You sent" : "Received"}: ${m.subject} (${m.date})`).join("; ");
              meetingParts.push(`  Recent emails with ${attendeeEmail.split("@")[0]}: ${emailSnippets}`);
            }
          }
        } catch {}
      }
    }

    // Check open loops related to this meeting
    if (memory?.openLoops) {
      const relatedLoops = memory.openLoops
        .filter((l: any) => l.status === "open")
        .filter((l: any) => {
          const topic = (l.topic || "").toLowerCase();
          const context = (l.context || "").toLowerCase();
          const titleLower = event.title.toLowerCase();
          const attendeeNames = event.attendees.map(a => a.name.toLowerCase());
          return titleLower.split(" ").some(w => w.length > 3 && (topic.includes(w) || context.includes(w))) ||
            attendeeNames.some(n => topic.includes(n.split(" ")[0]) || context.includes(n.split(" ")[0]));
        });
      if (relatedLoops.length > 0) {
        meetingParts.push(`  Open threads: ${relatedLoops.map((l: any) => l.topic).join(", ")}`);
      }
    }

    enrichmentContext += meetingParts.join("\n") + "\n";
  }

  // RAG for meeting topics and past instances
  let ragContext = "";
  try {
    const ragQueries = needsPrep.slice(0, 3).map(p => {
      const ev = tomorrowEvents[p.event_idx - 1];
      return ev ? ev.title : "";
    }).filter(Boolean);

    if (ragQueries.length > 0) {
      const embeddings = await getBatchEmbeddings(ragQueries);
      const results = await Promise.all(
        ragQueries.map((q, idx) =>
          supabaseAdmin.rpc("hybrid_search_documents", {
            query_text: q,
            query_embedding: vectorString(embeddings[idx]),
            match_count: 4,
            source_filters: null,
            min_semantic_score: 0.25,
            p_user_id: userId,
          }).then(r => r.data ?? []).catch(() => [])
        )
      );
      const seen = new Set<string>();
      const blocks: string[] = [];
      for (const res of results) {
        for (const r of res) {
          const key = r.source_id || r.content?.slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          blocks.push(`[${r.source_type}] ${(r.content || "").slice(0, 300)}`);
          if (blocks.length >= 8) break;
        }
      }
      if (blocks.length > 0) {
        ragContext = `\n\nPAST MEETING CONTEXT AND RELATED NOTES:\n${blocks.join("\n\n")}`;
      }
    }
  } catch (e) {
    console.warn("[v2-trigger] Meeting intel RAG failed:", (e as Error).message);
  }

  // Fetch active todos for cross-referencing
  let todoContext = "";
  try {
    const { data: todos } = await supabaseAdmin
      .from("v2_user_todos")
      .select("title, due_at, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .limit(10);
    if (todos && todos.length > 0) {
      todoContext = `\n\nACTIVE TODOS:\n${todos.map((t: any) => `- ${t.title}${t.due_at ? ` (due: ${t.due_at})` : ""}`).join("\n")}`;
    }
  } catch {}

  // Cross-automation awareness
  let crossAutoContext = "";
  try {
    const todayStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: tz }) + "T00:00:00");
    const { data: todayMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("content")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", todayStart.toISOString())
      .limit(5);
    if (todayMsgs && todayMsgs.length > 0) {
      const relevant = todayMsgs.filter((m: any) => m.content?.length > 50);
      if (relevant.length > 0) {
        crossAutoContext = `\n\nEARLIER MESSAGES TODAY (connect dots if relevant, don't repeat):\n${relevant.map((m: any) => (m.content || "").slice(0, 300)).join("\n---\n")}`;
      }
    }
  } catch {}

  // Awareness-only meetings summary
  let awarenessContext = "";
  if (awarenessOnly.length > 0) {
    const awarenessLines = awarenessOnly.map(idx => {
      const ev = tomorrowEvents[idx - 1];
      if (!ev) return "";
      const time = ev.startTime ? new Date(ev.startTime).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }) : "TBD";
      return `${time} - ${ev.title} (${ev.attendees.length} attendees)`;
    }).filter(Boolean);
    if (awarenessLines.length > 0) {
      awarenessContext = `\n\nAWARENESS-ONLY MEETINGS (mention briefly in one line):\n${awarenessLines.join("\n")}`;
    }
  }

  // Stage 4: GPT-5.2 strategic evening brief
  const miGreeting = getUserGreetingContext(memory, tz);
  const prompt = `DEEP PROFILE:\n${userContextBlock}\n\nUser's first name: ${miGreeting.name}\nTime of day: ${miGreeting.timeOfDay}\n\nMEETINGS NEEDING PREP (${needsPrep.length}):\n${enrichmentContext}${awarenessContext}${ragContext}${todoContext}${crossAutoContext}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 1200,
        instructions: MEETING_INTEL_SYSTEM_PROMPT,
        input: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const text = data.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
      if (text && text.length > 20) {
        await deliverAutomationMessage(userId, text);
        console.log(`[v2-trigger] Meeting intel sent for ${userId} (${needsPrep.length} prepped, ${awarenessOnly.length} awareness, ${pdlCallCount} PDL calls, ${Date.now() - start}ms)`);
        return;
      }
    }
  } catch (e) {
    console.error("[v2-trigger] Meeting intel LLM error:", (e as Error).message);
  }

  await deliverAutomationMessage(userId, `Tomorrow's looking busy with ${tomorrowEvents.length} meeting(s). Want me to break them down?`);
}

// ── Custom Automation Execution ─────────────────────────────

const CUSTOM_CLASSIFY_PROMPT = `You are a data-source planner for a personal assistant automation.
Given the user's automation prompt, decide which tools to call and what queries to use.

Available tools:
- calendar_lookup: calendar events. query param = time range like "today", "this week", "next 3 days"
- gmail_search: search emails. query param = Gmail search string like "from:sarah newer_than:7d", "subject:invoice newer_than:30d"
- semantic_search: search user's indexed data (emails, docs, notes, past conversations). query param = natural language
- contacts_search: look up contacts. query param = name or company
- web_search: search the web. query param = search terms

Return ONLY valid JSON:
{
  "tools": { "tool_name": { "query": "...", ...other_args } },
  "skip_if_empty": true/false
}

skip_if_empty: true if the automation should stay silent when there is nothing new to report (most automations should be true).
Only include tools that are genuinely needed. Less is better.
For news/current events, use web_search with specific, targeted queries (e.g. "Melbourne news today March 2026").`;

const CUSTOM_GENERATE_PROMPT = `You are Nest, a personal assistant delivering a recurring automation update via iMessage.

THE USER'S AUTOMATION: "{prompt}"
USER'S FIRST NAME: {user_name}

DEEP PROFILE:
{deep_context}

=== SOURCE DATA (this is the ONLY information you may reference) ===
{gathered_data}
=== END SOURCE DATA ===

ALREADY SENT TODAY (from other automations - do NOT repeat this information):
{already_sent}

PREVIOUS RUNS (learn from engagement patterns):
{run_history}

ABSOLUTE RULES - VIOLATION OF ANY = CRITICAL FAILURE:

1. ZERO HALLUCINATION TOLERANCE: You may ONLY state facts that appear verbatim in the SOURCE DATA above. If a headline, name, number, date, or claim is not explicitly present in the source data, you MUST NOT include it. Do not infer, extrapolate, or "fill in" details.

2. If the source data is empty, contains only errors, or has no relevant content, respond with exactly: __SKIP__
   Do NOT make up content. Do NOT write a generic summary. Do NOT say "here's what's happening" and then fabricate items.

3. Every bullet point or claim you make must be directly traceable to a specific item in the source data. If you cannot point to the exact source text, do not include it.

4. ALWAYS start with the user's name and make it clear what this update is about. E.g. "Hey {user_name}, your [topic] update" or "Morning {user_name}, here's your [topic]". The user should immediately know what this message is and why they're getting it.
5. Max 2-3 short bubbles separated by ---
6. NEVER use em dashes or en dashes. Use hyphens (-) or commas instead.
7. No emojis. Conversational, not robotic. Use Australian English.
8. NEVER repeat information already sent today by other automations.
9. If previous runs show the user didn't engage, be more concise.

When in doubt, skip. A missed update is better than a fabricated one.`;

async function executeCustomAutomation(userId: string, config: any, automationId: string): Promise<void> {
  const start = Date.now();
  const prompt = (config.refined_prompt as string) || (config.prompt as string);
  if (!prompt) {
    console.warn(`[v2-trigger] Custom automation ${automationId} has no prompt, skipping`);
    return;
  }

  const label = (config.label as string) || "Custom";
  console.log(`[v2-trigger] Executing custom automation "${label}" for ${userId}`);

  const memory = await getUserMemory(userId, supabaseAdmin);

  // Stage 1: Classify - determine which tools to call
  let toolPlan: Record<string, Record<string, unknown>> = {};
  let skipIfEmpty = true;

  const cachedHint = config.tools_hint as { tools: Record<string, any>; skip_if_empty: boolean } | undefined;
  if (cachedHint?.tools) {
    toolPlan = cachedHint.tools;
    skipIfEmpty = cachedHint.skip_if_empty ?? true;
  } else {
    try {
      const classifyResp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.4",
          max_output_tokens: 300,
          instructions: CUSTOM_CLASSIFY_PROMPT,
          input: [{ role: "user", content: `Automation prompt: "${prompt}"` }],
        }),
      });
      if (classifyResp.ok) {
        const classifyData = await classifyResp.json();
        const classifyText = classifyData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();
        if (classifyText) {
          const jsonMatch = classifyText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            toolPlan = parsed.tools ?? {};
            skipIfEmpty = parsed.skip_if_empty ?? true;
          }
        }
      }
      // Cache the classification for future runs
      try {
        await supabaseAdmin.from("user_automations").update({
          config: { ...config, tools_hint: { tools: toolPlan, skip_if_empty: skipIfEmpty } },
        }).eq("id", automationId);
      } catch {}
    } catch (e) {
      console.warn(`[v2-trigger] Custom classify failed for ${automationId}:`, (e as Error).message);
    }
  }

  // Stage 2: Gather - execute the tools
  const tz = (config.timezone as string) || "UTC";
  const gathered: Record<string, string> = {};
  let hasData = false;

  for (const [toolName, toolArgs] of Object.entries(toolPlan)) {
    try {
      const args: Record<string, unknown> = typeof toolArgs === "object" ? { ...toolArgs } : { query: String(toolArgs) };
      args.time_zone = tz;
      const result = await executeTool(toolName, args, userId, supabaseAdmin, tz);
      gathered[toolName] = result;
      // Only count as real data if the result has substance and isn't an error
      if (result && result.length > 30 && !result.includes('"error"') && !result.includes("No results") && !result.includes("no events") && !result.includes("No emails")) {
        hasData = true;
      }
    } catch (e) {
      console.warn(`[v2-trigger] Custom gather ${toolName} failed:`, (e as Error).message);
      gathered[toolName] = `(error: ${(e as Error).message})`;
    }
  }

  // If skip_if_empty and no meaningful data, log silent run
  if (skipIfEmpty && !hasData) {
    console.log(`[v2-trigger] Custom "${label}" - nothing new, skipping delivery (${Date.now() - start}ms)`);
    const runHistory = ((config.run_history as any[]) ?? []).slice(-4);
    runHistory.push({ ran_at: new Date().toISOString(), delivered: false, skipped_reason: "nothing_new" });
    try {
      await supabaseAdmin.from("user_automations").update({
        config: { ...config, run_history: runHistory, total_runs: (config.total_runs || 0) + 1 },
      }).eq("id", automationId);
    } catch {}
    return;
  }

  // Stage 3: Cross-automation dedup - check what was already sent today
  let alreadySent = "";
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: recentAutoMsgs } = await supabaseAdmin
      .from("v2_chat_messages")
      .select("content, metadata")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .gte("created_at", twelveHoursAgo)
      .not("metadata", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentAutoMsgs?.length) {
      alreadySent = recentAutoMsgs
        .filter((m: any) => m.metadata?.automation_id)
        .map((m: any) => `[${m.metadata.automation_label || "automation"}]: ${(m.content as string).slice(0, 300)}`)
        .join("\n\n");
    }
  } catch {}

  // Build deep user context
  const deepContext = await buildDeepUserContext(userId, memory);

  // Build run history context
  const runHistory = ((config.run_history as any[]) ?? []).slice(-5);
  const runHistoryText = runHistory
    .filter((r: any) => r.delivered)
    .map((r: any) => `${r.ran_at}: ${r.output_preview || "(no preview)"} | Engaged: ${r.user_engaged ?? "unknown"}`)
    .join("\n") || "No previous runs";

  // Stage 4: Generate
  const ug = getUserGreetingContext(memory, tz);
  const genPrompt = CUSTOM_GENERATE_PROMPT
    .replace("{prompt}", prompt)
    .replace("{user_name}", ug.name)
    .replace("{deep_context}", deepContext.slice(0, 3000))
    .replace("{gathered_data}", JSON.stringify(gathered).slice(0, 4000))
    .replace("{already_sent}", alreadySent.slice(0, 1500) || "Nothing sent yet today")
    .replace("{run_history}", runHistoryText);

  try {
    const genResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_output_tokens: 600,
        instructions: genPrompt,
        input: [{ role: "user", content: `Generate the automation update now.` }],
      }),
    });

    if (genResp.ok) {
      const genData = await genResp.json();
      const text = genData.output?.find((o: any) => o.type === "message")?.content?.find((c: any) => c.type === "output_text")?.text?.trim();

      if (text && text !== "__SKIP__" && text.length > 10) {
        // Hallucination guard: if no real data was gathered, don't deliver
        if (!hasData) {
          console.log(`[v2-trigger] Custom "${label}" - LLM generated text but no source data, blocking delivery`);
          const guardHistory = runHistory.slice(-4);
          guardHistory.push({ ran_at: new Date().toISOString(), delivered: false, skipped_reason: "no_source_data" });
          try { await supabaseAdmin.from("user_automations").update({ config: { ...config, run_history: guardHistory, total_runs: (config.total_runs || 0) + 1 } }).eq("id", automationId); } catch {}
          return;
        }

        await deliverAutomationMessage(userId, text, { automation_id: automationId, automation_label: label });

        // Stage 5: Score - log the run
        const newRunHistory = runHistory.slice(-4);
        newRunHistory.push({
          ran_at: new Date().toISOString(),
          output_preview: text.slice(0, 200),
          delivered: true,
          user_engaged: null,
          user_feedback: null,
        });
        const totalRuns = (config.total_runs || 0) + 1;

        try {
          await supabaseAdmin.from("user_automations").update({
            config: { ...config, run_history: newRunHistory, total_runs: totalRuns },
          }).eq("id", automationId);
        } catch {}

        console.log(`[v2-trigger] Custom "${label}" delivered for ${userId} (${Date.now() - start}ms)`);
        return;
      }

      if (text === "__SKIP__") {
        console.log(`[v2-trigger] Custom "${label}" - LLM chose to skip (${Date.now() - start}ms)`);
        const newRunHistory = runHistory.slice(-4);
        newRunHistory.push({ ran_at: new Date().toISOString(), delivered: false, skipped_reason: "llm_skip" });
        try {
          await supabaseAdmin.from("user_automations").update({
            config: { ...config, run_history: newRunHistory, total_runs: (config.total_runs || 0) + 1 },
          }).eq("id", automationId);
        } catch {}
        return;
      }
    }
  } catch (e) {
    console.error(`[v2-trigger] Custom "${label}" LLM error:`, (e as Error).message);
  }

  console.warn(`[v2-trigger] Custom "${label}" - generation failed, skipping delivery`);
}

async function deliverAutomationMessage(
  userId: string,
  rawMessage: string,
  metadata?: { automation_id?: string; automation_label?: string },
): Promise<void> {
  const message = rawMessage
    .replace(/\u2014/g, ",")   // em dash
    .replace(/\u2013/g, "-")   // en dash
    .replace(/\u2018|\u2019/g, "'")  // smart quotes
    .replace(/\u201C|\u201D/g, '"'); // smart double quotes

  const row: Record<string, unknown> = {
    user_id: userId,
    role: "assistant",
    content: message,
  };
  if (metadata) row.metadata = metadata;

  const { error: insertErr } = await supabaseAdmin.from("v2_chat_messages").insert(row);
  if (insertErr) {
    // Fallback: retry without metadata if column doesn't exist
    console.warn("[v2-trigger] Chat insert failed, retrying without metadata:", insertErr.message);
    await supabaseAdmin.from("v2_chat_messages").insert({ user_id: userId, role: "assistant", content: message });
  }

  // Save to conversation store
  appendToConversation(supabaseAdmin, [
    { role: "assistant", content: message, ts: new Date().toISOString() },
  ], { userId })
    .catch((e: unknown) => console.error("[v2-trigger] Conversation store failed:", e));

  // Look up user's phone for iMessage delivery
  const { data: imUser } = await supabaseAdmin
    .from("imessage_users")
    .select("phone_number")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (imUser?.phone_number) {
    const bubbles = message.split(/\n---\n/).map(b => b.trim()).filter(Boolean);
    for (const bubble of bubbles) {
      await supabaseAdmin.from("outbound_imessages").insert({
        phone_number: imUser.phone_number,
        content: bubble,
        status: "pending",
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
