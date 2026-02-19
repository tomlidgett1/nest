// tools.ts v3 — Unified tool execution layer for Nest.
//
// All tools return JSON strings. The orchestrator passes results straight
// to the model as context — no parsing needed.
//
// Changes from v2:
//   - Tool names aligned to orchestrator v3 definitions
//   - Consolidated: 4 trigger tools → manage_reminder
//   - Consolidated: 4 contact tools → contacts_search + contacts_manage
//   - Unified: compose_draft + reply_with_draft → send_draft (with reply_all)
//   - Added: send_email, get_email, document_search, create_note,
//            weather_lookup, get_meeting_detail
//   - web_search: Tavily direct (fallback to OpenAI Responses API)
//   - 10s timeout on every external fetch (fetchWithTimeout)
//   - 1-retry with backoff on external APIs (retryFetch)
//   - Contacts warmup: fire-and-forget, non-blocking, per-session
//   - Timezone: proper Intl offset math, no toLocaleString date parsing
//   - create_note: async fire-and-forget indexing
//   - document_search: parallel fullText + name search, deduplicated
//   - Embedding cache: LRU to avoid re-embedding identical queries
//   - Consistent error shape: { error, error_type?, hint? }

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getGoogleAccessToken,
  createGmailDraft,
  createGmailReplyDraft,
  listGmailMessages,
  getGmailMessage,
} from "./gmail-helpers.ts";

// ── Config ───────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const PDL_API_KEY = Deno.env.get("PDL_API_KEY") ?? "";
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const WEATHER_API_KEY = Deno.env.get("WEATHER_API_KEY") ?? "";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const PEOPLE_API = "https://people.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_TZ = "Australia/Sydney";

// ── Contacts warmup cache ────────────────────────────────────
// Google People API requires a warmup call before search works.
// On Deno Edge this resets per cold start. We fire warmup as a
// non-blocking background task on first contacts_search per invocation.
// Worst case: first search returns empty, user retries, second works.

const contactsWarmupState = new Map<string, "pending" | "ready">();

