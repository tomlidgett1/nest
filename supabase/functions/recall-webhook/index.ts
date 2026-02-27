// recall-webhook — Central webhook handler for all Recall.ai events.
//
// Follows sms-inbound pattern: instant 200 response, all processing
// in EdgeRuntime.waitUntil(). Every webhook event is logged to recall_api_logs.
//
// Events handled:
//   calendar.sync_events — new/updated calendar events → schedule bots
//   calendar.update      — calendar sync status changes
//   bot.status_change    — bot joins/records/leaves meeting
//   recording.done       — recording finished → request async transcription
//   transcript.done      — transcript ready → download, summarise, notify, ingest

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  scheduleBot,
  getBot,
  downloadTranscript,
  requestAsyncTranscription,
  listCalendarEvents,
  logRecallApi,
  withRecallLogging,
} from "../_shared/recall-helpers.ts";
import { embedChunks, truncateForEmbedding } from "../_shared/embedder.ts";
import type { ChunkToEmbed } from "../_shared/embedder.ts";
import { insertEmbeddedChunks } from "../_shared/ingestion-helpers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response("ok", { status: 200 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[recall-webhook] Invalid JSON");
    return new Response("ok", { status: 200 });
  }

  // Always return 200 immediately to prevent Recall retries
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(handleWebhook(payload));
  return new Response("ok", { status: 200 });
});

// ══════════════════════════════════════════════════════════════
// EVENT ROUTER
// ══════════════════════════════════════════════════════════════

async function handleWebhook(payload: Record<string, unknown>): Promise<void> {
  const eventType = (payload.event as string) ?? "unknown";

  // Log every webhook
  logRecallApi(supabaseAdmin, {
    direction: "inbound",
    endpoint: `webhook:${eventType}`,
    requestBody: payload,
  });

  try {
    if (eventType === "calendar.sync_events") {
      await handleCalendarSync(payload);
    } else if (eventType === "calendar.update") {
      await handleCalendarUpdate(payload);
    } else if (eventType.startsWith("bot.")) {
      await handleBotStatus(payload);
    } else if (eventType === "recording.done") {
      await handleRecordingDone(payload);
    } else if (eventType === "transcript.done") {
      await handleTranscriptDone(payload);
    } else {
      console.log(`[recall-webhook] Unhandled event: ${eventType}`);
    }
  } catch (e) {
    console.error(`[recall-webhook] Error handling ${eventType}:`, (e as Error).message);
    logRecallApi(supabaseAdmin, {
      direction: "inbound",
      endpoint: `webhook:${eventType}:error`,
      error: (e as Error).message,
    });
  }
}

// ══════════════════════════════════════════════════════════════
// CALENDAR SYNC — schedule bots for events with video links
// ══════════════════════════════════════════════════════════════

