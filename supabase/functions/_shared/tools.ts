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
  getAllAccountTokens,
  getTokenForEmail,
  createGmailDraft,
  createGmailReplyDraft,
  listGmailMessages,
  getGmailMessage,
  getAllMicrosoftAccountTokens,
  getMicrosoftTokenForEmail,
  detectAccountProvider,
  type AccountToken,
} from "./gmail-helpers.ts";

// ── Config ───────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const PDL_API_KEY = Deno.env.get("PDL_API_KEY") ?? "";
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const WEATHER_API_KEY = Deno.env.get("WEATHER_API_KEY") ?? "";
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const PEOPLE_API = "https://people.googleapis.com/v1";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0/me";

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
  userTimezone?: string,
  /** When provided, update_user_timezone will call this to update the timezone for subsequent tool calls in the same request. */
  onTimezoneChange?: (newTz: string) => void,
): Promise<string> {
  try {
    const tz = userTimezone ?? DEFAULT_TZ;
    if (!args.time_zone) args.time_zone = tz;
    if (name === "weather_lookup" && !args.location) {
      args._userTimezone = tz;
    }
    const result = await dispatch(name, args, userId, supabase);

    // If update_user_timezone succeeded, propagate the change to the current request
    if (name === "update_user_timezone" && onTimezoneChange && typeof result === "object" && result !== null && (result as any)._confirmation) {
      const newTz = (result as any).timezone as string;
      if (newTz) onTimezoneChange(newTz);
    }

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

    if (isMicrosoftAuthError(msg)) {
      return JSON.stringify({
        error: "Microsoft account access expired. Please reconnect in Settings > Accounts.",
        error_type: "microsoft_auth",
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

function isMicrosoftAuthError(msg: string): boolean {
  return (
    msg.includes("MICROSOFT_REAUTH_REQUIRED") ||
    msg.includes("Microsoft token refresh failed") ||
    msg.includes("AADSTS") ||
    msg.includes("InvalidAuthenticationToken")
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
    case "travel_time":         return travelTime(args);
    case "places_search":       return placesSearch(args);
    case "manage_todos":        return manageTodos(userId, supabase, args);
    case "update_user_timezone": return updateUserTimezone(userId, supabase, args);
    case "connect_meeting_notes": return connectMeetingNotes(userId, supabase, args);
    case "get_meeting_notes":     return getMeetingNotes(userId, supabase, args);
    case "manage_meeting_recording": return manageMeetingRecording(userId, supabase, args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Resolve a Google access token from an optional account email arg.
 * If account is specified, uses that account. Otherwise falls back to primary.
 */
async function resolveToken(
  userId: string,
  supabase: SupabaseClient,
  accountEmail?: string,
): Promise<{ accessToken: string; email: string }> {
  if (accountEmail) {
    return getTokenForEmail(supabase, userId, accountEmail);
  }
  const token = await getGoogleAccessToken(supabase, userId);
  return { accessToken: token, email: "primary" };
}

/**
 * Resolve a token for an account that could be Google or Microsoft.
 * Detects the provider from the account email, then returns the token + provider.
 */
async function resolveAnyToken(
  userId: string,
  supabase: SupabaseClient,
  accountEmail?: string,
): Promise<{ accessToken: string; email: string; provider: "google" | "microsoft" }> {
  if (accountEmail) {
    const provider = await detectAccountProvider(supabase, userId, accountEmail);
    if (provider === "microsoft") {
      const result = await getMicrosoftTokenForEmail(supabase, userId, accountEmail);
      if (result) return { ...result, provider: "microsoft" };
      throw new Error(`Microsoft account ${accountEmail} not found`);
    }
    const result = await getTokenForEmail(supabase, userId, accountEmail);
    return { ...result, provider: "google" };
  }
  const token = await getGoogleAccessToken(supabase, userId);
  return { accessToken: token, email: "primary", provider: "google" };
}

// ══════════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════════

async function calendarLookup(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;
  const { timeMin, timeMax } = resolveTimeRange(args.range as string, tz);
  const maxResults = (args.max_results as number) ?? 15;
  const query = (args.query as string)?.toLowerCase();

  // Query Google and Microsoft accounts in parallel
  const [googleAccounts, msAccounts] = await Promise.all([
    getAllAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
    getAllMicrosoftAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
  ]);

  const googleParams = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
    timeZone: tz,
  });

  const googleResults = Promise.all(
    googleAccounts.map(async (acct) => {
      try {
        // List ALL calendars for this account (not just primary)
        let calEntries: Array<{ id: string; name: string }> = [{ id: "primary", name: "Primary" }];
        try {
          const listResp = await retryFetch(
            `${CALENDAR_API}/users/me/calendarList?showHidden=true&showDeleted=false`,
            { headers: { Authorization: `Bearer ${acct.accessToken}` } },
          );
          if (listResp.ok) {
            const listData = await listResp.json();
            const calendars = (listData.items ?? []).filter((c: any) => !c.deleted);
            if (calendars.length > 0) {
              calEntries = calendars.slice(0, 15).map((c: any) => ({ id: c.id, name: c.summary || c.id }));
              console.log(`[tools] calendar_lookup: ${acct.email} has ${calendars.length} calendars, querying ${calEntries.length}: ${calEntries.map(c => c.name).join(', ')}`);
            }
          } else {
            console.warn(`[tools] calendar_lookup: calendarList API returned ${listResp.status} for ${acct.email}`);
          }
        } catch (listErr) {
          console.warn(`[tools] calendar_lookup: failed to list calendars for ${acct.email}, falling back to primary`);
        }

        // Fetch events from all calendars for this account
        const perCalResults = await Promise.all(
          calEntries.map(async (cal) => {
            try {
              const resp = await retryFetch(
                `${CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${googleParams}`,
                { headers: { Authorization: `Bearer ${acct.accessToken}` } },
              );
              if (!resp.ok) {
                console.warn(`[tools] calendar_lookup failed for ${acct.email} cal=${cal.name} (${resp.status})`);
                return [];
              }
              const data = await resp.json();
              const items = data.items ?? [];
              if (items.length > 0) {
                console.log(`[tools] calendar_lookup: ${acct.email} cal="${cal.name}" returned ${items.length} events`);
              }
              return items.map((e: any) => ({
                ...formatCalendarEvent(e, tz),
                account: acct.email,
                calendar: cal.name,
                provider: "google",
              }));
            } catch (calErr) {
              console.warn(`[tools] calendar_lookup error for ${acct.email} cal=${cal.name}: ${(calErr as Error).message}`);
              return [];
            }
          }),
        );
        return perCalResults.flat();
      } catch (e) {
        console.warn(`[tools] calendar_lookup error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const msResults = Promise.all(
    msAccounts.map(async (acct) => {
      try {
        const msParams = new URLSearchParams({
          startDateTime: timeMin,
          endDateTime: timeMax,
          $top: String(maxResults),
          $orderby: "start/dateTime",
          $select: "id,subject,start,end,location,body,attendees,organizer,isAllDay,webLink,recurrence,onlineMeeting,onlineMeetingUrl,isOnlineMeeting",
        });

        // List ALL calendars for this Microsoft account
        let calendarIds: Array<{ id: string; name: string }> = [];
        try {
          const listResp = await retryFetch(
            `${GRAPH_API}/calendars?$select=id,name&$top=15`,
            { headers: { Authorization: `Bearer ${acct.accessToken}` } },
          );
          if (listResp.ok) {
            const listData = await listResp.json();
            calendarIds = (listData.value ?? []).slice(0, 15).map((c: any) => ({ id: c.id, name: c.name }));
            console.log(`[tools] calendar_lookup (MS): ${acct.email} has ${(listData.value ?? []).length} calendars, querying ${calendarIds.length}: ${calendarIds.map(c => c.name).join(', ')}`);
          }
        } catch (listErr) {
          console.warn(`[tools] calendar_lookup (MS): failed to list calendars for ${acct.email}, falling back to default`);
        }

        // If listing succeeded, query each calendar; otherwise fall back to default calendarView
        if (calendarIds.length > 0) {
          const perCalResults = await Promise.all(
            calendarIds.map(async (cal) => {
              try {
                const resp = await retryFetch(
                  `${GRAPH_API}/calendars/${encodeURIComponent(cal.id)}/calendarView?${msParams}`,
                  { headers: { Authorization: `Bearer ${acct.accessToken}`, Prefer: `outlook.timezone="${tz}"` } },
                );
                if (!resp.ok) {
                  console.warn(`[tools] calendar_lookup (MS) failed for ${acct.email} cal=${cal.name} (${resp.status})`);
                  return [];
                }
                const data = await resp.json();
                return (data.value ?? []).map((e: any) => ({
                  ...formatMicrosoftCalendarEvent(e, tz),
                  account: acct.email,
                  calendar: cal.name,
                  provider: "microsoft",
                }));
              } catch (calErr) {
                console.warn(`[tools] calendar_lookup (MS) error for ${acct.email} cal=${cal.name}: ${(calErr as Error).message}`);
                return [];
              }
            }),
          );
          return perCalResults.flat();
        }

        // Fallback: default calendar only
        const resp = await retryFetch(
          `${GRAPH_API}/calendarView?${msParams}`,
          { headers: { Authorization: `Bearer ${acct.accessToken}`, Prefer: `outlook.timezone="${tz}"` } },
        );
        if (!resp.ok) {
          console.warn(`[tools] calendar_lookup (MS) failed for ${acct.email} (${resp.status})`);
          return [];
        }
        const data = await resp.json();
        return (data.value ?? []).map((e: any) => ({
          ...formatMicrosoftCalendarEvent(e, tz),
          account: acct.email,
          provider: "microsoft",
        }));
      } catch (e) {
        console.warn(`[tools] calendar_lookup (MS) error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const [gResults, mResults] = await Promise.all([googleResults, msResults]);

  const seen = new Set<string>();
  let events = [...gResults.flat(), ...mResults.flat()].filter((e: any) => {
    if (seen.has(e.event_id)) return false;
    seen.add(e.event_id);
    return true;
  });

  if (query) {
    events = events.filter((e: any) =>
      e.title?.toLowerCase().includes(query) ||
      e.calendar?.toLowerCase().includes(query) ||
      e.account?.toLowerCase().includes(query) ||
      e.attendees?.some((a: string) => a.toLowerCase().includes(query)) ||
      e.description?.toLowerCase().includes(query)
    );
  }

  const now = new Date();
  return events
    .map((e: any) => {
      const start = new Date(e.start_iso);
      const end = new Date(e.end_iso);
      let status: string;
      if (isNaN(end.getTime()) || isNaN(start.getTime())) {
        status = "UPCOMING";
      } else if (end < now) {
        status = "ALREADY_HAPPENED";
      } else if (start <= now && end >= now) {
        status = "HAPPENING_NOW";
      } else {
        status = "UPCOMING";
      }
      return { ...e, status };
    })
    .sort((a: any, b: any) => new Date(a.start_iso).getTime() - new Date(b.start_iso).getTime());
}

function formatMicrosoftCalendarEvent(e: any, tz?: string): Record<string, unknown> {
  const isAllDay = !!e.isAllDay;
  const startRaw = isAllDay ? e.start?.dateTime?.split("T")[0] : e.start?.dateTime;
  const endRaw = isAllDay ? e.end?.dateTime?.split("T")[0] : e.end?.dateTime;
  const eventTz = tz ?? e.start?.timeZone ?? "UTC";

  let startLocal = startRaw;
  let endLocal = endRaw;
  let dayLabel: string | null = null;

  if (!isAllDay && startRaw) {
    const sd = new Date(startRaw);
    const ed = new Date(endRaw);
    startLocal = sd.toLocaleString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: eventTz,
    });
    endLocal = ed.toLocaleString("en-AU", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: eventTz,
    });
    dayLabel = sd.toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: eventTz,
    });
  }

  const attendees = (e.attendees ?? []).map((a: any) => a.emailAddress?.address).filter(Boolean);

  const result: Record<string, unknown> = {
    event_id: e.id,
    title: e.subject ?? "(no title)",
    start: startLocal,
    end: endLocal,
    start_iso: startRaw,
    end_iso: endRaw,
    all_day: isAllDay,
    day: dayLabel,
    timezone: eventTz,
    location: e.location?.displayName ?? null,
    description: e.body?.content ? e.body.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) : null,
    attendees,
    organizer: e.organizer?.emailAddress?.address ?? null,
    html_link: e.webLink ?? null,
    recurring: !!e.recurrence,
    response_status: null,
  };

  const meetLink = e.onlineMeetingUrl || e.onlineMeeting?.joinUrl;
  if (meetLink) result.meet_link = meetLink;

  return result;
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

      const weeksMatch = lower.match(/next\s+(\d+)\s+weeks?/);
      if (weeksMatch) {
        const n = parseInt(weeksMatch[1], 10);
        const end = new Date(todayLocal.year, todayLocal.month - 1, todayLocal.day + n * 7);
        return {
          timeMin: now.toISOString(),
          timeMax: makeDay(end.getFullYear(), end.getMonth() + 1, end.getDate()).timeMax,
        };
      }

      const monthsMatch = lower.match(/next\s+(\d+)\s+months?/);
      if (monthsMatch) {
        const n = parseInt(monthsMatch[1], 10);
        const end = new Date(todayLocal.year, todayLocal.month - 1 + n, todayLocal.day);
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

function formatCalendarEvent(e: any, tz?: string): Record<string, unknown> {
  const startRaw = e.start?.dateTime ?? e.start?.date;
  const endRaw = e.end?.dateTime ?? e.end?.date;
  const isAllDay = !!e.start?.date;
  const eventTz = tz ?? e.start?.timeZone ?? "UTC";

  // Convert to human-readable local time so the model cannot misinterpret the timezone
  let startLocal = startRaw;
  let endLocal = endRaw;
  let dayLabel: string | null = null;

  if (!isAllDay && startRaw) {
    const sd = new Date(startRaw);
    const ed = new Date(endRaw);
    startLocal = sd.toLocaleString("en-AU", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: eventTz,
    });
    endLocal = ed.toLocaleString("en-AU", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: eventTz,
    });
    dayLabel = sd.toLocaleDateString("en-AU", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: eventTz,
    });
  }

  const result: Record<string, unknown> = {
    event_id: e.id,
    title: e.summary ?? "(no title)",
    start: startLocal,
    end: endLocal,
    start_iso: startRaw,
    end_iso: endRaw,
    all_day: isAllDay,
    day: dayLabel,
    timezone: eventTz,
    location: e.location ?? null,
    description: e.description ? e.description.slice(0, 300) : null,
    attendees: (e.attendees ?? []).map((a: any) => a.email),
    organizer: e.organizer?.email ?? null,
    html_link: e.htmlLink ?? null,
    recurring: !!e.recurringEventId,
    response_status: (e.attendees ?? []).find((a: any) => a.self)?.responseStatus ?? null,
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
  const { accessToken, email: acctEmail, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;
  const isAllDay = !!(args.all_day);

  if (provider === "microsoft") {
    return calendarCreateMicrosoft(accessToken, acctEmail, args, tz, isAllDay);
  }

  const event: Record<string, unknown> = {
    summary: args.title,
    start: isAllDay ? { date: args.start_time } : { dateTime: args.start_time, timeZone: tz },
    end: isAllDay ? { date: args.end_time } : { dateTime: args.end_time, timeZone: tz },
  };
  if (args.description) event.description = args.description;
  if (args.location) event.location = args.location;
  if (args.attendees) event.attendees = (args.attendees as string[]).map((e) => ({ email: e }));
  if (args.recurrence) event.recurrence = args.recurrence;
  event.conferenceData = {
    createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
  };

  const qp = new URLSearchParams();
  qp.set("conferenceDataVersion", "1");
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
    account: acctEmail,
    _confirmation: `Calendar event "${created.summary}" created successfully. Confirm this to the user.`,
  };
  if (created.conferenceData?.entryPoints) {
    const meet = created.conferenceData.entryPoints.find((ep: any) => ep.entryPointType === "video");
    if (meet) result.meet_link = meet.uri;
  }
  return result;
}

async function calendarCreateMicrosoft(
  accessToken: string,
  acctEmail: string,
  args: Record<string, unknown>,
  tz: string,
  isAllDay: boolean,
): Promise<unknown> {
  const event: Record<string, unknown> = {
    subject: args.title,
    start: isAllDay
      ? { dateTime: `${args.start_time}T00:00:00`, timeZone: tz }
      : { dateTime: args.start_time, timeZone: tz },
    end: isAllDay
      ? { dateTime: `${args.end_time}T00:00:00`, timeZone: tz }
      : { dateTime: args.end_time, timeZone: tz },
    isAllDay,
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };
  if (args.description) event.body = { contentType: "text", content: args.description };
  if (args.location) event.location = { displayName: args.location };
  if (args.attendees) {
    event.attendees = (args.attendees as string[]).map((email) => ({
      emailAddress: { address: email },
      type: "required",
    }));
  }

  const resp = await retryFetch(
    `${GRAPH_API}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (!resp.ok) throw new Error(`Microsoft calendar create failed (${resp.status})`);

  const created = await resp.json();
  const result: Record<string, unknown> = {
    event_id: created.id,
    status: "created",
    title: created.subject,
    html_link: created.webLink ?? null,
    account: acctEmail,
    provider: "microsoft",
    _confirmation: `Calendar event "${created.subject}" created successfully. Confirm this to the user.`,
  };
  const meetLink = created.onlineMeeting?.joinUrl;
  if (meetLink) result.meet_link = meetLink;
  return result;
}

async function calendarUpdate(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { accessToken, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;

  if (provider === "microsoft") {
    const msPatch: Record<string, unknown> = {};
    if (args.title) msPatch.subject = args.title;
    if (args.description) msPatch.body = { contentType: "text", content: args.description };
    if (args.location) msPatch.location = { displayName: args.location };
    if (args.start_time) msPatch.start = { dateTime: args.start_time, timeZone: tz };
    if (args.end_time) msPatch.end = { dateTime: args.end_time, timeZone: tz };
    if (args.attendees) {
      msPatch.attendees = (args.attendees as string[]).map((email) => ({
        emailAddress: { address: email }, type: "required",
      }));
    }

    const resp = await retryFetch(
      `${GRAPH_API}/events/${encodeURIComponent(args.event_id as string)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(msPatch),
      },
    );
    if (!resp.ok) throw new Error(`Microsoft calendar update failed (${resp.status})`);
    const updated = await resp.json();
    const result: Record<string, unknown> = {
      event_id: updated.id, status: "updated", title: updated.subject, html_link: updated.webLink ?? null,
      provider: "microsoft",
      _confirmation: `Calendar event "${updated.subject}" updated successfully. Confirm this to the user.`,
    };
    const meetLink = updated.onlineMeeting?.joinUrl;
    if (meetLink) result.meet_link = meetLink;
    return result;
  }

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
  const { accessToken, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);

  if (provider === "microsoft") {
    const resp = await retryFetch(
      `${GRAPH_API}/events/${encodeURIComponent(args.event_id as string)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok && resp.status !== 404) throw new Error(`Microsoft calendar delete failed (${resp.status})`);
    return { event_id: args.event_id, status: "deleted", provider: "microsoft", _confirmation: "Calendar event deleted successfully. Confirm this to the user." };
  }

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
  const limit = (args.limit as number) ?? 10;
  const sourceFilters = (args.source_filters as string[]) ?? null;
  const start = Date.now();

  // Generate multiple sub-queries for better recall
  const subQueries = generateSearchSubQueries(query);
  const allQueries = [...new Set([query, ...subQueries])].slice(0, 5);

  // Batch-embed all queries in one API call
  const embeddings = await getBatchEmbeddings(allQueries);

  // Run all queries in parallel (with source filters if provided)
  const searchPromises = allQueries.map((q, i) =>
    hybridSearchWithFallback(q, embeddings[i], supabase, userId, sourceFilters, limit)
      .catch(() => [] as any[])
  );

  // Also run temporal calendar search if the query has date-related intent
  const searchTz = (args.time_zone as string) ?? DEFAULT_TZ;
  const temporalResults = await temporalCalendarSearchFromQuery(query, supabase, userId, searchTz);

  const allSearchResults = await Promise.all(searchPromises);
  let results = [...allSearchResults.flat(), ...temporalResults];

  // Deduplicate by document_id
  const seen = new Set<string>();
  results = results.filter((r: any) => {
    const id = r.document_id ?? r.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Sort by fused_score descending
  results.sort((a: any, b: any) => (b.fused_score ?? b.semantic_score ?? 0) - (a.fused_score ?? a.semantic_score ?? 0));

  // MMR diversity: penalise clusters from the same source
  results = applyMMRDiversity(results, limit * 2);

  // Auto-retry with topic nouns if results are thin
  if (results.length < 3) {
    const topicNouns = extractTopicNouns(query);
    if (topicNouns.length > 0) {
      const fallbackQuery = topicNouns.join(" ");
      const [fallbackEmb] = await getBatchEmbeddings([fallbackQuery]);
      const fallbackResults = await hybridSearchWithFallback(
        fallbackQuery, fallbackEmb, supabase, userId, null, limit
      ).catch(() => [] as any[]);

      for (const r of fallbackResults) {
        const id = r.document_id ?? r.id;
        if (id && !seen.has(id)) {
          seen.add(id);
          results.push(r);
        }
      }
    }
  }

  const formatted = results.slice(0, limit).map(formatSearchResult);
  const elapsed = Date.now() - start;
  console.log(`[tools] semantic_search: ${formatted.length} results from ${allQueries.length} queries (${elapsed}ms)`);

  // Freshness signal when results are thin
  if (formatted.length < 2) {
    return {
      results: formatted,
      count: formatted.length,
      _hint: "Indexed data returned few results. Try gmail_search for real-time email content, or calendar_lookup for live calendar data. The index may not include very recent items.",
    };
  }

  return { results: formatted, count: formatted.length };
}

function generateSearchSubQueries(query: string): string[] {
  const stopWords = new Set([
    "what", "when", "where", "who", "how", "why", "did", "does", "do",
    "the", "a", "an", "is", "was", "were", "are", "been", "be",
    "about", "from", "with", "for", "of", "in", "on", "at", "to",
    "can", "could", "would", "should", "will", "you", "me", "my", "i",
    "we", "our", "tell", "show", "give", "find", "get", "list",
    "summarise", "summarize", "explain", "please", "any", "some",
    "that", "this", "those", "these", "it", "its",
  ]);
  const temporalWords = new Set([
    "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon",
    "evening", "last", "next", "recent", "latest", "upcoming", "past",
    "week", "month", "year", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday", "sunday",
  ]);

  const words = query.split(/\s+/);
  const keywords = words.filter((w) => {
    const lower = w.toLowerCase().replace(/[^\w]/g, "");
    return !stopWords.has(lower) && !temporalWords.has(lower) && lower.length > 1;
  });

  const queries: string[] = [];
  if (keywords.length >= 2) queries.push(keywords.join(" "));

  const topicWords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);
  if (topicWords.length > 0 && topicWords[0].toLowerCase() !== keywords.join(" ").toLowerCase()) {
    queries.push(topicWords[0]);
    if (topicWords.length >= 2) queries.push(topicWords.join(" "));
  }

  return queries;
}

async function hybridSearchWithFallback(
  queryText: string,
  embedding: number[],
  supabase: SupabaseClient,
  userId: string,
  sourceFilters: string[] | null,
  matchCount: number,
): Promise<any[]> {
  const embStr = vectorString(embedding);

  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: queryText,
    query_embedding: embStr,
    match_count: matchCount,
    source_filters: sourceFilters,
    min_semantic_score: 0.25,
    p_user_id: userId,
  });

  if (error) {
    console.warn("[tools] hybrid_search failed, falling back to vector:", error.message);
    const fallback = await supabase.rpc("match_search_documents", {
      query_embedding: embStr,
      match_count: matchCount,
      source_filters: sourceFilters ?? null,
      min_score: 0.25,
      p_user_id: userId,
    });
    if (fallback.error) throw new Error(`Search failed: ${fallback.error.message}`);
    return (fallback.data ?? []).map((d: any) => ({ ...d, fused_score: d.semantic_score ?? 0 }));
  }

  return data ?? [];
}

async function temporalCalendarSearchFromQuery(
  query: string,
  supabase: SupabaseClient,
  userId: string,
  userTz = DEFAULT_TZ,
): Promise<any[]> {
  const lower = query.toLowerCase();

  // Detect temporal intent — explicit date words or implicit date-seeking patterns
  const hasTemporalKeyword = /\b(today|tomorrow|yesterday|this week|last week|next week|this month|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lower);
  const hasDateSeekingIntent = /\b(date|when|first|last|earliest|latest|most recent)\b/i.test(lower);

  if (!hasTemporalKeyword && !hasDateSeekingIntent) return [];

  try {
    // For date-seeking queries without explicit range, search a wide window
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    if (hasTemporalKeyword) {
      // Use explicit temporal resolution
      if (lower.includes("today")) { startDate = startOfDayInTz(now, userTz); endDate = addDays(startDate, 1); }
      else if (lower.includes("tomorrow")) { startDate = addDays(startOfDayInTz(now, userTz), 1); endDate = addDays(startDate, 1); }
      else if (lower.includes("yesterday")) { startDate = addDays(startOfDayInTz(now, userTz), -1); endDate = startOfDayInTz(now, userTz); }
      else if (lower.includes("this week")) { startDate = startOfWeekInTz(now, userTz); endDate = addDays(startDate, 7); }
      else if (lower.includes("last week")) { startDate = addDays(startOfWeekInTz(now, userTz), -7); endDate = startOfWeekInTz(now, userTz); }
      else if (lower.includes("next week")) { startDate = addDays(startOfWeekInTz(now, userTz), 7); endDate = addDays(startDate, 7); }
      else { startDate = addDays(now, -90); endDate = addDays(now, 30); }
    } else {
      // Date-seeking intent without explicit range — search wide (past 6 months)
      startDate = addDays(now, -180);
      endDate = addDays(now, 30);
    }

    const { data, error } = await supabase
      .from("search_documents")
      .select("id, source_type, source_id, title, summary_text, chunk_text, metadata")
      .eq("user_id", userId)
      .eq("source_type", "calendar_summary")
      .eq("is_deleted", false)
      .filter("metadata->>start", "gte", startDate.toISOString())
      .filter("metadata->>start", "lt", endDate.toISOString())
      .order("metadata->>start" as any, { ascending: true })
      .limit(20);

    if (error || !data) return [];

    return data.map((d: any) => ({
      document_id: d.id,
      source_type: d.source_type,
      source_id: d.source_id ?? "",
      title: d.title ?? "",
      summary_text: d.summary_text,
      chunk_text: d.chunk_text,
      metadata: d.metadata,
      semantic_score: 0.9,
      fused_score: 0.9,
    }));
  } catch (e) {
    console.warn("[tools] temporal calendar search failed:", (e as Error).message);
    return [];
  }
}

function startOfDayInTz(date: Date, tz: string): Date {
  const localDateStr = date.toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, d] = localDateStr.split("-").map(Number);
  const localTimeStr = date.toLocaleString("sv-SE", { timeZone: tz });
  const localParsed = new Date(localTimeStr + "Z");
  const offsetMs = localParsed.getTime() - date.getTime();
  return new Date(Date.UTC(y, m - 1, d) - offsetMs);
}

function startOfWeekInTz(date: Date, tz: string): Date {
  const start = startOfDayInTz(date, tz);
  const localTimeStr = date.toLocaleString("sv-SE", { timeZone: tz });
  const localParsed = new Date(localTimeStr + "Z");
  const offsetMs = localParsed.getTime() - date.getTime();
  const localDow = new Date(start.getTime() + offsetMs).getDay();
  const daysFromMon = (localDow + 6) % 7;
  return addDays(start, -daysFromMon);
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

function applyMMRDiversity(results: any[], maxResults: number): any[] {
  if (results.length <= maxResults) return results;
  const selected: any[] = [];
  const sourceCount: Record<string, number> = {};
  const PENALTY = 0.3;

  for (const candidate of results) {
    if (selected.length >= maxResults) break;
    const sourceKey = `${candidate.source_type}::${candidate.source_id}`;
    const count = sourceCount[sourceKey] ?? 0;
    if (count < 3) {
      const penalty = count * PENALTY;
      const score = (candidate.fused_score ?? candidate.semantic_score ?? 0) * (1.0 - penalty);
      if (score > 0 || selected.length < 4) {
        selected.push(candidate);
        sourceCount[sourceKey] = count + 1;
      }
    }
  }
  return selected;
}

function extractTopicNouns(query: string): string[] {
  const allStop = new Set([
    "what", "when", "where", "who", "how", "why", "did", "does", "do",
    "the", "a", "an", "is", "was", "were", "are", "been", "be",
    "about", "from", "with", "for", "of", "in", "on", "at", "to",
    "can", "could", "would", "should", "will", "you", "me", "my", "i",
    "we", "our", "tell", "show", "give", "find", "get", "list",
    "today", "tomorrow", "yesterday", "week", "month", "year",
    "key", "highlights", "details", "related", "date", "first", "last",
  ]);
  return query.split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^\w]/g, ""))
    .filter((w) => !allStop.has(w) && w.length > 1);
}

function formatSearchResult(d: any): Record<string, unknown> {
  return {
    content: d.chunk_text ?? d.summary_text ?? "",
    title: d.title ?? "",
    source_id: d.source_id,
    source_type: d.source_type,
    score: d.fused_score ?? d.semantic_score ?? 0,
    created_at: d.created_at ?? null,
    metadata: d.metadata ?? null,
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
  const query = (args.query as string) ?? "";
  const limit = (args.limit as number) ?? 10;
  const readMask = "names,emailAddresses,phoneNumbers,organizations";

  const [googleAccounts, msAccounts] = await Promise.all([
    getAllAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
    getAllMicrosoftAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
  ]);

  for (const acct of googleAccounts) {
    ensureContactsWarmup(acct.accessToken, `${userId}:${acct.accountId}`);
  }
  const anyPending = googleAccounts.some(
    (acct) => contactsWarmupState.get(`${userId}:${acct.accountId}`) === "pending",
  );
  if (anyPending) await new Promise((r) => setTimeout(r, 1200));

  const googleResults = Promise.all(
    googleAccounts.map(async (acct) => {
      try {
        const resp = await retryFetch(
          `${PEOPLE_API}/people:searchContacts?query=${encodeURIComponent(query)}&readMask=${readMask}&pageSize=${limit}`,
          { headers: { Authorization: `Bearer ${acct.accessToken}` } },
        );
        if (!resp.ok) {
          console.warn(`[tools] contacts_search failed for ${acct.email} (${resp.status})`);
          return [];
        }
        const data = await resp.json();
        return (data.results ?? []).map((r: any) => ({
          ...formatContact(r.person),
          account: acct.email,
          provider: "google",
        }));
      } catch (e) {
        console.warn(`[tools] contacts_search error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const msResults = Promise.all(
    msAccounts.map(async (acct) => {
      try {
        const params = new URLSearchParams({
          $search: `"${query}"`,
          $top: String(limit),
          $select: "id,displayName,emailAddresses,phones,companyName,jobTitle",
        });
        const resp = await retryFetch(
          `${GRAPH_API}/contacts?${params}`,
          { headers: { Authorization: `Bearer ${acct.accessToken}` } },
        );
        if (!resp.ok) {
          console.warn(`[tools] contacts_search (MS) failed for ${acct.email} (${resp.status})`);
          return [];
        }
        const data = await resp.json();
        return (data.value ?? []).map((c: any) => ({
          resource_name: c.id,
          name: c.displayName ?? null,
          email: c.emailAddresses?.[0]?.address ?? null,
          phone: c.phones?.[0]?.number ?? null,
          organization: c.companyName ?? null,
          job_title: c.jobTitle ?? null,
          account: acct.email,
          provider: "microsoft",
        }));
      } catch (e) {
        console.warn(`[tools] contacts_search (MS) error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const [gResults, mResults] = await Promise.all([googleResults, msResults]);

  const seen = new Set<string>();
  return [...gResults.flat(), ...mResults.flat()].filter((c: any) => {
    const key = c.email?.toLowerCase() ?? c.name?.toLowerCase() ?? JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function contactsManage(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { accessToken, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);
  const action = args.action as string;

  if (provider === "microsoft") {
    return contactsManageMicrosoft(accessToken, action, args);
  }

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

async function contactsManageMicrosoft(
  accessToken: string,
  action: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case "get": {
      const contactId = args.resource_name as string;
      const resp = await retryFetch(
        `${GRAPH_API}/contacts/${encodeURIComponent(contactId)}?$select=id,displayName,emailAddresses,phones,companyName,jobTitle,homeAddress,businessAddress,birthday,personalNotes`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) throw new Error(`Microsoft contact get failed (${resp.status})`);
      const c = await resp.json();
      return {
        resource_name: c.id,
        name: c.displayName ?? null,
        email: c.emailAddresses?.[0]?.address ?? null,
        phone: c.phones?.[0]?.number ?? null,
        organization: c.companyName ?? null,
        job_title: c.jobTitle ?? null,
        all_emails: (c.emailAddresses ?? []).map((e: any) => e.address),
        all_phones: (c.phones ?? []).map((p: any) => p.number),
        addresses: [c.homeAddress?.street, c.businessAddress?.street].filter(Boolean),
        birthday: c.birthday ?? null,
        bio: c.personalNotes ?? null,
        urls: [],
        provider: "microsoft",
      };
    }

    case "list": {
      const pageSize = (args.limit as number) ?? 20;
      const resp = await retryFetch(
        `${GRAPH_API}/contacts?$top=${pageSize}&$orderby=lastModifiedDateTime desc&$select=id,displayName,emailAddresses,phones,companyName,jobTitle`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) throw new Error(`Microsoft contacts list failed (${resp.status})`);
      const data = await resp.json();
      const contacts = (data.value ?? []).map((c: any) => ({
        resource_name: c.id,
        name: c.displayName ?? null,
        email: c.emailAddresses?.[0]?.address ?? null,
        phone: c.phones?.[0]?.number ?? null,
        organization: c.companyName ?? null,
        job_title: c.jobTitle ?? null,
        provider: "microsoft",
      }));
      return { contacts, total: contacts.length };
    }

    case "create": {
      const body: Record<string, unknown> = {};
      if (args.given_name) body.givenName = args.given_name;
      if (args.family_name) body.surname = args.family_name;
      if (args.given_name || args.family_name) {
        body.displayName = [args.given_name, args.family_name].filter(Boolean).join(" ");
      }
      if (args.emails) {
        body.emailAddresses = (args.emails as string[]).map((e) => ({ address: e }));
      }
      if (args.phones) {
        body.phones = (args.phones as string[]).map((p) => ({ number: p, type: "mobile" }));
      }
      if (args.organization) body.companyName = args.organization;
      if (args.job_title) body.jobTitle = args.job_title;

      const resp = await retryFetch(
        `${GRAPH_API}/contacts`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!resp.ok) throw new Error(`Microsoft contact create failed (${resp.status})`);
      const created = await resp.json();
      return {
        status: "created",
        resource_name: created.id,
        name: created.displayName ?? null,
        email: created.emailAddresses?.[0]?.address ?? null,
        provider: "microsoft",
      };
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
  const maxResults = Math.min((args.max_results as number) ?? 10, 20);
  const searchTz = (args.time_zone as string) ?? DEFAULT_TZ;

  const [googleAccounts, msAccounts] = await Promise.all([
    getAllAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
    getAllMicrosoftAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
  ]);

  const allAccounts = googleAccounts.length + msAccounts.length;
  const perAccountMax = Math.max(Math.ceil(maxResults / Math.max(allAccounts, 1)), 5);

  const googleResults = Promise.all(
    googleAccounts.map(async (acct) => {
      try {
        const messages = await listGmailMessages(acct.accessToken, args.query as string, perAccountMax);
        if (!messages.length) return [];
        const details = await Promise.all(
          messages.map((m: any) => getGmailMessage(acct.accessToken, m.id)),
        );
        return details.map((d: any) => {
          let dateLocal = d.date;
          try {
            const parsed = d.internalDate ? new Date(d.internalDate) : new Date(d.date);
            if (!isNaN(parsed.getTime())) {
              dateLocal = parsed.toLocaleString("en-AU", {
                weekday: "short", day: "numeric", month: "short", year: "numeric",
                hour: "numeric", minute: "2-digit", hour12: true,
                timeZone: searchTz,
              });
            }
          } catch { /* keep raw date */ }
          return {
            message_id: d.messageId, thread_id: d.threadId,
            from: d.from, to: d.to, cc: d.cc,
            subject: d.subject, date: dateLocal, snippet: d.snippet,
            body_preview: d.bodyPreview,
            has_attachments: (d.attachmentCount ?? 0) > 0,
            account: acct.email,
            provider: "google",
          };
        });
      } catch (e) {
        console.warn(`[tools] gmail_search error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const msResults = Promise.all(
    msAccounts.map(async (acct) => {
      try {
        return await searchOutlookMessages(acct.accessToken, acct.email, args.query as string, perAccountMax, searchTz);
      } catch (e) {
        console.warn(`[tools] gmail_search (MS) error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const [gResults, mResults] = await Promise.all([googleResults, msResults]);

  const allResults = [...gResults.flat(), ...mResults.flat()]
    .sort((a: any, b: any) => {
      const da = new Date(a.date || 0).getTime();
      const db = new Date(b.date || 0).getTime();
      return db - da;
    })
    .slice(0, maxResults);

  if (!allResults.length) {
    return { results: [], count: 0, message: "No emails found matching that query." };
  }

  return { results: allResults, count: allResults.length };
}

async function searchOutlookMessages(
  accessToken: string,
  accountEmail: string,
  query: string,
  maxResults: number,
  tz: string,
): Promise<any[]> {
  const params = new URLSearchParams({
    $search: `"${query}"`,
    $top: String(maxResults),
    $orderby: "receivedDateTime desc",
    $select: "id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,bodyPreview,body,hasAttachments",
  });

  const resp = await retryFetch(
    `${GRAPH_API}/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) {
    console.warn(`[tools] outlook search failed for ${accountEmail} (${resp.status})`);
    return [];
  }

  const data = await resp.json();
  return (data.value ?? []).map((m: any) => {
    let dateLocal = m.receivedDateTime ?? "";
    try {
      const parsed = new Date(m.receivedDateTime);
      if (!isNaN(parsed.getTime())) {
        dateLocal = parsed.toLocaleString("en-AU", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
          hour: "numeric", minute: "2-digit", hour12: true,
          timeZone: tz,
        });
      }
    } catch { /* keep raw */ }

    const toAddrs = (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(", ");
    const ccAddrs = (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(", ");

    return {
      message_id: m.id,
      thread_id: m.conversationId ?? m.id,
      from: m.from?.emailAddress ? `${m.from.emailAddress.name ?? ""} <${m.from.emailAddress.address}>` : "",
      to: toAddrs,
      cc: ccAddrs,
      subject: m.subject ?? "",
      date: dateLocal,
      snippet: (m.bodyPreview ?? "").slice(0, 200),
      body_preview: (m.bodyPreview ?? "").slice(0, 2000),
      has_attachments: !!m.hasAttachments,
      account: accountEmail,
      provider: "microsoft",
    };
  });
}

async function getEmail(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const messageId = args.message_id as string;
  if (!messageId) return { error: "message_id is required" };

  const { accessToken, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);
  const emailTz = (args.time_zone as string) ?? DEFAULT_TZ;

  if (provider === "microsoft") {
    return getOutlookEmail(accessToken, messageId, emailTz);
  }

  const resp = await retryFetch(
    `${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Get email failed (${resp.status})`);

  const msg = await resp.json();
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

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

  let dateLocal = getHeader("Date") ?? "";
  try {
    const internalMs = parseInt(msg.internalDate ?? "0", 10);
    const parsed = internalMs ? new Date(internalMs) : new Date(dateLocal);
    if (!isNaN(parsed.getTime())) {
      dateLocal = parsed.toLocaleString("en-AU", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
        timeZone: emailTz,
      });
    }
  } catch { /* keep raw */ }

  return {
    message_id: msg.id, thread_id: msg.threadId,
    from: getHeader("From"), to: getHeader("To"), cc: getHeader("Cc"),
    subject: getHeader("Subject"), date: dateLocal,
    body, attachments, labels: msg.labelIds ?? [],
  };
}

async function getOutlookEmail(
  accessToken: string,
  messageId: string,
  tz: string,
): Promise<unknown> {
  const resp = await retryFetch(
    `${GRAPH_API}/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,body,hasAttachments,attachments`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Get Outlook email failed (${resp.status})`);

  const m = await resp.json();

  let body = "";
  if (m.body?.contentType === "text") {
    body = m.body.content ?? "";
  } else if (m.body?.content) {
    body = m.body.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  let dateLocal = m.receivedDateTime ?? "";
  try {
    const parsed = new Date(m.receivedDateTime);
    if (!isNaN(parsed.getTime())) {
      dateLocal = parsed.toLocaleString("en-AU", {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
        timeZone: tz,
      });
    }
  } catch { /* keep raw */ }

  const toAddrs = (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(", ");
  const ccAddrs = (m.ccRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(", ");

  const attachments = (m.attachments ?? [])
    .filter((a: any) => a.name)
    .map((a: any) => ({ filename: a.name, mime_type: a.contentType, size: a.size }));

  return {
    message_id: m.id,
    thread_id: m.conversationId ?? m.id,
    from: m.from?.emailAddress ? `${m.from.emailAddress.name ?? ""} <${m.from.emailAddress.address}>` : "",
    to: toAddrs,
    cc: ccAddrs,
    subject: m.subject ?? "",
    date: dateLocal,
    body,
    attachments,
    labels: [],
    provider: "microsoft",
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

async function sendDraft(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const toRaw = Array.isArray(args.to) ? args.to : [args.to as string];
  const invalidRecipients = toRaw.filter((r: string) => !r?.includes("@"));
  if (invalidRecipients.length > 0) {
    return {
      error: `Invalid recipient(s): ${invalidRecipients.join(", ")}. Each recipient must be a valid email address containing @. Use contacts_search or person_lookup to find their email first.`,
      _hint: "Call contacts_search with the person's name, then retry send_draft with the email address from the result.",
    };
  }

  const { accessToken, email: acctEmail, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);

  if (provider === "microsoft") {
    return createOutlookDraft(accessToken, acctEmail, args);
  }

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
    account: acctEmail,
    _confirmation: "Email draft created successfully. Show the draft to the user and ask for confirmation before sending.",
  };
}

async function createOutlookDraft(
  accessToken: string,
  acctEmail: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const toList = Array.isArray(args.to) ? args.to : [args.to as string];
  const ccList = args.cc ? (Array.isArray(args.cc) ? args.cc : [args.cc as string]) : [];

  const htmlBody = (args.body as string ?? "").includes("<br") || (args.body as string ?? "").includes("<p")
    ? (args.body as string)
    : (args.body as string ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>\n");

  const message: Record<string, unknown> = {
    subject: args.subject,
    body: { contentType: "html", content: htmlBody },
    toRecipients: toList.map((email: string) => ({ emailAddress: { address: email } })),
  };
  if (ccList.length) {
    message.ccRecipients = ccList.map((email: string) => ({ emailAddress: { address: email } }));
  }

  if (args.reply_to_thread_id) {
    const replyResp = await retryFetch(
      `${GRAPH_API}/messages/${encodeURIComponent(args.reply_to_thread_id as string)}/createReply`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "" }),
      },
    );
    if (replyResp.ok) {
      const replyDraft = await replyResp.json();
      await retryFetch(
        `${GRAPH_API}/messages/${encodeURIComponent(replyDraft.id)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ body: { contentType: "html", content: htmlBody } }),
        },
      );
      return {
        draft_id: replyDraft.id,
        status: "draft_created",
        to: args.to, subject: args.subject,
        is_reply: true,
        reply_all: !!args.reply_all,
        account: acctEmail,
        provider: "microsoft",
        _confirmation: "Email draft created successfully. Show the draft to the user and ask for confirmation before sending.",
      };
    }
  }

  const resp = await retryFetch(
    `${GRAPH_API}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
    },
  );
  if (!resp.ok) throw new Error(`Outlook create draft failed (${resp.status})`);

  const draft = await resp.json();
  return {
    draft_id: draft.id,
    status: "draft_created",
    to: args.to, subject: args.subject,
    is_reply: false,
    reply_all: false,
    account: acctEmail,
    provider: "microsoft",
    _confirmation: "Email draft created successfully. Show the draft to the user and ask for confirmation before sending.",
  };
}

async function sendEmail(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { accessToken, provider } = await resolveAnyToken(userId, supabase, args.account as string | undefined);
  const draftId = args.draft_id as string;

  if (!draftId) {
    throw new Error("draft_id is required. Create a draft with send_draft first.");
  }

  if (provider === "microsoft") {
    const resp = await retryFetch(
      `${GRAPH_API}/messages/${encodeURIComponent(draftId)}/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!resp.ok && resp.status !== 202) {
      const detail = await resp.text();
      throw new Error(`Outlook send email failed (${resp.status}): ${detail.slice(0, 200)}`);
    }
    return {
      status: "sent",
      message_id: draftId,
      provider: "microsoft",
      _confirmation: "Email sent successfully. Confirm this to the user.",
    };
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
// TODOS / TASK LIST
// ══════════════════════════════════════════════════════════════

async function manageTodos(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const action = args.action as string;

  switch (action) {
    case "add": {
      const title = args.title as string;
      if (!title) return { error: "Title is required to add a todo." };

      const row: Record<string, unknown> = {
        user_id: userId,
        title,
      };
      if (args.notes) row.notes = args.notes;
      if (args.due_at) row.due_at = args.due_at;
      if (args.priority) row.priority = args.priority;

      const { data, error } = await supabase
        .from("v2_user_todos")
        .insert(row)
        .select("id, title, priority, due_at")
        .single();
      if (error) throw new Error(`Add todo failed: ${error.message}`);
      return { todo_id: data.id, status: "added", title: data.title, priority: data.priority, due_at: data.due_at };
    }

    case "list": {
      const statusFilter = (args.status as string) ?? "open";
      const { data, error } = await supabase
        .from("v2_user_todos")
        .select("id, title, notes, due_at, priority, status, completed_at, created_at")
        .eq("user_id", userId)
        .eq("status", statusFilter)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`List todos failed: ${error.message}`);

      if (!data || data.length === 0) {
        return { todos: [], count: 0, message: statusFilter === "open" ? "No open todos. List is clear." : `No ${statusFilter} todos.` };
      }

      const todos = data.map((t: any) => {
        const item: Record<string, unknown> = {
          todo_id: t.id,
          title: t.title,
          priority: t.priority,
          created_at: t.created_at,
        };
        if (t.notes) item.notes = t.notes;
        if (t.due_at) item.due_at = t.due_at;
        if (t.completed_at) item.completed_at = t.completed_at;
        return item;
      });
      return { todos, count: todos.length };
    }

    case "complete": {
      const todoId = args.todo_id as string;
      if (!todoId) return { error: "todo_id is required to complete a todo." };

      const { data, error } = await supabase
        .from("v2_user_todos")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", todoId)
        .eq("user_id", userId)
        .select("id, title")
        .single();
      if (error) throw new Error(`Complete todo failed: ${error.message}`);
      return { todo_id: data.id, title: data.title, status: "completed" };
    }

    case "edit": {
      const editId = args.todo_id as string;
      if (!editId) return { error: "todo_id is required to edit a todo." };

      const updates: Record<string, unknown> = {};
      if (args.title) updates.title = args.title;
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.due_at !== undefined) updates.due_at = args.due_at;
      if (args.priority) updates.priority = args.priority;

      if (Object.keys(updates).length === 0) return { error: "Nothing to update." };

      const { data, error } = await supabase
        .from("v2_user_todos")
        .update(updates)
        .eq("id", editId)
        .eq("user_id", userId)
        .select("id, title, priority, due_at")
        .single();
      if (error) throw new Error(`Edit todo failed: ${error.message}`);
      return { todo_id: data.id, status: "updated", title: data.title };
    }

    case "delete": {
      const delId = args.todo_id as string;
      if (!delId) return { error: "todo_id is required to delete a todo." };

      const { data, error } = await supabase
        .from("v2_user_todos")
        .update({ status: "dismissed" })
        .eq("id", delId)
        .eq("user_id", userId)
        .select("id, title")
        .single();
      if (error) throw new Error(`Delete todo failed: ${error.message}`);
      return { todo_id: data.id, title: data.title, status: "deleted" };
    }

    default:
      return { error: `Unknown todo action: ${action}. Use add, list, complete, edit, or delete.` };
  }
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
  const tz = (args.time_zone as string) ?? DEFAULT_TZ;

  switch (action) {
    case "create": {
      let cronExpression = args.cron_expression as string | undefined;
      let triggerType = "cron";
      let emailFilter: string | undefined;

      let parsedNextFire: string | undefined;
      if (!cronExpression && args.schedule) {
        const parsed = parseSchedule(args.schedule as string, tz);
        triggerType = parsed.type;
        cronExpression = parsed.type === "cron" ? parsed.condition : undefined;
        emailFilter = parsed.emailFilter;
        parsedNextFire = parsed.nextFireAt;
      }

      let nextFireAt: string | null = parsedNextFire ?? null;
      if (!nextFireAt && cronExpression) nextFireAt = computeNextCronFire(cronExpression, tz);

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

      const confirmTime = nextFireAt
        ? new Date(nextFireAt).toLocaleString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true, weekday: "short", day: "numeric", month: "short" })
        : (args.schedule as string);

      return {
        reminder_id: data.id,
        status: "created",
        fires_at: confirmTime,
        repeating: isRepeating(args.schedule as string),
        _confirmation: "Reminder created. Confirm the time to the user.",
      };
    }

    case "list": {
      const { data, error } = await supabase
        .from("v2_triggers")
        .select("id, trigger_type, action_description, cron_expression, email_from_filter, repeating, active, next_fire_at, last_fired_at")
        .eq("user_id", userId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`List reminders failed: ${error.message}`);

      if (!data || data.length === 0) {
        return { reminders: [], count: 0, message: "No active reminders." };
      }

      return {
        reminders: (data ?? []).map((t: any) => ({
          reminder_id: t.id,
          type: t.trigger_type === "cron" ? "reminder" : "automation",
          description: t.action_description,
          repeating: t.repeating,
          next_fire_at: t.next_fire_at
            ? new Date(t.next_fire_at).toLocaleString("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true, weekday: "short", day: "numeric", month: "short" })
            : null,
          last_fired_at: t.last_fired_at,
        })),
        count: data.length,
      };
    }

    case "edit": {
      const updates: Record<string, unknown> = {};
      if (args.description) updates.action_description = args.description;
      if (args.schedule || args.cron_expression) {
        const cron = (args.cron_expression as string) ?? parseSchedule(args.schedule as string, tz).condition;
        updates.cron_expression = cron;
        updates.next_fire_at = computeNextCronFire(cron, tz);
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

/**
 * Get the current wall-clock time in a given IANA timezone.
 * Returns a Date object whose UTC value corresponds to "now" in that timezone.
 */
function nowInTimezone(tz: string): { localHour: number; localMinute: number; localDate: number; localMonth: number; localDow: number; utcNow: Date } {
  const utcNow = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric", minute: "numeric", day: "numeric", month: "numeric", weekday: "short",
    hour12: false,
  }).formatToParts(utcNow);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "0";
  const localHour = parseInt(get("hour"), 10) % 24;
  const localMinute = parseInt(get("minute"), 10);
  const localDate = parseInt(get("day"), 10);
  const localMonth = parseInt(get("month"), 10);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const localDow = dowMap[get("weekday")] ?? 0;

  return { localHour, localMinute, localDate, localMonth, localDow, utcNow };
}

/**
 * Convert a local hour:minute in a timezone to a UTC Date for today (or tomorrow if past).
 */
function localTimeToUtc(hour: number, minute: number, tz: string, dateOverride?: { date: number; month: number }): Date {
  const { localHour, localMinute, localDate, localMonth, utcNow } = nowInTimezone(tz);

  const offsetMs = (() => {
    const utcStr = utcNow.toLocaleString("en-US", { timeZone: "UTC", hour12: false });
    const localStr = utcNow.toLocaleString("en-US", { timeZone: tz, hour12: false });
    return new Date(localStr).getTime() - new Date(utcStr).getTime();
  })();

  const target = new Date(utcNow);
  if (dateOverride) {
    target.setUTCMonth(dateOverride.month - 1, dateOverride.date);
  }
  target.setUTCHours(hour, minute, 0, 0);
  const utcTarget = new Date(target.getTime() - offsetMs);

  if (!dateOverride && utcTarget <= utcNow) {
    utcTarget.setUTCDate(utcTarget.getUTCDate() + 1);
  }

  return utcTarget;
}

function parseSchedule(schedule: string, tz = DEFAULT_TZ): { type: string; condition: string; emailFilter?: string; nextFireAt?: string } {
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

  // "in X hours/minutes" — compute absolute UTC fire time
  const inMatch = lower.match(/in\s+(\d+)\s+(hour|minute|min)/);
  if (inMatch) {
    const target = new Date();
    if (inMatch[2].startsWith("hour")) target.setTime(target.getTime() + parseInt(inMatch[1], 10) * 3600000);
    else target.setTime(target.getTime() + parseInt(inMatch[1], 10) * 60000);
    return {
      type: "cron",
      condition: `${target.getUTCMinutes()} ${target.getUTCHours()} ${target.getUTCDate()} ${target.getUTCMonth() + 1} *`,
      nextFireAt: target.toISOString(),
    };
  }

  // One-shot: "tomorrow at 3pm", "at 5pm", "today at noon", etc.
  // Generate date-specific cron expression so it only fires once.
  const isTomorrow = lower.includes("tomorrow");
  const time = extractTime(lower);
  const utcFire = localTimeToUtc(time.hour, time.minute, tz);
  if (isTomorrow && utcFire.getTime() - Date.now() < 12 * 3600000) {
    utcFire.setUTCDate(utcFire.getUTCDate() + 1);
  }

  // Use the UTC fire date for a date-specific cron expression (one-shot)
  return {
    type: "cron",
    condition: `${utcFire.getUTCMinutes()} ${utcFire.getUTCHours()} ${utcFire.getUTCDate()} ${utcFire.getUTCMonth() + 1} *`,
    nextFireAt: utcFire.toISOString(),
  };
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

function computeNextCronFire(cronExpression: string, tz = DEFAULT_TZ): string | null {
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const [minuteStr, hourStr, dayStr, monthStr, dowStr] = parts;

    // If day/month are specific (one-shot), compute directly
    if (dayStr !== "*" && monthStr !== "*") {
      const targetHour = parseInt(hourStr, 10);
      const targetMinute = parseInt(minuteStr, 10);
      return localTimeToUtc(targetHour, targetMinute, tz, {
        date: parseInt(dayStr, 10),
        month: parseInt(monthStr, 10),
      }).toISOString();
    }

    // Recurring: compute next occurrence from local time
    const targetHour = hourStr === "*" ? 9 : parseInt(hourStr, 10);
    const targetMinute = minuteStr === "*" ? 0 : parseInt(minuteStr, 10);
    let utcFire = localTimeToUtc(targetHour, targetMinute, tz);

    // Handle day-of-week constraints (e.g., "0 9 * * 1" = every Monday)
    if (dowStr && dowStr !== "*") {
      const targetDow = parseInt(dowStr, 10); // 0=Sun, 1=Mon, ..., 6=Sat
      if (!isNaN(targetDow) && targetDow >= 0 && targetDow <= 6) {
        const fireParts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
        }).formatToParts(utcFire);
        const dowMap: Record<string, number> = {
          Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
        };
        const fireDow = dowMap[fireParts.find(p => p.type === "weekday")?.value ?? ""] ?? -1;

        if (fireDow !== targetDow) {
          let daysAhead = targetDow - fireDow;
          if (daysAhead <= 0) daysAhead += 7;
          utcFire = new Date(utcFire.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        }
      }
    }

    return utcFire.toISOString();
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
  const query = args.query as string;
  const fileType = (args.file_type as string) ?? "any";
  const sharedBy = args.shared_by as string;
  const maxResults = (args.max_results as number) ?? 10;

  const [googleAccounts, msAccounts] = await Promise.all([
    getAllAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
    getAllMicrosoftAccountTokens(supabase, userId).catch(() => [] as AccountToken[]),
  ]);

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

  const googleResults = Promise.all(
    googleAccounts.map(async (acct) => {
      try {
        const [fullTextResp, nameResp] = await Promise.all([
          retryFetch(
            `${DRIVE_API}/files?${new URLSearchParams({
              q: `fullText contains '${escaped}' and trashed = false${mimeFilter}`,
              pageSize: String(maxResults), fields, orderBy: "modifiedTime desc",
              supportsAllDrives: "true", includeItemsFromAllDrives: "true",
            })}`,
            { headers: { Authorization: `Bearer ${acct.accessToken}` } },
          ),
          retryFetch(
            `${DRIVE_API}/files?${new URLSearchParams({
              q: `name contains '${escaped}' and trashed = false${mimeFilter}`,
              pageSize: String(maxResults), fields, orderBy: "modifiedTime desc",
              supportsAllDrives: "true", includeItemsFromAllDrives: "true",
            })}`,
            { headers: { Authorization: `Bearer ${acct.accessToken}` } },
          ),
        ]);

        const fullTextData = fullTextResp.ok ? await fullTextResp.json() : { files: [] };
        const nameData = nameResp.ok ? await nameResp.json() : { files: [] };

        const localSeen = new Set<string>();
        const files: any[] = [];
        for (const f of [...(nameData.files ?? []), ...(fullTextData.files ?? [])]) {
          if (!localSeen.has(f.id)) { localSeen.add(f.id); files.push(f); }
        }

        return files.map((f: any) => ({
          file_id: f.id, name: f.name, type: f.mimeType, modified: f.modifiedTime,
          owner: f.owners?.[0]?.displayName ?? null,
          shared_by: f.sharingUser?.displayName ?? null,
          link: f.webViewLink,
          size: f.size ? `${Math.round(parseInt(f.size) / 1024)}KB` : null,
          account: acct.email,
          provider: "google",
        }));
      } catch (e) {
        console.warn(`[tools] document_search error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const msResults = Promise.all(
    msAccounts.map(async (acct) => {
      try {
        const resp = await retryFetch(
          `${GRAPH_API}/drive/root/search(q='${encodeURIComponent(query)}')?$top=${maxResults}&$select=id,name,file,lastModifiedDateTime,createdBy,webUrl,size`,
          { headers: { Authorization: `Bearer ${acct.accessToken}` } },
        );
        if (!resp.ok) {
          console.warn(`[tools] document_search (OneDrive) failed for ${acct.email} (${resp.status})`);
          return [];
        }
        const data = await resp.json();
        return (data.value ?? []).map((f: any) => ({
          file_id: f.id,
          name: f.name,
          type: f.file?.mimeType ?? "unknown",
          modified: f.lastModifiedDateTime,
          owner: f.createdBy?.user?.displayName ?? null,
          shared_by: null,
          link: f.webUrl,
          size: f.size ? `${Math.round(f.size / 1024)}KB` : null,
          account: acct.email,
          provider: "microsoft",
        }));
      } catch (e) {
        console.warn(`[tools] document_search (OneDrive) error for ${acct.email}: ${(e as Error).message}`);
        return [];
      }
    }),
  );

  const [gResults, mResults] = await Promise.all([googleResults, msResults]);

  const seen = new Set<string>();
  let results = [...gResults.flat(), ...mResults.flat()].filter((f: any) => {
    if (seen.has(f.file_id)) return false;
    seen.add(f.file_id);
    return true;
  }).slice(0, maxResults);

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
  let location = args.location as string | undefined;
  if (!location) {
    const tz = (args._userTimezone as string) ?? DEFAULT_TZ;
    location = timezoneToCityName(tz);
  }
  const days = (args.days as number) ?? 1;
  const query = days > 1
    ? `${days} day weather forecast for ${location}`
    : `current weather in ${location}`;
  return webSearch({ query });
}

function timezoneToCityName(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? "Sydney";
  const region = tz.split("/")[0];
  const countryMap: Record<string, string> = {
    Australia: "Australia", Pacific: "Pacific", America: "USA",
    Europe: "Europe", Asia: "Asia", Africa: "Africa",
  };
  const country = countryMap[region] ?? "";
  return country ? `${city}, ${country}` : city;
}

// ══════════════════════════════════════════════════════════════
// TRAVEL TIME (Google Maps Directions API)
// ══════════════════════════════════════════════════════════════

const DIRECTIONS_API = "https://maps.googleapis.com/maps/api/directions/json";

async function travelTime(args: Record<string, unknown>): Promise<unknown> {
  const origin = args.origin as string | undefined;
  const destination = args.destination as string | undefined;
  if (!origin || !destination) {
    return { error: "Both 'origin' and 'destination' are required." };
  }

  if (!GOOGLE_MAPS_API_KEY) {
    const query = `travel time from ${origin} to ${destination} by ${(args.mode as string) ?? "driving"}`;
    console.log("[tools] No GOOGLE_MAPS_API_KEY, falling back to web_search");
    return webSearch({ query });
  }

  const mode = (args.mode as string) ?? "driving";
  const departureTime = args.departure_time as string | undefined;

  const params = new URLSearchParams({
    origin,
    destination,
    mode,
    key: GOOGLE_MAPS_API_KEY,
  });

  if (mode === "transit") {
    params.set("alternatives", "true");
  }

  if (departureTime) {
    if (departureTime === "now") {
      params.set("departure_time", "now");
    } else {
      const epochSec = Math.floor(new Date(departureTime).getTime() / 1000);
      if (!isNaN(epochSec) && epochSec > Math.floor(Date.now() / 1000)) {
        params.set("departure_time", String(epochSec));
        if (mode !== "transit") params.set("traffic_model", "best_guess");
      } else {
        params.set("departure_time", "now");
      }
    }
  } else {
    params.set("departure_time", "now");
  }

  try {
    const resp = await fetchWithTimeout(`${DIRECTIONS_API}?${params}`, {}, FETCH_TIMEOUT_MS);
    const data = await resp.json();

    if (data.status === "ZERO_RESULTS" || (data.status !== "OK" && mode === "transit")) {
      console.log(`[tools] transit directions returned ${data.status} (error: ${data.error_message ?? "none"}), falling back to web_search`);
      const transitQuery = `${origin} to ${destination} train schedule departure time today`;
      const fallback = await webSearch({ query: transitQuery });
      if (typeof fallback === "object" && fallback !== null) {
        (fallback as Record<string, unknown>)._transit_fallback = true;
        (fallback as Record<string, unknown>)._google_status = data.status;
        (fallback as Record<string, unknown>).origin = origin;
        (fallback as Record<string, unknown>).destination = destination;
        (fallback as Record<string, unknown>).mode = "transit";
        (fallback as Record<string, unknown>)._format = "MANDATORY: Present using <nest-content> card even though this is web search data. Lead with short conversational line. Use 🚆 for trains. Show service names in bold, typical duration, frequency, fare if available. Format: 🚆 **Line Name** → Destination, 📍 From STATION → STATION, ⏱ ~DURATION · Runs every X min, 💴 ~FARE. Show multiple options if available.";
        (fallback as Record<string, unknown>)._time_note = "CRITICAL INSTRUCTION: This is timetable data. Times shown are in LOCAL TIME at the destination (e.g. JST for Japan). These are RECURRING DAILY schedules, not past events. You MUST present this data using the <nest-content> card format. Do NOT say 'couldn't confirm' or 'want me to re-check'. Show the train services, frequency, duration, and fare. The user needs this info NOW.";
      }
      return fallback;
    }

    if (data.status !== "OK" || !data.routes?.length) {
      return {
        error: `Google Maps returned: ${data.status}`,
        hint: data.error_message ?? "Check origin/destination spelling.",
      };
    }

    if (mode === "transit") {
      return parseTransitRoutes(data.routes, origin, destination);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const result: Record<string, unknown> = {
      origin: leg.start_address,
      destination: leg.end_address,
      distance: leg.distance?.text,
      duration: leg.duration?.text,
      mode,
    };

    if (leg.duration_in_traffic) {
      result.duration_in_traffic = leg.duration_in_traffic.text;
      result.duration_seconds = leg.duration_in_traffic.value;
    } else {
      result.duration_seconds = leg.duration?.value;
    }

    if (departureTime && departureTime !== "now") {
      result.departure_time = departureTime;
      const arrivalSec = (leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0);
      const depMs = new Date(departureTime).getTime();
      if (!isNaN(depMs) && arrivalSec) {
        result.estimated_arrival = new Date(depMs + arrivalSec * 1000).toISOString();
      }
    }

    const steps = leg.steps?.slice(0, 5).map((s: any) => ({
      instruction: s.html_instructions?.replace(/<[^>]*>/g, ""),
      distance: s.distance?.text,
      duration: s.duration?.text,
    }));
    if (steps?.length) result.route_summary = steps;

    return result;
  } catch (e) {
    console.error("[tools] travel_time error:", (e as Error).message);
    const query = mode === "transit"
      ? `${origin} to ${destination} train schedule departure time today`
      : `travel time from ${origin} to ${destination} by ${mode}`;
    const fallback = await webSearch({ query });
    if (mode === "transit" && typeof fallback === "object" && fallback !== null) {
      (fallback as Record<string, unknown>)._transit_fallback = true;
      (fallback as Record<string, unknown>).origin = origin;
      (fallback as Record<string, unknown>).destination = destination;
      (fallback as Record<string, unknown>).mode = "transit";
      (fallback as Record<string, unknown>)._format = "MANDATORY: Present using <nest-content> card even though this is web search data. Use 🚆 for trains. Show service names in bold, typical duration, frequency, fare if available.";
    }
    return fallback;
  }
}

function parseTransitRoutes(routes: any[], origin: string, destination: string): unknown {
  const options = routes.slice(0, 3).map((route: any, idx: number) => {
    const leg = route.legs[0];
    const option: Record<string, unknown> = {
      option: idx + 1,
      origin: leg.start_address,
      destination: leg.end_address,
      duration: leg.duration?.text,
      duration_seconds: leg.duration?.value,
      depart_at: leg.departure_time?.text,
      arrive_at: leg.arrival_time?.text,
    };

    const transitSteps = (leg.steps ?? [])
      .filter((s: any) => s.travel_mode === "TRANSIT" || s.travel_mode === "WALKING")
      .slice(0, 8)
      .map((s: any) => {
        const step: Record<string, unknown> = {
          mode: s.travel_mode?.toLowerCase(),
          instruction: s.html_instructions?.replace(/<[^>]*>/g, ""),
          distance: s.distance?.text,
          duration: s.duration?.text,
        };
        if (s.transit_details) {
          const td = s.transit_details;
          step.line_name = td.line?.short_name || td.line?.name;
          step.vehicle_type = td.line?.vehicle?.type?.toLowerCase();
          step.num_stops = td.num_stops;
          step.departure_stop = td.departure_stop?.name;
          step.arrival_stop = td.arrival_stop?.name;
          if (td.departure_time?.text) step.departs_at = td.departure_time.text;
          if (td.arrival_time?.text) step.arrives_at = td.arrival_time.text;
          if (td.headsign) step.direction = td.headsign;
        }
        return step;
      });
    if (transitSteps.length) option.transit_steps = transitSteps;

    return option;
  });

  return {
    mode: "transit",
    origin: options[0]?.origin ?? origin,
    destination: options[0]?.destination ?? destination,
    options,
    _format: "MANDATORY: Present using <nest-content> card. Lead with short conversational line. Use emoji per leg: 🚆train 🚃metro 🚌bus 🚊tram ⛴ferry 🚶walk. Each leg: emoji **Line Name** → Direction, 🕐 Departs TIME from STOP, 🏁 Arrives TIME at STOP, ⏱ DURATION. Show alternatives as compact one-liners at bottom.",
  };
}

// ══════════════════════════════════════════════════════════════
// PLACES SEARCH (Google Places API New)
// ══════════════════════════════════════════════════════════════

const PLACES_TEXT_SEARCH_API = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAIL_API = "https://places.googleapis.com/v1/places";

async function placesSearch(args: Record<string, unknown>): Promise<unknown> {
  const query = args.query as string | undefined;
  const placeId = args.place_id as string | undefined;

  if (!query && !placeId) {
    return { error: "Provide 'query' (text search) or 'place_id' (details)." };
  }

  if (!GOOGLE_MAPS_API_KEY) {
    const searchQuery = query ?? `place details ${placeId}`;
    console.log("[tools] No GOOGLE_MAPS_API_KEY, falling back to web_search");
    return webSearch({ query: searchQuery });
  }

  try {
    if (placeId) {
      return await placesDetail(placeId);
    }
    return await placesTextSearch(query!, args);
  } catch (e) {
    console.error("[tools] places_search error:", (e as Error).message);
    return webSearch({ query: query ?? `place ${placeId}` });
  }
}

async function placesTextSearch(
  query: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const maxResults = Math.min((args.max_results as number) ?? 5, 10);
  const locationBias = args.location as string | undefined;

  const body: Record<string, unknown> = {
    textQuery: query,
    maxResultCount: maxResults,
    languageCode: "en",
  };

  if (locationBias) {
    body.textQuery = `${query} near ${locationBias}`;
  }

  const fieldMask = [
    "places.displayName",
    "places.formattedAddress",
    "places.rating",
    "places.userRatingCount",
    "places.priceLevel",
    "places.types",
    "places.websiteUri",
    "places.nationalPhoneNumber",
    "places.currentOpeningHours",
    "places.editorialSummary",
    "places.googleMapsUri",
    "places.id",
  ].join(",");

  const resp = await fetchWithTimeout(PLACES_TEXT_SEARCH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  }, FETCH_TIMEOUT_MS);

  const data = await resp.json();

  if (data.error) {
    return { error: data.error.message ?? "Places API error", status: data.error.status };
  }

  const places = (data.places ?? []).map((p: any) => {
    const result: Record<string, unknown> = {
      name: p.displayName?.text,
      address: p.formattedAddress,
      place_id: p.id,
      google_maps_url: p.googleMapsUri,
    };
    if (p.rating) result.rating = `${p.rating}/5 (${p.userRatingCount ?? 0} reviews)`;
    if (p.priceLevel) result.price_level = p.priceLevel;
    if (p.nationalPhoneNumber) result.phone = p.nationalPhoneNumber;
    if (p.websiteUri) result.website = p.websiteUri;
    if (p.editorialSummary?.text) result.summary = p.editorialSummary.text;
    if (p.currentOpeningHours?.openNow !== undefined) {
      result.open_now = p.currentOpeningHours.openNow;
    }
    const types = (p.types ?? [])
      .filter((t: string) => !t.startsWith("point_of_interest") && !t.startsWith("establishment"))
      .slice(0, 3);
    if (types.length) result.types = types;
    return result;
  });

  return { results: places, count: places.length };
}

async function placesDetail(placeId: string): Promise<unknown> {
  const fieldMask = [
    "displayName",
    "formattedAddress",
    "rating",
    "userRatingCount",
    "priceLevel",
    "types",
    "websiteUri",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "currentOpeningHours",
    "editorialSummary",
    "reviews",
    "googleMapsUri",
    "adrFormatAddress",
  ].join(",");

  const resp = await fetchWithTimeout(`${PLACES_DETAIL_API}/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": fieldMask,
    },
  }, FETCH_TIMEOUT_MS);

  const p = await resp.json();

  if (p.error) {
    return { error: p.error.message ?? "Places API error", status: p.error.status };
  }

  const result: Record<string, unknown> = {
    name: p.displayName?.text,
    address: p.formattedAddress,
    google_maps_url: p.googleMapsUri,
  };
  if (p.rating) result.rating = `${p.rating}/5 (${p.userRatingCount ?? 0} reviews)`;
  if (p.priceLevel) result.price_level = p.priceLevel;
  if (p.nationalPhoneNumber) result.phone = p.nationalPhoneNumber;
  if (p.internationalPhoneNumber) result.international_phone = p.internationalPhoneNumber;
  if (p.websiteUri) result.website = p.websiteUri;
  if (p.editorialSummary?.text) result.summary = p.editorialSummary.text;
  if (p.currentOpeningHours) {
    result.open_now = p.currentOpeningHours.openNow;
    const weekday = p.currentOpeningHours.weekdayDescriptions;
    if (weekday?.length) result.hours = weekday;
  }
  if (p.reviews?.length) {
    result.top_reviews = p.reviews.slice(0, 3).map((r: any) => ({
      rating: r.rating,
      text: r.text?.text?.slice(0, 200),
      time: r.relativePublishTimeDescription,
    }));
  }
  return result;
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

export interface EmbeddingLogContext {
  userId: string;
  supabase: SupabaseClient;
  endpoint?: string;
}

export async function getBatchEmbeddings(
  texts: string[],
  logCtx?: EmbeddingLogContext,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const t0 = Date.now();
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

  // Await cost logging — ensures DB row lands before caller continues
  if (logCtx && data.usage) {
    const { logApiUsage } = await import("./cost-tracker.ts");
    await logApiUsage(logCtx.supabase, {
      userId:      logCtx.userId,
      model:       "text-embedding-3-large",
      endpoint:    logCtx.endpoint ?? "embeddings",
      description: `Embedding batch (${texts.length} text${texts.length !== 1 ? "s" : ""})`,
      tokensIn:    data.usage.prompt_tokens ?? 0,
      tokensOut:   0,
      latencyMs:   Date.now() - t0,
    });
  }

  return (data.data as Array<{ index: number; embedding: number[] }>)
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export function vectorString(values: number[]): string {
  return "[" + values.map((v) => v.toFixed(8)).join(",") + "]";
}

// ── Update User Timezone ─────────────────────────────────────

async function updateUserTimezone(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const timezone = (args.timezone as string)?.trim();
  const reason = (args.reason as string) ?? "";

  if (!timezone) {
    return { error: "timezone is required (IANA format, e.g. 'Asia/Tokyo')" };
  }

  // Basic IANA timezone validation (must contain a slash)
  if (!timezone.includes("/")) {
    return { error: `Invalid timezone format: "${timezone}". Use IANA format like "Asia/Tokyo", "Europe/London", "America/New_York".` };
  }

  // Validate the timezone is real by trying to use it
  try {
    new Date().toLocaleString("en-US", { timeZone: timezone });
  } catch {
    return { error: `Unknown timezone: "${timezone}". Use a valid IANA timezone like "Asia/Tokyo", "Europe/London".` };
  }

  // Update ALL of the user's Google accounts to this timezone
  const { error } = await supabase
    .from("user_google_accounts")
    .update({ timezone, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    console.error("[update_user_timezone] DB error:", error);
    return { error: "Failed to update timezone" };
  }

  // Format the current time in the new timezone for confirmation
  const nowInTz = new Date().toLocaleString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });

  console.log(`[update_user_timezone] ${userId} → ${timezone} (${reason})`);

  return {
    _confirmation: true,
    timezone,
    current_local_time: nowInTz,
    message: `Timezone updated to ${timezone}. Current local time: ${nowInTz}.`,
  };
}

// ══════════════════════════════════════════════════════════════
// MEETING RECORDING (Recall.ai integration)
// ══════════════════════════════════════════════════════════════

/**
 * Connect user's calendar for automatic meeting recording.
 * Uses their existing Google refresh token — no extra OAuth needed.
 */
async function connectMeetingNotes(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const resp = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/recall-connect`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          account_email: (args.account as string) || undefined,
        }),
      },
      10_000,
    );

    const data = await resp.json();

    if (data.already_connected) {
      return {
        already_connected: true,
        _confirmation: "Your meeting recording is already set up. I'm joining all your meetings with video links.",
      };
    }

    if (data.success) {
      return {
        success: true,
        email: data.email,
        _confirmation: `Done! I've connected your calendar (${data.email}). I'll start joining your meetings with video links and taking notes. You'll get a quick summary after each meeting.`,
      };
    }

    return {
      error: data.error || "connection_failed",
      hint: data.hint || "Something went wrong connecting your calendar. Try again or connect a Google account first.",
    };
  } catch (e) {
    console.error("[connect_meeting_notes] Error:", (e as Error).message);
    return {
      error: "connection_failed",
      hint: "Something went wrong. Make sure you have a Google account connected.",
    };
  }
}

/**
 * Get meeting notes/transcript from recorded meetings.
 * Searches by title, attendee name, or date.
 */
async function getMeetingNotes(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const query = (args.query as string) ?? "";
  const includeTranscript = (args.include_transcript as boolean) ?? false;

  // Build query
  let dbQuery = supabase
    .from("recall_meetings")
    .select("id, event_title, event_start, event_end, attendees, summary_text, transcript_text, bot_status, transcript_status")
    .eq("user_id", userId)
    .eq("transcript_status", "ready")
    .order("event_start", { ascending: false })
    .limit(5);

  if (query) {
    // Search by title or attendee name
    dbQuery = dbQuery.or(`event_title.ilike.%${query}%`);
  }

  const { data: meetings, error } = await dbQuery;

  if (error) {
    console.error("[get_meeting_notes] DB error:", error);
    return { error: "Failed to fetch meeting notes" };
  }

  if (!meetings || meetings.length === 0) {
    // Try a broader search in case the query didn't match title
    const { data: broader } = await supabase
      .from("recall_meetings")
      .select("id, event_title, event_start, attendees, summary_text, transcript_status")
      .eq("user_id", userId)
      .eq("transcript_status", "ready")
      .order("event_start", { ascending: false })
      .limit(5);

    if (broader && broader.length > 0) {
      // Filter by attendee name or content match
      const filtered = broader.filter((m) => {
        const attendeeStr = JSON.stringify(m.attendees ?? []).toLowerCase();
        const titleStr = (m.event_title ?? "").toLowerCase();
        const q = query.toLowerCase();
        return attendeeStr.includes(q) || titleStr.includes(q) || (m.summary_text ?? "").toLowerCase().includes(q);
      });

      if (filtered.length > 0) {
        return {
          results: filtered.map((m) => ({
            title: m.event_title,
            date: m.event_start,
            attendees: m.attendees,
            summary: m.summary_text,
          })),
        };
      }
    }

    return {
      results: [],
      hint: "No recorded meeting notes found matching that query. I only have notes from meetings I've recorded.",
    };
  }

  return {
    results: meetings.map((m) => ({
      title: m.event_title,
      date: m.event_start,
      end: m.event_end,
      attendees: m.attendees,
      summary: m.summary_text,
      transcript: includeTranscript ? m.transcript_text : undefined,
      has_transcript: !!m.transcript_text,
    })),
  };
}

/**
 * Manage meeting recording settings: check status, disconnect.
 */
async function manageMeetingRecording(
  userId: string,
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const action = (args.action as string) ?? "status";

  if (action === "status") {
    const { data: calendars } = await supabase
      .from("recall_calendars")
      .select("id, calendar_email, platform, status, created_at")
      .eq("user_id", userId);

    const { data: recentMeetings } = await supabase
      .from("recall_meetings")
      .select("event_title, event_start, bot_status, transcript_status")
      .eq("user_id", userId)
      .order("event_start", { ascending: false })
      .limit(5);

    return {
      connected: (calendars ?? []).length > 0,
      calendars: calendars ?? [],
      recent_meetings: recentMeetings ?? [],
    };
  }

  if (action === "disconnect") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Get the user's JWT or use service role
    const { data: cal } = await supabase
      .from("recall_calendars")
      .select("recall_calendar_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!cal) {
      return { error: "No calendar connected to disconnect." };
    }

    try {
      const resp = await fetchWithTimeout(
        `${supabaseUrl}/functions/v1/recall-connect?calendar_id=${cal.recall_calendar_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
        },
        10_000,
      );

      const data = await resp.json();
      if (data.success) {
        return { _confirmation: "I've disconnected your calendar. I won't join your meetings anymore." };
      }
      return { error: data.error || "disconnect_failed" };
    } catch (e) {
      return { error: "Failed to disconnect: " + (e as Error).message };
    }
  }

  if (action === "decline_pitch") {
    await supabase.from("v2_user_memory").update({
      recall_pitch_status: "declined",
      recall_pitched_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return { success: true, _note: "Pitch declined. Won't suggest meeting notes again." };
  }

  return { error: `Unknown action: ${action}. Use "status", "disconnect", or "decline_pitch".` };
}