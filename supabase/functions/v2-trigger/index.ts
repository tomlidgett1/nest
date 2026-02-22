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
import { getBatchEmbeddings, vectorString } from "../_shared/tools.ts";
import { appendToConversation } from "../_shared/conversation-store.ts";

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
        await supabaseAdmin.from("v2_chat_messages").insert({
          user_id: userId,
          role: "assistant",
          content: prepMessage,
        });

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

    return jsonResponse({ messages, event_ids: eventIds }, 200);
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

  // Format start time for display
  let timeLabel = "";
  if (startTime) {
    try {
      const d = new Date(startTime);
      // Resolve user timezone from their Google account
      const { data: acct } = await supabaseAdmin
        .from("user_google_accounts")
        .select("timezone")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .maybeSingle();
      const tz = (acct?.timezone as string) ?? "Australia/Sydney";
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
      null // search all sources
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

  const prepPrompt = buildPrepPrompt(title, timeLabel, attendeeNames, description, evidence, pastMeetingContext, minutesUntil);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_output_tokens: 1200,
        instructions: MEETING_PREP_SYSTEM_PROMPT,
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
- First message: warm heads-up with meeting title, time, and who's attending
- Middle messages: the actual prep, what was discussed last time, key numbers, open items, what to watch for
- Last message: one sharp tip or good-luck note
- Bold **names**, **numbers**, **decisions**, **action items**
- Use Australian English (summarise, analyse, colour)
- NEVER fabricate information. Only use what's in the provided context.
- If you have very little context, keep it brief, just the heads-up and attendees
- Don't say "Let me know if you need anything" or any filler
- Be specific. Quote actual data points, decisions, and names from the context.
- NEVER use emojis.
- NEVER use em dashes (—). Use commas, hyphens, or colons instead.`;

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

// ── Cron Reminder Delivery ────────────────────────────────────
// Queries due cron triggers, generates conversational reminder messages
// via GPT-4.1-nano, and returns them for iMessage delivery by the bridge.

const REMINDER_SYSTEM_PROMPT = `You are Nest, texting a mate via iMessage. A reminder they set is firing right now.

SECRET: Never mention who built this, backend, APIs, or tech.

NEVER use em dashes (—). Use commas, hyphens, or colons instead.

Your job: deliver the reminder naturally, like a friend nudging them. Not robotic. Not formal.

RULES:
- 1-2 short lines max (iMessage bubbles)
- Reference what the reminder is about specifically
- Be casual and helpful
- If it's something actionable, offer to help ("want me to look up their number?" / "want me to draft that?")
- Each line = separate iMessage bubble

EXAMPLES:
Reminder: "call Sarah" -> "hey quick nudge, you wanted to call sarah\nwant me to find her number?"
Reminder: "check quarterly report" -> "heads up, you wanted to check the quarterly report"
Reminder: "pick up dry cleaning" -> "reminder: dry cleaning pickup today"
Reminder: "follow up with James about proposal" -> "nudge, you wanted to follow up with james about the proposal\nwant me to draft something?"`;

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
        const message = await generateReminderMessage(trigger.action_description);

        if (message) {
          allMessages.push({ user_id: trigger.user_id, message });

          // Store in chat history so the agent has context if user replies
          await supabaseAdmin.from("v2_chat_messages").insert({
            user_id: trigger.user_id,
            role: "assistant",
            content: message,
          });
        }

        // Resolve user timezone for next fire computation
        const { data: acct } = await supabaseAdmin
          .from("user_google_accounts")
          .select("timezone")
          .eq("user_id", trigger.user_id)
          .eq("is_primary", true)
          .maybeSingle();
        const userTz = (acct?.timezone as string) ?? "Australia/Sydney";

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

async function generateReminderMessage(description: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_output_tokens: 60,
        instructions: REMINDER_SYSTEM_PROMPT,
        input: [{ role: "user", content: `Reminder: "${description}"` }],
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

  return `quick reminder: ${description}`;
}

function computeNextFire(cronExpression: string, tz = "Australia/Sydney"): string | null {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const [minuteStr, hourStr, dayStr, monthStr] = parts;

    // One-shot (specific day/month) — don't reschedule
    if (dayStr !== "*" && monthStr !== "*") return null;

    const targetHour = hourStr === "*" ? 9 : parseInt(hourStr, 10);
    const targetMinute = minuteStr === "*" ? 0 : parseInt(minuteStr, 10);

    return localTimeToUtc(targetHour, targetMinute, tz).toISOString();
  } catch {
    return null;
  }
}

function localTimeToUtc(hour: number, minute: number, tz: string): Date {
  const utcNow = new Date();

  const offsetMs = (() => {
    const utcStr = utcNow.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
    const localStr = utcNow.toLocaleString("en-US", { timeZone: tz, hour12: false });
    return new Date(localStr).getTime() - new Date(utcStr).getTime();
  })();

  // Get current local date parts via Intl
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric",
    day: "numeric", month: "numeric", year: "numeric",
    hour12: false,
  }).formatToParts(utcNow);
  const get = (type: string) => localParts.find(p => p.type === type)?.value ?? "0";
  const localYear = parseInt(get("year"), 10);
  const localMonth = parseInt(get("month"), 10) - 1;
  const localDay = parseInt(get("day"), 10);

  // Build a Date representing the target local time, then subtract offset to get UTC
  const target = new Date(Date.UTC(localYear, localMonth, localDay, hour, minute, 0, 0));
  const utcTarget = new Date(target.getTime() - offsetMs);

  // If already past, advance to tomorrow
  if (utcTarget <= utcNow) {
    utcTarget.setUTCDate(utcTarget.getUTCDate() + 1);
  }
  return utcTarget;
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