function ensureContactsWarmup(accessToken: string, userId: string): void {
  if (contactsWarmupState.has(userId)) return;
  contactsWarmupState.set(userId, "pending");

  const readMask = "names,emailAddresses,phoneNumbers,organizations";
  fetchWithTimeout(
    `${PEOPLE_API}/people:searchContacts?query=&readMask=${readMask}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    5000,
  )
    .then(() => new Promise((r) => setTimeout(r, 800)))
    .then(() => contactsWarmupState.set(userId, "ready"))
    .catch(() => contactsWarmupState.delete(userId));
}

// ══════════════════════════════════════════════════════════════
// FETCH UTILITIES
// ══════════════════════════════════════════════════════════════

/**
 * fetch() with AbortSignal timeout. Every external API call
 * goes through this so a hung Google/Tavily/PDL endpoint
 * can't stall the entire tool loop.
 */
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

/**
 * Fetch with 1 retry + exponential backoff. Catches transient
 * failures from Google, Tavily, PDL, WeatherAPI.
 *
 * Retries on: network error, 429, 500-503.
 * Does NOT retry on: 400, 401, 403, 404 (client errors).
 */
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
        console.warn(`[fetch] ${resp.status} on attempt ${attempt + 1}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      return resp;
    } catch (e) {
      lastError = e as Error;
      if (attempt < MAX_ATTEMPTS - 1) {
        const backoff = (attempt + 1) * 1500;
        console.warn(`[fetch] Error on attempt ${attempt + 1}: ${lastError.message}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw lastError ?? new Error("retryFetch: max attempts exceeded");
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Execute a tool by name and return a JSON string result.
 *
 * Contract:
 * - Always returns a JSON string (never throws)
 * - Success: tool-specific JSON shape
 * - Failure: { error: string, error_type?: string, hint?: string }
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient,
): Promise<string> {
  try {
    const result = await dispatch(name, args, userId, supabase);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error(`[tools] ${name} failed:`, msg);

    if (isGoogleAuthError(msg)) {
      return JSON.stringify({
        error: "Google account access expired. Please reconnect in Settings > Accounts.",
        error_type: "google_auth",
      });
    }

    return JSON.stringify({
      error: msg,
      hint: "Tell the user you couldn't pull this up and offer to retry.",
    });
  }
}

function isGoogleAuthError(msg: string): boolean {
  return (
    msg.includes("GOOGLE_REAUTH_REQUIRED") ||
    msg.includes("invalid_grant") ||
    msg.includes("Google token refresh failed") ||
    msg.includes("Token has been expired or revoked")
  );
}

// ── Dispatcher ───────────────────────────────────────────────

async function dispatch(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient,
): Promise<unknown> {
  switch (name) {
    case "calendar_lookup":     return calendarLookup(userId, supabase, args);
    case "calendar_create":     return calendarCreate(userId, supabase, args);
    case "calendar_update":     return calendarUpdate(userId, supabase, args);
    case "calendar_delete":     return calendarDelete(userId, supabase, args);
    case "semantic_search":     return semanticSearch(userId, supabase, args);
    case "get_meeting_detail":  return getMeetingDetail(userId, supabase, args);
    case "person_lookup":       return personLookup(args);
    case "contacts_search":     return contactsSearch(userId, supabase, args);
    case "contacts_manage":     return contactsManage(userId, supabase, args);
    case "gmail_search":        return gmailSearch(userId, supabase, args);
    case "get_email":           return getEmail(userId, supabase, args);
    case "send_draft":          return sendDraft(userId, supabase, args);
    case "send_email":          return sendEmail(userId, supabase, args);
    case "web_search":          return webSearch(args);
    case "manage_reminder":     return manageReminder(userId, supabase, args);
    case "document_search":     return documentSearch(userId, supabase, args);
    case "create_note":         return createNote(userId, supabase, args);
    case "weather_lookup":      return weatherLookup(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ══════════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════════

async function calendarLookup(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;
  const { timeMin, timeMax } = resolveTimeRange(args.range as string, tz);
  const maxResults = (args.max_results as number) ?? 15;

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
    timeZone: tz,
  });

  const query = (args.query as string)?.toLowerCase();

  const resp = await retryFetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Calendar lookup failed (${resp.status})`);

  const data = await resp.json();
  let events = (data.items ?? []).map(formatCalendarEvent);

  if (query) {
    events = events.filter((e: any) =>
      e.title?.toLowerCase().includes(query) ||
      e.attendees?.some((a: string) => a.toLowerCase().includes(query)) ||
      e.description?.toLowerCase().includes(query)
    );
  }

  const now = new Date();
  return events.map((e: any) => {
    const start = new Date(e.start);
    const end = new Date(e.end);
    let status: string;
    if (end < now) status = "ALREADY_HAPPENED";
    else if (start <= now && end >= now) status = "HAPPENING_NOW";
    else status = "UPCOMING";
    return { ...e, status };
  });
}

/**
 * Resolve a natural-language range into ISO timestamps.
 *
 * FIX #4: Uses Intl.DateTimeFormat with en-CA locale to get
 * "YYYY-MM-DD" in the target timezone. No toLocaleString parsing.
 */
function resolveTimeRange(range: string, tz: string): { timeMin: string; timeMax: string } {
  const now = new Date();
  const todayLocal = getLocalDateParts(now, tz);

  const lower = (range ?? "today").toLowerCase().trim();

  const makeDay = (year: number, month: number, day: number) => ({
    timeMin: new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00`).toISOString(),
    timeMax: new Date(`${year}-${pad(month)}-${pad(day)}T23:59:59`).toISOString(),
  });

  switch (lower) {
    case "today":
      return makeDay(todayLocal.year, todayLocal.month, todayLocal.day);

    case "tomorrow": {
      const d = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day + 1);
      return makeDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    case "yesterday": {
      const d = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day - 1);
      return makeDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    case "this_week":
    case "this week": {
      const base = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day);
      const dow = base.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(base);
      monday.setDate(monday.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        timeMin: makeDay(monday.getFullYear(), monday.getMonth() + 1, monday.getDate()).timeMin,
        timeMax: makeDay(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate()).timeMax,
      };
    }

    case "next_week":
    case "next week": {
      const base = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day);
      const dow = base.getDay();
      const daysToNextMonday = dow === 0 ? 1 : 8 - dow;
      const monday = new Date(base);
      monday.setDate(monday.getDate() + daysToNextMonday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        timeMin: makeDay(monday.getFullYear(), monday.getMonth() + 1, monday.getDate()).timeMin,
        timeMax: makeDay(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate()).timeMax,
      };
    }

    case "last_week":
    case "last week": {
      const base = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day);
      const dow = base.getDay();
      const daysBackToLastMonday = dow === 0 ? 13 : dow + 6;
      const monday = new Date(base);
      monday.setDate(monday.getDate() - daysBackToLastMonday);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      return {
        timeMin: makeDay(monday.getFullYear(), monday.getMonth() + 1, monday.getDate()).timeMin,
        timeMax: makeDay(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate()).timeMax,
      };
    }

    default: {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const isNext = lower.startsWith("next ");
      const dayName = lower.replace("next ", "").trim();
      const targetDay = days.indexOf(dayName);

      if (targetDay !== -1) {
        const base = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day);
        const currentDay = base.getDay();
        let daysAhead = targetDay - currentDay;
        if (daysAhead <= 0 || isNext) daysAhead += 7;
        base.setDate(base.getDate() + daysAhead);
        return makeDay(base.getFullYear(), base.getMonth() + 1, base.getDate());
      }

      const daysMatch = lower.match(/next\s+(\d+)\s+days?/);
      if (daysMatch) {
        const n = parseInt(daysMatch[1], 10);
        const end = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day + n);
        return {
          timeMin: now.toISOString(),
          timeMax: makeDay(end.getFullYear(), end.getMonth() + 1, end.getDate()).timeMax,
        };
      }

      return makeDay(todayLocal.year, todayLocal.month, todayLocal.day);
    }
  }
}

function getLocalDateParts(date: Date, tz: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const str = fmt.format(date); // "YYYY-MM-DD"
  const [y, m, d] = str.split("-").map(Number);
  return { year: y, month: m, day: d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatCalendarEvent(e: any): Record<string, unknown> {
  const result: Record<string, unknown> = {
    event_id: e.id,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    all_day: !!e.start?.date,
    location: e.location ?? null,
    description: e.description ? e.description.slice(0, 300) : null,
    attendees: (e.attendees ?? []).map((a: any) => a.email),
    organizer: e.organizer?.email ?? null,
    html_link: e.htmlLink ?? null,
    recurring: !!e.recurringEventId,
  };
  if (e.conferenceData?.entryPoints) {
    const meet = e.conferenceData.entryPoints.find((ep: any) => ep.entryPointType === "video");
    if (meet) result.meet_link = meet.uri;
  }
  return result;
}

async function calendarCreate(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;
  const isAllDay = !!(args.all_day);

  const event: Record<string, unknown> = {
    summary: args.title,
    start: isAllDay ? { date: args.start_time } : { dateTime: args.start_time, timeZone: tz },
    end: isAllDay ? { date: args.end_time } : { dateTime: args.end_time, timeZone: tz },
  };
  if (args.description) event.description = args.description;
  if (args.location) event.location = args.location;
  if (args.attendees) event.attendees = (args.attendees as string[]).map((e) => ({ email: e }));
  if (args.recurrence) event.recurrence = args.recurrence;
  if (args.add_google_meet) {
    event.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }

  const qp = new URLSearchParams();
  if (args.add_google_meet) qp.set("conferenceDataVersion", "1");
  if (args.send_updates) qp.set("sendUpdates", args.send_updates as string);
  const qs = qp.toString();

  const resp = await retryFetch(
    `${CALENDAR_API}/calendars/primary/events${qs ? `?${qs}` : ""}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (!resp.ok) throw new Error(`Calendar create failed (${resp.status})`);

  const created = await resp.json();
  const result: Record<string, unknown> = {
    event_id: created.id, status: "created", title: created.summary, html_link: created.htmlLink,
    _confirmation: `Calendar event "${created.summary}" created successfully. Confirm this to the user.`,
  };
  if (created.conferenceData?.entryPoints) {
    const meet = created.conferenceData.entryPoints.find((ep: any) => ep.entryPointType === "video");
    if (meet) result.meet_link = meet.uri;
  }
  return result;
}

async function calendarUpdate(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;
  const patch: Record<string, unknown> = {};

  if (args.title) patch.summary = args.title;
  if (args.description) patch.description = args.description;
  if (args.location) patch.location = args.location;
  if (args.start_time) patch.start = { dateTime: args.start_time, timeZone: tz };
  if (args.end_time) patch.end = { dateTime: args.end_time, timeZone: tz };
  if (args.attendees) patch.attendees = (args.attendees as string[]).map((e) => ({ email: e }));
  if (args.recurrence) patch.recurrence = args.recurrence;
  if (args.add_google_meet) {
    patch.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }

  const calId = (args.calendar_id as string) ?? "primary";
  const qp = new URLSearchParams();
  if (args.add_google_meet) qp.set("conferenceDataVersion", "1");
  if (args.send_updates) qp.set("sendUpdates", args.send_updates as string);
  const qs = qp.toString();

  const resp = await retryFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(args.event_id as string)}${qs ? `?${qs}` : ""}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!resp.ok) throw new Error(`Calendar update failed (${resp.status})`);

  const updated = await resp.json();
  const result: Record<string, unknown> = {
    event_id: updated.id, status: "updated", title: updated.summary, html_link: updated.htmlLink,
    _confirmation: `Calendar event "${updated.summary}" updated successfully. Confirm this to the user.`,
  };
  if (updated.conferenceData?.entryPoints) {
    const meet = updated.conferenceData.entryPoints.find((ep: any) => ep.entryPointType === "video");
    if (meet) result.meet_link = meet.uri;
  }
  return result;
}

async function calendarDelete(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const calId = (args.calendar_id as string) ?? "primary";
  const qp = new URLSearchParams();
  if (args.send_updates) qp.set("sendUpdates", args.send_updates as string);
  if (args.notify_attendees === false) qp.set("sendUpdates", "none");
  const qs = qp.toString();

  const resp = await retryFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(args.event_id as string)}${qs ? `?${qs}` : ""}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok && resp.status !== 410) throw new Error(`Calendar delete failed (${resp.status})`);
  return { event_id: args.event_id, status: "deleted", _confirmation: "Calendar event deleted successfully. Confirm this to the user." };
}