async function handleCalendarSync(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const calendarId = data?.calendar_id as string;

  if (!calendarId) {
    console.warn("[recall-webhook] calendar.sync_events missing calendar_id");
    return;
  }

  // Look up which user owns this calendar
  const { data: cal } = await supabaseAdmin
    .from("recall_calendars")
    .select("user_id, recall_calendar_id")
    .eq("recall_calendar_id", calendarId)
    .maybeSingle();

  if (!cal) {
    console.warn(`[recall-webhook] Unknown calendar: ${calendarId}`);
    return;
  }

  // The webhook is just a notification — fetch actual events from Recall API.
  // Only fetch future events (from 1 hour ago to catch in-progress meetings).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const events = await withRecallLogging(
    supabaseAdmin,
    {
      userId: cal.user_id,
      endpoint: `/api/v2/calendar-events/?calendar_id=${calendarId}`,
      method: "GET",
      recallIds: { calendarId },
    },
    () => listCalendarEvents(calendarId, { startTimeGte: oneHourAgo }),
  );

  console.log(`[recall-webhook] calendar.sync_events: fetched ${events.length} future events for calendar ${calendarId}`);

  for (const event of events) {
    const eventId = event.id;
    const meetingUrl = event.meeting_url;
    const title = event.title ?? "Untitled";
    const startTime = event.start_time;
    const endTime = event.end_time;
    const attendees = event.attendees ?? [];

    // Skip events without video links
    if (!meetingUrl) {
      await supabaseAdmin.from("recall_meetings").upsert(
        {
          user_id: cal.user_id,
          recall_calendar_id: calendarId,
          recall_event_id: eventId,
          event_title: title,
          event_start: startTime,
          event_end: endTime ?? null,
          attendees,
          bot_status: "no_meeting_url",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "recall_event_id" },
      );
      continue;
    }

    // Upsert the event
    const { data: meeting } = await supabaseAdmin
      .from("recall_meetings")
      .upsert(
        {
          user_id: cal.user_id,
          recall_calendar_id: calendarId,
          recall_event_id: eventId,
          event_title: title,
          event_start: startTime,
          event_end: endTime ?? null,
          meeting_url: meetingUrl,
          attendees,
          bot_status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "recall_event_id" },
      )
      .select("id, recall_bot_id")
      .maybeSingle();

    // Schedule bot if not already scheduled
    if (meeting && !meeting.recall_bot_id) {
      try {
        const { botId } = await withRecallLogging(
          supabaseAdmin,
          {
            userId: cal.user_id,
            endpoint: `/api/v2/calendar-events/${eventId}/bot/`,
            method: "POST",
            recallIds: { calendarId, eventId },
          },
          () => scheduleBot(eventId, { meetingUrl, startTime }),
        );

        await supabaseAdmin
          .from("recall_meetings")
          .update({
            recall_bot_id: botId,
            bot_status: "scheduled",
            updated_at: new Date().toISOString(),
          })
          .eq("recall_event_id", eventId);

        console.log(`[recall-webhook] Bot scheduled for "${title}" (${botId})`);
      } catch (e) {
        const errMsg = (e as Error).message;
        // 409 = dedup conflict (another webhook already scheduled this bot) — not a real error
        if (errMsg.includes("409")) {
          console.log(`[recall-webhook] Bot already being scheduled for "${title}" (409 dedup conflict, ignoring)`);
        } else {
          console.error(`[recall-webhook] Failed to schedule bot for ${eventId}:`, errMsg);
          await supabaseAdmin
            .from("recall_meetings")
            .update({
              bot_status: "error",
              error_message: errMsg,
              updated_at: new Date().toISOString(),
            })
            .eq("recall_event_id", eventId);
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CALENDAR UPDATE — sync status changes
// ══════════════════════════════════════════════════════════════

async function handleCalendarUpdate(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const calendarId = data?.calendar_id as string;
  const statusCode = (data?.status as Record<string, unknown>)?.code as string;

  if (!calendarId) return;

  const dbStatus =
    statusCode === "connected" ? "active" :
    statusCode === "disconnected" ? "disconnected" :
    statusCode === "syncing" ? "syncing" :
    "error";

  await supabaseAdmin
    .from("recall_calendars")
    .update({
      status: dbStatus,
      error_message: dbStatus === "error" ? `Recall status: ${statusCode}` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("recall_calendar_id", calendarId);

  console.log(`[recall-webhook] calendar.update: ${calendarId} → ${dbStatus}`);
}

// ══════════════════════════════════════════════════════════════
// BOT STATUS CHANGE — track bot progression
// ══════════════════════════════════════════════════════════════

async function handleBotStatus(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const botId = (data?.bot as Record<string, unknown>)?.id as string;
  // Recall nests status under data.data (not data.status)
  const statusObj = (data?.data as Record<string, unknown>) ?? (data?.status as Record<string, unknown>) ?? {};
  const statusCode = (statusObj.code as string) ?? (payload.event as string)?.replace("bot.", "") ?? "unknown";
  const subCode = (statusObj.sub_code as string) ?? null;

  if (!botId) return;

  // Map Recall bot statuses to our simplified states
  let dbStatus: string;
  if (statusCode === "joining_call" || statusCode === "in_waiting_room") {
    dbStatus = "joining";
  } else if (statusCode === "in_call_recording" || statusCode === "in_call_not_recording") {
    dbStatus = "recording";
  } else if (statusCode === "call_ended" || statusCode === "done") {
    dbStatus = "done";
  } else if (statusCode === "fatal" || statusCode === "analysis_failed") {
    dbStatus = "error";
  } else {
    dbStatus = statusCode ?? "unknown";
  }

  const updateData: Record<string, unknown> = {
    bot_status: dbStatus,
    updated_at: new Date().toISOString(),
  };

  if (dbStatus === "error") {
    updateData.error_message = `Bot error: ${statusCode}${subCode ? ` (${subCode})` : ""}`;
  }

  await supabaseAdmin
    .from("recall_meetings")
    .update(updateData)
    .eq("recall_bot_id", botId);

  console.log(`[recall-webhook] bot.status_change: ${botId} → ${statusCode} (mapped: ${dbStatus})`);
}

// ══════════════════════════════════════════════════════════════
// RECORDING DONE — request async transcription
// ══════════════════════════════════════════════════════════════

async function handleRecordingDone(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const recordingId = (data?.recording as Record<string, unknown>)?.id as string;
  const botId = (data?.bot as Record<string, unknown>)?.id as string;

  if (!recordingId || !botId) {
    console.warn("[recall-webhook] recording.done missing recording_id or bot_id");
    return;
  }

  // Update meeting with recording ID
  await supabaseAdmin
    .from("recall_meetings")
    .update({
      recall_recording_id: recordingId,
      bot_status: "done",
      transcript_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("recall_bot_id", botId);

  // Request async transcription (more accurate than real-time)
  try {
    const { transcriptId } = await withRecallLogging(
      supabaseAdmin,
      {
        endpoint: `/api/v1/recording/${recordingId}/create_transcript/`,
        method: "POST",
        recallIds: { botId, recordingId },
      },
      () => requestAsyncTranscription(recordingId),
    );
    console.log(`[recall-webhook] Async transcription requested: ${transcriptId} for recording ${recordingId}`);
  } catch (e) {
    console.error(`[recall-webhook] Async transcription request failed for ${recordingId}:`, (e as Error).message);
    // Try to get transcript from the real-time transcription fallback
    await tryRealtimeTranscriptFallback(botId, recordingId);
  }
}

/**
 * Fallback: if async transcription fails, try to get the real-time transcript
 * that was captured during the meeting.
 */
async function tryRealtimeTranscriptFallback(botId: string, recordingId: string): Promise<void> {
  try {
    const botData = await getBot(botId);
    const recordings = (botData.recordings ?? []) as Array<Record<string, unknown>>;
    const recording = recordings.find((r) => r.id === recordingId) as Record<string, unknown> | undefined;
    const shortcuts = recording?.media_shortcuts as Record<string, unknown> | undefined;
    const transcript = shortcuts?.transcript as Record<string, unknown> | undefined;
    const downloadUrl = (transcript?.data as Record<string, unknown>)?.download_url as string | undefined;

    if (downloadUrl) {
      const text = await downloadTranscript(downloadUrl);
      const { data: meeting } = await supabaseAdmin
        .from("recall_meetings")
        .select("*")
        .eq("recall_bot_id", botId)
        .maybeSingle();

      if (meeting) {
        await processTranscript(meeting, text);
      }
    }
  } catch (e) {
    console.error(`[recall-webhook] Realtime transcript fallback failed for ${botId}:`, (e as Error).message);
    await supabaseAdmin
      .from("recall_meetings")
      .update({ transcript_status: "error", error_message: (e as Error).message })
      .eq("recall_bot_id", botId);
  }
}

// ══════════════════════════════════════════════════════════════
// TRANSCRIPT DONE — download, summarise, notify, ingest
// ══════════════════════════════════════════════════════════════

async function handleTranscriptDone(payload: Record<string, unknown>): Promise<void> {
  const data = payload.data as Record<string, unknown>;
  const recordingId = (data?.recording as Record<string, unknown>)?.id as string;
  const transcriptData = data?.transcript as Record<string, unknown>;
  const botId = (data?.bot as Record<string, unknown>)?.id as string;

  if (!recordingId) {
    console.warn("[recall-webhook] transcript.done missing recording_id");
    return;
  }

  // Find the meeting
  const { data: meeting } = await supabaseAdmin
    .from("recall_meetings")
    .select("*")
    .eq("recall_recording_id", recordingId)
    .maybeSingle();

  if (!meeting) {
    // Try by bot_id
    if (botId) {
      const { data: m } = await supabaseAdmin
        .from("recall_meetings")
        .select("*")
        .eq("recall_bot_id", botId)
        .maybeSingle();
      if (m) {
        await supabaseAdmin.from("recall_meetings").update({
          recall_recording_id: recordingId,
        }).eq("id", m.id);
        await fetchAndProcessTranscript(m, recordingId);
        return;
      }
    }
    console.warn(`[recall-webhook] No meeting found for recording ${recordingId}`);
    return;
  }

  await fetchAndProcessTranscript(meeting, recordingId);
}

async function fetchAndProcessTranscript(
  meeting: Record<string, unknown>,
  recordingId: string,
): Promise<void> {
  try {
    // Get transcript download URL from the bot
    const botId = meeting.recall_bot_id as string;
    const botData = await getBot(botId);
    const recordings = (botData.recordings ?? []) as Array<Record<string, unknown>>;
    const recording = recordings.find((r) => r.id === recordingId) as Record<string, unknown> | undefined;
    const shortcuts = recording?.media_shortcuts as Record<string, unknown> | undefined;
    const transcript = shortcuts?.transcript as Record<string, unknown> | undefined;
    const downloadUrl = (transcript?.data as Record<string, unknown>)?.download_url as string | undefined;

    if (!downloadUrl) {
      console.error(`[recall-webhook] No transcript download URL for recording ${recordingId}`);
      await supabaseAdmin.from("recall_meetings").update({
        transcript_status: "error",
        error_message: "No transcript download URL available",
      }).eq("id", meeting.id);
      return;
    }

    const text = await downloadTranscript(downloadUrl);
    await processTranscript(meeting, text);
  } catch (e) {
    console.error(`[recall-webhook] Transcript processing failed for ${recordingId}:`, (e as Error).message);
    await supabaseAdmin.from("recall_meetings").update({
      transcript_status: "error",
      error_message: (e as Error).message,
    }).eq("id", meeting.id);
  }
}

async function processTranscript(
  meeting: Record<string, unknown>,
  transcriptText: string,
): Promise<void> {
  const meetingId = meeting.id as string;
  const userId = meeting.user_id as string;
  const title = meeting.event_title as string;
  const attendees = (meeting.attendees ?? []) as Array<Record<string, unknown>>;

  // ── Atomic dedup: claim processing with a DB-level guard ──
  // Only one concurrent handler will win; the rest get 0 rows and bail out.
  const { data: claimed } = await supabaseAdmin
    .from("recall_meetings")
    .update({ transcript_status: "summarising", updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .eq("transcript_status", "processing")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    console.log(`[recall-webhook] Transcript already being processed for "${title}" (dedup)`);
    // Still attempt notification in case the first handler crashed before sending it
    await sendPostMeetingNotification(meeting);
    return;
  }

  console.log(`[recall-webhook] Processing transcript for "${title}" (${transcriptText.length} chars)`);

  // Generate LLM summary
  const summary = await generateMeetingSummary(transcriptText, title, attendees);

  // Save transcript + summary
  await supabaseAdmin.from("recall_meetings").update({
    transcript_text: transcriptText,
    summary_text: summary,
    transcript_status: "ready",
    updated_at: new Date().toISOString(),
  }).eq("id", meetingId);

  // Send post-meeting notification (never includes summary/transcript text)
  await sendPostMeetingNotification(meeting);

  // Ingest into search index + extract learnings (fire-and-forget)
  ingestMeetingData(userId, meetingId, title, transcriptText, summary, attendees).catch((e) =>
    console.error(`[recall-webhook] Ingestion failed for ${meetingId}:`, (e as Error).message),
  );
}

// ══════════════════════════════════════════════════════════════
// SUMMARY GENERATION
// ══════════════════════════════════════════════════════════════

async function generateMeetingSummary(
  transcript: string,
  title: string,
  attendees: Array<Record<string, unknown>>,
): Promise<string> {
  const attendeeNames = attendees
    .map((a) => (a.name as string) || (a.email as string) || "")
    .filter(Boolean)
    .join(", ");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: `You are summarising a meeting transcript for someone's personal assistant.
Extract and format:
1. **Key decisions** — what was agreed
2. **Action items** — who committed to what (name + task)
3. **Discussion highlights** — most important points covered
4. **Open questions** — anything unresolved

Meeting: ${title}
Attendees: ${attendeeNames || "unknown"}

Keep it under 400 words. Be specific — use names and concrete details.
Write in a direct, conversational tone. No fluff.`,
          },
          {
            role: "user",
            content: transcript.slice(0, 60_000), // ~15k tokens
          },
        ],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error(`[recall-webhook] Summary LLM failed: ${resp.status}`);
      return "Summary generation failed — full transcript is available.";
    }

    const result = await resp.json();
    return result.choices?.[0]?.message?.content ?? "Summary unavailable.";
  } catch (e) {
    console.error("[recall-webhook] Summary generation error:", (e as Error).message);
    return "Summary generation failed — full transcript is available.";
  }
}

// ══════════════════════════════════════════════════════════════
// POST-MEETING NOTIFICATION
// ══════════════════════════════════════════════════════════════

async function sendPostMeetingNotification(
  meeting: Record<string, unknown>,
): Promise<void> {
  if (meeting.notification_sent) return;

  const meetingId = meeting.id as string;
  const userId = meeting.user_id as string;
  const title = meeting.event_title as string;
  const attendees = (meeting.attendees ?? []) as Array<Record<string, unknown>>;

  // ── Atomic dedup: claim this notification with a DB-level guard ──
  // Only one concurrent handler will succeed; the rest get 0 rows affected.
  const { data: claimed } = await supabaseAdmin
    .from("recall_meetings")
    .update({ notification_sent: true, updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .is("notification_sent", false)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    console.log(`[recall-webhook] Notification already sent for "${title}" (dedup)`);
    return;
  }

  // Look up user's phone number (iMessage)
  const { data: imsgUser } = await supabaseAdmin
    .from("imessage_users")
    .select("phone_number")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!imsgUser?.phone_number) {
    console.warn(`[recall-webhook] No iMessage phone for user ${userId}, skipping notification`);
    return;
  }

  // Build concise notification — NEVER include summary or transcript text.
  // The user can ask for notes later via iMessage and the agent will fetch them.
  const attendeeFirstNames = attendees
    .map((a) => {
      const name = (a.name as string) ?? "";
      return name.split(" ")[0] || ((a.email as string) ?? "").split("@")[0];
    })
    .filter(Boolean)
    .slice(0, 3);

  const attendeeStr = attendeeFirstNames.length > 0
    ? ` with ${attendeeFirstNames.join(", ")}`
    : "";

  const message = `Just wrapped up your ${title}${attendeeStr}! I took notes — just ask whenever you want the recap.`;

  // Queue via outbound_imessages (picked up by iMessage bridge poller)
  await supabaseAdmin.from("outbound_imessages").insert({
    phone_number: imsgUser.phone_number,
    content: message,
    status: "pending",
  });

  // Save to chat history so the agent has context for follow-up
  await supabaseAdmin.from("v2_chat_messages").insert({
    user_id: userId,
    role: "assistant",
    content: message,
    source: "imessage",
  });

  console.log(`[recall-webhook] Post-meeting notification queued for "${title}"`);
}

// ══════════════════════════════════════════════════════════════
// MEMORY / RAG INGESTION
// ══════════════════════════════════════════════════════════════

async function ingestMeetingData(
  userId: string,
  meetingId: string,
  title: string,
  transcript: string,
  summary: string,
  attendees: Array<Record<string, unknown>>,
): Promise<void> {
  const attendeeNames = attendees
    .map((a) => (a.name as string) || (a.email as string) || "")
    .filter(Boolean)
    .join(", ");

  // 1. Build chunks for embedding: summary + transcript chunks
  const chunksToEmbed: ChunkToEmbed[] = [];

  // Summary chunk
  chunksToEmbed.push({
    text: truncateForEmbedding(`${title}\n\nAttendees: ${attendeeNames}\n\n${summary}`),
    sourceType: "note_summary",
    sourceId: `recall:${meetingId}`,
    title,
    chunkIndex: 0,
    contentHash: simpleHash(`recall:${meetingId}:summary:${summary.slice(0, 100)}`),
    metadata: {
      attendees: attendeeNames,
      recall_meeting_id: meetingId,
      type: "meeting_summary",
    },
  });

  // Transcript chunks
  const textChunks = chunkTranscript(transcript, 1500);
  for (let i = 0; i < textChunks.length; i++) {
    chunksToEmbed.push({
      text: truncateForEmbedding(`${title} — transcript part ${i + 1}\n\n${textChunks[i]}`),
      sourceType: "utterance_chunk",
      sourceId: `recall:${meetingId}:chunk:${i}`,
      title,
      chunkIndex: i,
      contentHash: simpleHash(`recall:${meetingId}:chunk:${i}:${textChunks[i].slice(0, 50)}`),
      metadata: {
        recall_meeting_id: meetingId,
        chunk_index: i,
        type: "meeting_transcript",
      },
    });
  }

  // 2. Generate embeddings (batch call to OpenAI text-embedding-3-large)
  const embedded = await embedChunks(chunksToEmbed);

  // 3. Insert into search_documents + search_embeddings (proper two-table pipeline)
  const { inserted, errors } = await insertEmbeddedChunks(
    supabaseAdmin,
    userId,
    embedded,
  );

  console.log(`[recall-webhook] Embedded ${inserted} chunks (${errors} errors) for "${title}"`);

  // 4. Extract learnings from summary
  await extractMeetingLearnings(userId, title, summary, attendees);

  // Mark insights extracted
  await supabaseAdmin.from("recall_meetings").update({
    insights_extracted: true,
  }).eq("id", meetingId);

  console.log(`[recall-webhook] Ingested ${embedded.length} documents + learnings for "${title}"`);
}

/**
 * Extract learnings from meeting summary → v2_user_learnings.
 * Follows memory-service.ts extractLearnings pattern.
 */
async function extractMeetingLearnings(
  userId: string,
  title: string,
  summary: string,
  attendees: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "system",
            content: `Extract learnings from this meeting summary. Return a JSON array of objects, each with:
- "category": one of "commitment", "fact", "relationship", "preference"
- "content": the specific learning (1 sentence)
- "emotional_weight": "high", "medium", or "low"

Focus on:
- Action items the user committed to (category: commitment)
- Important facts or decisions (category: fact)
- People and their roles/relevance (category: relationship)

Return ONLY the JSON array. Max 8 items. Skip obvious/generic items.`,
          },
          {
            role: "user",
            content: `Meeting: ${title}\nSummary:\n${summary}`,
          },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });

    if (!resp.ok) return;

    const result = await resp.json();
    const text = result.choices?.[0]?.message?.content ?? "[]";

    // Parse JSON from response (handle markdown code blocks)
    const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    let learnings: Array<Record<string, string>>;
    try {
      learnings = JSON.parse(cleaned);
    } catch {
      console.warn("[recall-webhook] Failed to parse meeting learnings JSON");
      return;
    }

    if (!Array.isArray(learnings)) return;

    for (const learning of learnings.slice(0, 8)) {
      await supabaseAdmin.from("v2_user_learnings").insert({
        user_id: userId,
        category: learning.category || "fact",
        content: learning.content,
        context: `Meeting: ${title}`,
        emotional_weight: learning.emotional_weight || "medium",
        confidence: 0.7,
        source: "inferred",
        active: true,
      }).then(() => {}).catch(() => {});
    }
  } catch (e) {
    console.error("[recall-webhook] Meeting learning extraction failed:", (e as Error).message);
  }
}

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function chunkTranscript(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `recall_${Math.abs(hash).toString(36)}`;
}
