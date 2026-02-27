// recall-helpers.ts — Recall.ai Calendar V2 API wrapper for Nest.
//
// Follows gmail-helpers.ts pattern: centralized API calls with timeouts,
// retry logic, and fire-and-forget logging to recall_api_logs.
//
// Recall.ai is used for automatic meeting recording. Nest has a single
// Recall.ai account; users connect their own calendars via OAuth.
// The bot appears as "Nest" in meetings — never expose "Recall.ai" to users.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════

const RECALL_API_KEY = Deno.env.get("RECALL_AI_API_KEY") ?? "";
const RECALL_BASE_URL = Deno.env.get("RECALL_BASE_URL") ?? "https://us-west-2.recall.ai";
const FETCH_TIMEOUT_MS = 10_000;

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export interface RecallCalendarResponse {
  id: string;
  platform_email: string | null;
  status: { code: string; updated_at: string };
  created_at: string;
}

export interface RecallBotConfig {
  bot_name: string;
  join_at?: string;
  recording_config?: {
    transcript?: {
      provider?: { recall_ai?: Record<string, unknown> };
      diarization?: { use_separate_streams_when_available?: boolean };
    };
    video_mixed_layout?: string;
    start_recording_on?: string;
    participant_events?: Record<string, unknown>;
  };
  automatic_leave?: {
    waiting_room_timeout?: number;
    noone_joined_timeout?: number;
    everyone_left_timeout?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface RecallEventData {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  attendees: Array<{ name?: string; email?: string; is_organizer?: boolean }>;
  raw?: Record<string, unknown>;
}

export interface RecallApiLogParams {
  userId?: string;
  direction: "outbound" | "inbound";
  endpoint: string;
  method?: string;
  requestBody?: unknown;
  responseStatus?: number;
  responseBody?: unknown;
  error?: string;
  durationMs?: number;
  recallIds?: {
    calendarId?: string;
    eventId?: string;
    botId?: string;
    recordingId?: string;
  };
}

// ══════════════════════════════════════════════════════════════
// FETCH UTILITIES (mirrors tools.ts pattern)
// ══════════════════════════════════════════════════════════════

function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function retryFetch(
  url: string | URL,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const MAX_ATTEMPTS = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, init, timeoutMs);
      if (resp.ok || (resp.status >= 400 && resp.status < 500 && resp.status !== 429)) {
        return resp;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoff = (attempt + 1) * 1500;
        console.warn(`[recall] ${resp.status} on attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return resp;
    } catch (e) {
      lastError = e as Error;
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoff = (attempt + 1) * 1500;
        console.warn(`[recall] Error on attempt ${attempt + 1}: ${lastError.message}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError ?? new Error("retryFetch: max attempts exceeded");
}

function recallHeaders(): Record<string, string> {
  return {
    Authorization: `Token ${RECALL_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ══════════════════════════════════════════════════════════════
// CALENDAR MANAGEMENT
// ══════════════════════════════════════════════════════════════

/**
 * Connect a user's calendar to Recall.ai. Passes the user's existing
 * Google OAuth refresh token + Nest's client credentials.
 * Recall.ai will sync the user's primary calendar and send webhooks.
 */
export async function createRecallCalendar(
  oauthClientId: string,
  oauthClientSecret: string,
  oauthRefreshToken: string,
  platform: "google_calendar" | "microsoft_outlook",
): Promise<{ calendarId: string; status: string }> {
  const url = `${RECALL_BASE_URL}/api/v2/calendars/`;
  const body = {
    platform,
    oauth_client_id: oauthClientId,
    oauth_client_secret: oauthClientSecret,
    oauth_refresh_token: oauthRefreshToken,
  };

  const resp = await retryFetch(url, {
    method: "POST",
    headers: recallHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`createRecallCalendar failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return { calendarId: data.id, status: data.status?.code ?? "pending" };
}

/**
 * Get a calendar's current sync status from Recall.ai.
 */
export async function getRecallCalendar(
  calendarId: string,
): Promise<RecallCalendarResponse> {
  const url = `${RECALL_BASE_URL}/api/v2/calendars/${calendarId}/`;
  const resp = await retryFetch(url, {
    method: "GET",
    headers: recallHeaders(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`getRecallCalendar failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Disconnect and delete a calendar from Recall.ai.
 * Automatically unschedules all bots for future events.
 */
export async function deleteRecallCalendar(calendarId: string): Promise<void> {
  const url = `${RECALL_BASE_URL}/api/v2/calendars/${calendarId}/`;
  const resp = await retryFetch(url, {
    method: "DELETE",
    headers: recallHeaders(),
  });

  if (!resp.ok && resp.status !== 404) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`deleteRecallCalendar failed (${resp.status}): ${errText}`);
  }
}

/**
 * List calendar events from Recall.ai. The calendar.sync_events webhook
 * only notifies us that events changed — we must fetch the actual events.
 * Filters to future events with meeting URLs by default.
 */
export async function listCalendarEvents(
  calendarId: string,
  opts?: { updatedAtGte?: string; startTimeGte?: string },
): Promise<RecallEventData[]> {
  const params = new URLSearchParams();
  params.set("calendar_id", calendarId);
  if (opts?.updatedAtGte) params.set("updated_at__gte", opts.updatedAtGte);
  if (opts?.startTimeGte) params.set("start_time__gte", opts.startTimeGte);

  const allEvents: RecallEventData[] = [];
  let url: string | null = `${RECALL_BASE_URL}/api/v2/calendar-events/?${params.toString()}`;

  // Paginate through results
  while (url) {
    const resp = await retryFetch(url, {
      method: "GET",
      headers: recallHeaders(),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      throw new Error(`listCalendarEvents failed (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    const results = (data.results ?? []) as Array<Record<string, unknown>>;

    for (const ev of results) {
      if (ev.is_deleted) continue;

      // Parse raw Google Calendar event data for attendees
      let attendees: Array<{ name?: string; email?: string; is_organizer?: boolean }> = [];
      try {
        const raw = typeof ev.raw === "string" ? JSON.parse(ev.raw) : ev.raw;
        if (raw?.attendees) {
          attendees = (raw.attendees as Array<Record<string, unknown>>).map((a) => ({
            name: (a.displayName as string) ?? undefined,
            email: (a.email as string) ?? undefined,
            is_organizer: (a.organizer as boolean) ?? false,
          }));
        }
      } catch { /* ignore parse errors */ }

      allEvents.push({
        id: ev.id as string,
        title: extractTitle(ev),
        start_time: ev.start_time as string,
        end_time: ev.end_time as string,
        meeting_url: (ev.meeting_url as string) ?? null,
        attendees,
        raw: typeof ev.raw === "string" ? undefined : (ev.raw as Record<string, unknown>),
      });
    }

    url = (data.next as string) ?? null;
  }

  return allEvents;
}

/** Extract title from raw Google Calendar event data */
function extractTitle(ev: Record<string, unknown>): string {
  try {
    const raw = typeof ev.raw === "string" ? JSON.parse(ev.raw) : ev.raw;
    if (raw?.summary) return raw.summary as string;
  } catch { /* ignore */ }
  return "Untitled";
}

// ══════════════════════════════════════════════════════════════
// BOT SCHEDULING
// ══════════════════════════════════════════════════════════════

const DEFAULT_BOT_CONFIG: RecallBotConfig = {
  bot_name: "Nest AI Meeting Notes",
  recording_config: {
    transcript: {
      provider: { meeting_captions: {} },
    },
    video_mixed_layout: "audio_only",
    start_recording_on: "participant_join",
    participant_events: {},
  },
  automatic_leave: {
    waiting_room_timeout: 600,     // 10 min in waiting room
    noone_joined_timeout: 600,     // 10 min if nobody shows
    everyone_left_timeout: 3,      // 3 sec after everyone leaves
  },
};

/**
 * Schedule a Recall.ai bot for a calendar event (Calendar V2).
 * The Calendar V2 endpoint requires:
 *   - deduplication_key: prevents duplicate bots for the same meeting
 *   - bot_config: nested bot configuration (name, recording, leave settings)
 */
export async function scheduleBot(
  eventId: string,
  opts?: {
    meetingUrl?: string;
    startTime?: string;
    config?: Partial<RecallBotConfig>;
  },
): Promise<{ botId: string }> {
  const url = `${RECALL_BASE_URL}/api/v2/calendar-events/${eventId}/bot/`;
  const config = opts?.config;

  // Dedup key: one bot per meeting (recommended by Recall docs)
  const dedupParts = [
    opts?.meetingUrl ?? eventId,
    opts?.startTime ?? new Date().toISOString(),
  ];
  const deduplicationKey = dedupParts.join("-");

  const botConfig: Record<string, unknown> = {
    bot_name: config?.bot_name ?? DEFAULT_BOT_CONFIG.bot_name,
    recording_config: {
      ...DEFAULT_BOT_CONFIG.recording_config,
      ...(config?.recording_config ?? {}),
    },
    automatic_leave: {
      ...DEFAULT_BOT_CONFIG.automatic_leave,
      ...(config?.automatic_leave ?? {}),
    },
  };

  const body = {
    deduplication_key: deduplicationKey,
    bot_config: botConfig,
  };

  const resp = await retryFetch(url, {
    method: "POST",
    headers: recallHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`scheduleBot failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  // Calendar V2 returns the calendar event; bot ID is in the bots array
  const bots = (data.bots ?? []) as Array<Record<string, unknown>>;
  const botId = bots.length > 0
    ? (bots[bots.length - 1].bot_id as string)
    : (data.id as string);
  return { botId };
}

/**
 * Remove a scheduled bot from a calendar event.
 */
export async function removeBot(eventId: string): Promise<void> {
  const url = `${RECALL_BASE_URL}/api/v2/calendar-events/${eventId}/bot/`;
  const resp = await retryFetch(url, {
    method: "DELETE",
    headers: recallHeaders(),
  });

  if (!resp.ok && resp.status !== 404) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`removeBot failed (${resp.status}): ${errText}`);
  }
}

// ══════════════════════════════════════════════════════════════
// RECORDING & TRANSCRIPT
// ══════════════════════════════════════════════════════════════

/**
 * Retrieve a recording's details including media download URLs.
 */
export async function getRecording(
  recordingId: string,
): Promise<Record<string, unknown>> {
  const url = `${RECALL_BASE_URL}/api/v1/recording/${recordingId}/`;
  const resp = await retryFetch(url, {
    method: "GET",
    headers: recallHeaders(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`getRecording failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Retrieve bot details (recordings, status, metadata).
 */
export async function getBot(botId: string): Promise<Record<string, unknown>> {
  const url = `${RECALL_BASE_URL}/api/v1/bot/${botId}/`;
  const resp = await retryFetch(url, {
    method: "GET",
    headers: recallHeaders(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`getBot failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Download a transcript from a Recall.ai pre-signed URL.
 * Returns the raw transcript as formatted text with speaker labels.
 */
export async function downloadTranscript(downloadUrl: string): Promise<string> {
  const resp = await fetchWithTimeout(downloadUrl, { method: "GET" }, 30_000);

  if (!resp.ok) {
    throw new Error(`downloadTranscript failed (${resp.status})`);
  }

  const data = await resp.json();

  // Recall.ai transcript format: array of {speaker, words: [{text, start_timestamp, end_timestamp}]}
  if (Array.isArray(data)) {
    return data
      .map((seg: { speaker?: string; words?: Array<{ text: string }> }) => {
        const speaker = seg.speaker ?? "Unknown";
        const text = (seg.words ?? []).map((w) => w.text).join(" ");
        return `${speaker}: ${text}`;
      })
      .join("\n\n");
  }

  // Fallback: return stringified
  return typeof data === "string" ? data : JSON.stringify(data);
}

/**
 * Request async transcription for a recording.
 * Async transcription is more accurate than real-time.
 * A transcript.done webhook fires when complete.
 */
export async function requestAsyncTranscription(
  recordingId: string,
): Promise<{ transcriptId: string }> {
  const url = `${RECALL_BASE_URL}/api/v1/recording/${recordingId}/create_transcript/`;
  const body = {
    provider: {
      recallai_async: {},
    },
  };

  const resp = await retryFetch(url, {
    method: "POST",
    headers: recallHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "unknown");
    throw new Error(`requestAsyncTranscription failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  return { transcriptId: data.id };
}

// ══════════════════════════════════════════════════════════════
// LOGGING
// ══════════════════════════════════════════════════════════════

/**
 * Fire-and-forget log to recall_api_logs. Never blocks the main flow.
 */
export function logRecallApi(
  supabase: SupabaseClient,
  params: RecallApiLogParams,
): void {
  supabase
    .from("recall_api_logs")
    .insert({
      user_id: params.userId ?? null,
      direction: params.direction,
      endpoint: params.endpoint,
      method: params.method ?? null,
      request_body: params.requestBody ?? null,
      response_status: params.responseStatus ?? null,
      response_body: params.responseBody ?? null,
      error: params.error ?? null,
      duration_ms: params.durationMs ?? null,
      recall_ids: params.recallIds ?? null,
    })
    .then(() => {})
    .catch((e: Error) => console.error("[recall-log] Write failed:", e.message));
}

/**
 * Wrapper that calls a Recall.ai API function, logs the call, and returns the result.
 * Used by edge functions to ensure all API calls are audited.
 */
export async function withRecallLogging<T>(
  supabase: SupabaseClient,
  params: {
    userId?: string;
    endpoint: string;
    method: string;
    requestBody?: unknown;
    recallIds?: RecallApiLogParams["recallIds"];
  },
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logRecallApi(supabase, {
      ...params,
      direction: "outbound",
      responseStatus: 200,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (e) {
    logRecallApi(supabase, {
      ...params,
      direction: "outbound",
      error: (e as Error).message,
      durationMs: Date.now() - start,
    });
    throw e;
  }
}