// ══════════════════════════════════════════════════════════════
// SEARCH & KNOWLEDGE
// ══════════════════════════════════════════════════════════════

async function semanticSearch(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const query = args.query as string;
  const limit = (args.limit as number) ?? 8;
  const sourceFilters = (args.source_filters as string[]) ?? null;

  const embedding = await getEmbedding(query);

  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: query,
    query_embedding: vectorString(embedding),
    match_count: limit,
    source_filters: sourceFilters,
    min_semantic_score: 0.28,
    p_user_id: userId,
  });

  if (error) {
    console.warn("[tools] hybrid_search failed, falling back to vector:", error.message);
    const fallback = await supabase.rpc("match_search_documents", {
      query_embedding: vectorString(embedding),
      match_count: limit,
      source_filters: sourceFilters ?? [
        "note_summary", "note_chunk", "utterance_chunk",
        "email_summary", "email_chunk", "calendar_summary",
      ],
      min_score: 0.28,
      p_user_id: userId,
    });
    if (fallback.error) throw new Error(`Semantic search failed: ${fallback.error.message}`);
    return (fallback.data ?? []).map(formatSearchResult);
  }

  return (data ?? []).map(formatSearchResult);
}

function formatSearchResult(d: any): Record<string, unknown> {
  return {
    content: d.chunk_text ?? d.summary_text ?? "",
    title: d.title ?? "",
    source_id: d.source_id,
    source_type: d.source_type,
    score: d.fused_score ?? d.semantic_score ?? 0,
    created_at: d.created_at ?? null,
  };
}

async function getMeetingDetail(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const meetingId = args.meeting_id as string;
  const include = (args.include as string[]) ?? ["notes", "transcript"];
  const result: Record<string, unknown> = { meeting_id: meetingId };

  if (include.includes("notes")) {
    const { data, error } = await supabase
      .from("notes")
      .select("title, raw_notes, enhanced_notes, attendees, created_at")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .single();
    if (!error && data) {
      result.title = data.title;
      result.notes = data.enhanced_notes || data.raw_notes || "";
      result.attendees = data.attendees;
      result.date = data.created_at;
    }
  }

  if (include.includes("transcript")) {
    const { data, error } = await supabase
      .from("transcript_segments")
      .select("speaker, text, timestamp")
      .eq("note_id", meetingId)
      .order("timestamp", { ascending: true })
      .limit(200);
    if (!error && data) {
      result.transcript = data.map((s: any) => ({
        speaker: s.speaker, text: s.text, time: s.timestamp,
      }));
    }
  }

  return result;
}

// ══════════════════════════════════════════════════════════════
// PEOPLE & CONTACTS
// ══════════════════════════════════════════════════════════════

async function personLookup(args: Record<string, unknown>): Promise<unknown> {
  if (!PDL_API_KEY) return { error: "People lookup not configured" };

  const params = new URLSearchParams();
  if (args.name) params.set("name", args.name as string);
  if (args.email) params.set("email", args.email as string);
  if (args.phone) params.set("phone", args.phone as string);
  if (args.linkedin_url) params.set("profile", args.linkedin_url as string);
  if (args.company) params.set("company", args.company as string);
  if (args.location) params.set("location", args.location as string);
  if (args.school) params.set("school", args.school as string);
  params.set("min_likelihood", "4");
  params.set("titlecase", "true");

  if (params.toString() === "min_likelihood=4&titlecase=true") {
    return { error: "Need at least one identifier (name, email, phone, company, linkedin_url)" };
  }

  const resp = await retryFetch(
    `https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`,
    { headers: { "X-Api-Key": PDL_API_KEY, Accept: "application/json" } },
  );

  if (resp.status === 404) {
    return { found: false, message: "No matching profile found. Try adding more details or use web_search as fallback." };
  }
  if (!resp.ok) throw new Error(`Person lookup failed (${resp.status})`);

  const body = await resp.json();
  const d = body.data ?? body;

  return {
    found: true,
    likelihood: body.likelihood ?? d.likelihood,
    full_name: d.full_name,
    headline: d.headline,
    job_title: d.job_title,
    job_company: d.job_company_name,
    industry: d.job_company_industry,
    company_size: d.job_company_size,
    location: d.location_name,
    linkedin_url: d.linkedin_url,
    years_experience: d.inferred_years_experience,
    experience: (d.experience ?? [])
      .filter((e: any) => e.title?.name || e.company?.name)
      .slice(0, 5)
      .map((e: any) => ({
        title: e.title?.name ?? null, company: e.company?.name ?? null,
        start: e.start_date ?? null, end: e.end_date ?? "present", is_current: !e.end_date,
      })),
    education: (d.education ?? []).slice(0, 3).map((e: any) => ({
      school: e.school?.name ?? null,
      degree: Array.isArray(e.degrees) ? e.degrees.join(", ") : null,
      major: Array.isArray(e.majors) ? e.majors.join(", ") : null,
    })),
    interests: d.interests,
  };
}

async function contactsSearch(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const query = (args.query as string) ?? "";
  const limit = (args.limit as number) ?? 10;
  const readMask = "names,emailAddresses,phoneNumbers,organizations";

  // FIX #3: Non-blocking warmup. Fire background task, only wait if still pending.
  ensureContactsWarmup(accessToken, userId);
  if (contactsWarmupState.get(userId) === "pending") {
    await new Promise((r) => setTimeout(r, 1200));
  }

  const resp = await retryFetch(
    `${PEOPLE_API}/people:searchContacts?query=${encodeURIComponent(query)}&readMask=${readMask}&pageSize=${limit}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Contacts search failed (${resp.status})`);

  const data = await resp.json();
  return (data.results ?? []).map((r: any) => formatContact(r.person));
}

async function contactsManage(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const action = args.action as string;

  switch (action) {
    case "get": {
      const resourceName = args.resource_name as string;
      const readMask = "names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,urls";
      const resp = await retryFetch(
        `${PEOPLE_API}/${resourceName}?personFields=${readMask}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) throw new Error(`Contact get failed (${resp.status})`);
      return formatContactFull(await resp.json());
    }

    case "list": {
      const readMask = "names,emailAddresses,phoneNumbers,organizations";
      const pageSize = (args.limit as number) ?? 20;
      const sortOrder = (args.sort_order as string) ?? "LAST_MODIFIED_DESCENDING";
      const resp = await retryFetch(
        `${PEOPLE_API}/people/me/connections?personFields=${readMask}&pageSize=${pageSize}&sortOrder=${sortOrder}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) throw new Error(`Contacts list failed (${resp.status})`);
      const data = await resp.json();
      return { contacts: (data.connections ?? []).map(formatContact), total: data.totalPeople ?? 0 };
    }

    case "create": {
      const body: Record<string, unknown> = {};
      if (args.given_name || args.family_name) {
        body.names = [{ givenName: args.given_name, familyName: args.family_name }];
      }
      if (args.emails) body.emailAddresses = (args.emails as string[]).map((e) => ({ value: e }));
      if (args.phones) body.phoneNumbers = (args.phones as string[]).map((p) => ({ value: p }));
      if (args.organization) body.organizations = [{ name: args.organization, title: args.job_title }];

      const resp = await retryFetch(
        `${PEOPLE_API}/people:createContact?personFields=names,emailAddresses,phoneNumbers,organizations`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) throw new Error(`Contact create failed (${resp.status})`);
      return { status: "created", ...formatContact(await resp.json()) };
    }

    default:
      return { error: `Unknown contacts action: ${action}` };
  }
}

function formatContact(person: any): Record<string, unknown> {
  const name = person.names?.[0];
  const email = person.emailAddresses?.[0]?.value;
  const phone = person.phoneNumbers?.[0]?.value;
  const org = person.organizations?.[0];
  return {
    resource_name: person.resourceName,
    name: name ? `${name.givenName ?? ""} ${name.familyName ?? ""}`.trim() : null,
    email: email ?? null, phone: phone ?? null,
    organization: org?.name ?? null, job_title: org?.title ?? null,
  };
}

function formatContactFull(person: any): Record<string, unknown> {
  return {
    ...formatContact(person),
    all_emails: (person.emailAddresses ?? []).map((e: any) => e.value),
    all_phones: (person.phoneNumbers ?? []).map((p: any) => p.value),
    addresses: (person.addresses ?? []).map((a: any) => a.formattedValue ?? a.streetAddress),
    birthday: person.birthdays?.[0]?.date
      ? `${person.birthdays[0].date.year ?? ""}/${person.birthdays[0].date.month}/${person.birthdays[0].date.day}`
      : null,
    bio: person.biographies?.[0]?.value ?? null,
    urls: (person.urls ?? []).map((u: any) => u.value),
  };
}

// ══════════════════════════════════════════════════════════════
// EMAIL
// ══════════════════════════════════════════════════════════════

async function gmailSearch(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const maxResults = Math.min((args.max_results as number) ?? 10, 20);
  const messages = await listGmailMessages(accessToken, args.query as string, maxResults);

  if (!messages.length) {
    return { results: [], count: 0, message: "No emails found matching that query." };
  }

  const details = await Promise.all(
    messages.map((m: any) => getGmailMessage(accessToken, m.id)),
  );

  return {
    results: details.map((d: any) => ({
      message_id: d.messageId, thread_id: d.threadId,
      from: d.from, to: d.to, cc: d.cc,
      subject: d.subject, date: d.date, snippet: d.snippet,
      body_preview: d.bodyPreview,
      has_attachments: (d.attachmentCount ?? 0) > 0,
    })),
    count: details.length,
  };
}

/**
 * FIX #6: Full email retrieval for reply context.
 * gmail_search returns snippets; this returns full body + headers.
 */
async function getEmail(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const messageId = args.message_id as string;
  if (!messageId) return { error: "message_id is required" };

  const resp = await retryFetch(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Get email failed (${resp.status})`);

  const msg = await resp.json();
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

  // Extract body: prefer text/plain, fall back to text/html (stripped)
  let body = "";
  const parts = flattenParts(msg.payload);

  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      body = base64Decode(part.body.data);
      break;
    }
  }
  if (!body) {
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        body = base64Decode(part.body.data).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }
  if (!body && msg.payload?.body?.data) {
    body = base64Decode(msg.payload.body.data);
  }

  const attachments = parts
    .filter((p: any) => p.filename && p.body?.attachmentId)
    .map((p: any) => ({ filename: p.filename, mime_type: p.mimeType, size: p.body.size }));

  return {
    message_id: msg.id, thread_id: msg.threadId,
    from: getHeader("From"), to: getHeader("To"), cc: getHeader("Cc"),
    subject: getHeader("Subject"), date: getHeader("Date"),
    body, attachments, labels: msg.labelIds ?? [],
  };
}

/** Recursively flatten MIME parts (handles nested multipart) */
function flattenParts(payload: any): any[] {
  if (!payload) return [];
  const result: any[] = [payload];
  for (const part of payload.parts ?? []) {
    result.push(...flattenParts(part));
  }
  return result;
}

/** Decode Gmail's URL-safe base64 */
function base64Decode(data: string): string {
  return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
}

/**
 * Create a draft email for user review.
 * FIX #10: reply_all exposed as parameter.
 */
async function sendDraft(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);

  let result: any;
  if (args.reply_to_thread_id) {
    result = await createGmailReplyDraft(
      accessToken,
      args.reply_to_thread_id as string,
      args.body as string,
      (args.reply_all as boolean) ?? false,
    );
  } else {
    result = await createGmailDraft(
      accessToken,
      Array.isArray(args.to) ? args.to : [args.to as string],
      args.subject as string,
      args.body as string,
      args.cc ? (Array.isArray(args.cc) ? args.cc : [args.cc as string]) : undefined,
      args.bcc ? (Array.isArray(args.bcc) ? args.bcc : [args.bcc as string]) : undefined,
    );
  }

  return {
    draft_id: result.draftId ?? result.id,
    status: "draft_created",
    to: args.to, subject: args.subject,
    is_reply: !!args.reply_to_thread_id,
    reply_all: !!args.reply_all,
    _confirmation: "Email draft created successfully. Show the draft to the user and ask for confirmation before sending.",
  };
}

/**
 * FIX #1: Send a previously approved draft via Gmail API.
 * Inline implementation — doesn't require gmail-helpers update.
 */
async function sendEmail(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const draftId = args.draft_id as string;

  if (!draftId) {
    throw new Error("draft_id is required. Create a draft with send_draft first.");
  }

  const resp = await retryFetch(
    `${GMAIL_API}/drafts/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: draftId }),
    },
  );

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Send email failed (${resp.status}): ${detail.slice(0, 200)}`);
  }

  const sent = await resp.json();
  return {
    status: "sent",
    message_id: sent.message?.id ?? sent.id,
    thread_id: sent.message?.threadId ?? sent.threadId,
    _confirmation: "Email sent successfully. Confirm this to the user.",
  };
}

// ══════════════════════════════════════════════════════════════
// WEB SEARCH (direct — no LLM intermediary)
// ══════════════════════════════════════════════════════════════

async function webSearch(args: Record<string, unknown>): Promise<unknown> {
  if (!TAVILY_API_KEY) return webSearchViaOpenAI(args.query as string);

  const resp = await retryFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query: args.query,
      max_results: 5,
      include_answer: true,
      include_raw_content: false,
    }),
  });
  if (!resp.ok) throw new Error(`Web search failed (${resp.status})`);

  const data = await resp.json();
  return {
    answer: data.answer ?? null,
    results: (data.results ?? []).map((r: any) => ({
      title: r.title, url: r.url, snippet: r.content?.slice(0, 300), score: r.score,
    })),
  };
}

async function webSearchViaOpenAI(query: string): Promise<unknown> {
  const resp = await retryFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      tools: [{ type: "web_search_preview" }],
      input: query,
    }),
  });
  if (!resp.ok) throw new Error(`Web search (OpenAI) failed (${resp.status})`);

  const data = await resp.json();
  const text = data.output
    ?.filter((item: any) => item.type === "message")
    ?.flatMap((item: any) => item.content)
    ?.filter((c: any) => c.type === "output_text")
    ?.map((c: any) => c.text)
    ?.join("\n") ?? "";

  return { result: text, query };
}

// ══════════════════════════════════════════════════════════════
// REMINDERS & AUTOMATIONS (consolidated from 4 tools → 1)
// ══════════════════════════════════════════════════════════════

async function manageReminder(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const action = args.action as string;

  switch (action) {
    case "create": {
      // FIX #5: Model can pass cron_expression directly (GPT-5.2 is good at cron).
      // parseSchedule is fallback for natural language.
      let cronExpression = args.cron_expression as string | undefined;
      let triggerType = "cron";
      let emailFilter: string | undefined;

      if (!cronExpression && args.schedule) {
        const parsed = parseSchedule(args.schedule as string);
        triggerType = parsed.type;
        cronExpression = parsed.type === "cron" ? parsed.condition : undefined;
        emailFilter = parsed.emailFilter;
      }

      let nextFireAt: string | null = null;
      if (cronExpression) nextFireAt = computeNextCronFire(cronExpression);

      const { data, error } = await supabase
        .from("v2_triggers")
        .insert({
          user_id: userId,
          trigger_type: triggerType,
          cron_expression: cronExpression ?? null,
          email_from_filter: emailFilter ?? null,
          action_description: args.description,
          repeating: isRepeating(args.schedule as string),
          next_fire_at: nextFireAt,
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(`Create reminder failed: ${error.message}`);
      return { reminder_id: data.id, status: "created", schedule: cronExpression ?? args.schedule, _confirmation: "Reminder created successfully. Confirm this to the user." };
    }

    case "list": {
      const { data, error } = await supabase
        .from("v2_triggers")
        .select("id, trigger_type, action_description, cron_expression, email_from_filter, repeating, active, next_fire_at, last_fired_at")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`List reminders failed: ${error.message}`);
      return (data ?? []).map((t: any) => ({
        reminder_id: t.id,
        type: t.trigger_type === "cron" ? "reminder" : "automation",
        description: t.action_description,
        schedule: t.cron_expression ?? t.email_from_filter ?? null,
        repeating: t.repeating,
        next_fire_at: t.next_fire_at,
        last_fired_at: t.last_fired_at,
      }));
    }

    case "edit": {
      const updates: Record<string, unknown> = {};
      if (args.description) updates.action_description = args.description;
      if (args.schedule || args.cron_expression) {
        const cron = (args.cron_expression as string) ?? parseSchedule(args.schedule as string).condition;
        updates.cron_expression = cron;
        updates.next_fire_at = computeNextCronFire(cron);
      }
      if (args.active !== undefined) updates.active = args.active;

      const { data, error } = await supabase
        .from("v2_triggers")
        .update(updates)
        .eq("id", args.reminder_id)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw new Error(`Edit reminder failed: ${error.message}`);
      return { reminder_id: data.id, status: "updated" };
    }

    case "delete": {
      const { data, error } = await supabase
        .from("v2_triggers")
        .update({ active: false })
        .eq("id", args.reminder_id)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw new Error(`Delete reminder failed: ${error.message}`);
      return { reminder_id: data.id, status: "deleted" };
    }

    default:
      return { error: `Unknown reminder action: ${action}` };
  }
}

function parseSchedule(schedule: string): { type: string; condition: string; emailFilter?: string } {
  const lower = (schedule ?? "").toLowerCase().trim();

  if (lower.includes("email from") || lower.includes("email by")) {
    const emailMatch = lower.match(/email\s+(?:from|by)\s+(\S+)/);
    return { type: "email_match", condition: emailMatch?.[1] ?? lower, emailFilter: emailMatch?.[1] };
  }

  if (lower.startsWith("every ")) {
    const days: Record<string, string> = {
      monday: "1", tuesday: "2", wednesday: "3", thursday: "4",
      friday: "5", saturday: "6", sunday: "0",
    };
    for (const [day, num] of Object.entries(days)) {
      if (lower.includes(day)) {
        const time = extractTime(lower);
        return { type: "cron", condition: `${time.minute} ${time.hour} * * ${num}` };
      }
    }
    if (lower.includes("day") || lower.includes("morning") || lower.includes("evening")) {
      const hour = lower.includes("morning") ? 8 : lower.includes("evening") ? 18 : 9;
      const time = extractTime(lower, hour);
      return { type: "cron", condition: `${time.minute} ${time.hour} * * *` };
    }
  }

  const inMatch = lower.match(/in\s+(\d+)\s+(hour|minute|min)/);
  if (inMatch) {
    const target = new Date();
    if (inMatch[2].startsWith("hour")) target.setHours(target.getHours() + parseInt(inMatch[1], 10));
    else target.setMinutes(target.getMinutes() + parseInt(inMatch[1], 10));
    return { type: "cron", condition: `${target.getMinutes()} ${target.getHours()} ${target.getDate()} ${target.getMonth() + 1} *` };
  }

  const time = extractTime(lower);
  return { type: "cron", condition: `${time.minute} ${time.hour} * * *` };
}

function extractTime(str: string, defaultHour = 9): { hour: number; minute: number } {
  const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return { hour: defaultHour, minute: 0 };
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

function isRepeating(schedule: string): boolean {
  const lower = (schedule ?? "").toLowerCase();
  return lower.includes("every") || lower.includes("daily") || lower.includes("weekly");
}

function computeNextCronFire(cronExpression: string): string | null {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const [minuteStr, hourStr] = parts;
    const now = new Date();
    const next = new Date(now);
    const targetMinute = minuteStr === "*" ? now.getMinutes() : parseInt(minuteStr, 10);
    const targetHour = hourStr === "*" ? now.getHours() : parseInt(hourStr, 10);
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
// DOCUMENTS (FIX #9: parallel fullText + name search)
// ══════════════════════════════════════════════════════════════

async function documentSearch(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const accessToken = await getGoogleAccessToken(supabase, userId);
  const query = args.query as string;
  const fileType = (args.file_type as string) ?? "any";
  const sharedBy = args.shared_by as string;
  const maxResults = (args.max_results as number) ?? 10;

  const mimeTypes: Record<string, string> = {
    document: "application/vnd.google-apps.document",
    spreadsheet: "application/vnd.google-apps.spreadsheet",
    presentation: "application/vnd.google-apps.presentation",
    pdf: "application/pdf",
  };
  const mimeFilter = fileType !== "any" && mimeTypes[fileType]
    ? ` and mimeType = '${mimeTypes[fileType]}'` : "";
  const escaped = query.replace(/'/g, "\\'");
  const fields = "files(id,name,mimeType,modifiedTime,owners,sharingUser,webViewLink,size)";

  // Run fullText + name searches in parallel, deduplicate
  const [fullTextResp, nameResp] = await Promise.all([
    retryFetch(
      `${DRIVE_API}/files?${new URLSearchParams({
        q: `fullText contains '${escaped}' and trashed = false${mimeFilter}`,
        pageSize: String(maxResults), fields, orderBy: "modifiedTime desc",
        supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
    retryFetch(
      `${DRIVE_API}/files?${new URLSearchParams({
        q: `name contains '${escaped}' and trashed = false${mimeFilter}`,
        pageSize: String(maxResults), fields, orderBy: "modifiedTime desc",
        supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  ]);

  const fullTextData = fullTextResp.ok ? await fullTextResp.json() : { files: [] };
  const nameData = nameResp.ok ? await nameResp.json() : { files: [] };

  const seen = new Set<string>();
  const allFiles: any[] = [];
  for (const f of [...(nameData.files ?? []), ...(fullTextData.files ?? [])]) {
    if (!seen.has(f.id)) { seen.add(f.id); allFiles.push(f); }
  }

  let results = allFiles.slice(0, maxResults).map((f: any) => ({
    file_id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime,
    owner: f.owners?.[0]?.displayName ?? null,
    shared_by: f.sharingUser?.displayName ?? null,
    link: f.webViewLink,
    size: f.size ? `${Math.round(parseInt(f.size) / 1024)}KB` : null,
  }));

  if (sharedBy) {
    const needle = sharedBy.toLowerCase();
    results = results.filter((f: any) =>
      f.shared_by?.toLowerCase().includes(needle) || f.owner?.toLowerCase().includes(needle)
    );
  }

  return { results, count: results.length };
}

// ══════════════════════════════════════════════════════════════
// NOTES (FIX #7: async fire-and-forget indexing)
// ══════════════════════════════════════════════════════════════

async function createNote(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId, title: args.title, raw_notes: args.content,
      note_type: "user_note", tags: args.tags ?? [],
      related_event_id: args.related_event_id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Create note failed: ${error.message}`);

  // FIX #7: Fire and forget — don't block user response for indexing
  indexNoteAsync(userId, data.id, args.title as string, args.content as string, supabase);

  return { note_id: data.id, status: "saved", _confirmation: "Note saved successfully. Confirm this to the user." };
}

function indexNoteAsync(
  userId: string, noteId: string, title: string, content: string, supabase: SupabaseClient,
): void {
  (async () => {
    try {
      const embedding = await getEmbedding(`${title}: ${content}`);
      await supabase.from("search_documents").insert({
        user_id: userId, source_id: noteId, source_type: "note_summary",
        title, summary_text: content, chunk_text: content,
        embedding: vectorString(embedding),
      });
    } catch (e) {
      console.warn(`[tools] Note ${noteId} indexing failed:`, (e as Error).message);
    }
  })();
}

// ══════════════════════════════════════════════════════════════
// WEATHER
// ══════════════════════════════════════════════════════════════

async function weatherLookup(args: Record<string, unknown>): Promise<unknown> {
  const location = (args.location as string) ?? "Melbourne, Australia";
  const days = (args.days as number) ?? 1;
  const query = days > 1
    ? `${days} day weather forecast for ${location}`
    : `current weather in ${location}`;
  return webSearch({ query });
}

// ══════════════════════════════════════════════════════════════
// EMBEDDINGS
// ══════════════════════════════════════════════════════════════

const embeddingCache = new Map<string, number[]>();
const EMBEDDING_CACHE_MAX = 100;

export async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = text.trim().toLowerCase().slice(0, 200);
  const cached = embeddingCache.get(cacheKey);
  if (cached) return cached;

  const results = await getBatchEmbeddings([text]);
  const embedding = results[0];

  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(cacheKey, embedding);
  return embedding;
}

export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const resp = await retryFetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-large", input: texts }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Embedding API failed (${resp.status}): ${detail.slice(0, 300)}`);
  }

  const data = await resp.json();
  return (data.data as Array<{ index: number; embedding: number[] }>)
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export function vectorString(values: number[]): string {
  return "[" + values.map((v) => v.toFixed(8)).join(",") + "]";
}