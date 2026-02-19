// Google Calendar event fetcher for server-side ingestion pipeline.
// Fetches events from all calendars for a configurable date range.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "./gmail-helpers.ts";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  eventId: string;
  calendarId: string;
  title: string;
  description: string;
  start: string;
  end: string;
  attendees: string;
  organiser: string;
  location: string;
  meetingLink: string;
  status: string;
  recurringEventId: string | null;
}

export async function fetchCalendarEvents(
  userId: string,
  supabase: SupabaseClient,
  daysBack = 120,
  daysForward = 730,
  primaryOnly = false,
  preAuthToken?: string,
): Promise<CalendarEvent[]> {
  const accessToken = preAuthToken ?? await getGoogleAccessToken(supabase, userId);

  const now = new Date();
  const timeMin = new Date(now.getTime() - daysBack * 86400000).toISOString();
  const timeMax = new Date(now.getTime() + daysForward * 86400000).toISOString();

  let calendars: Array<{ id: string; summary: string }>;

  if (primaryOnly) {
    calendars = [{ id: "primary", summary: "Primary" }];
  } else {
    calendars = await listCalendars(accessToken);
    // Prioritise primary and owned calendars (limit to 5 to stay within time)
    calendars = calendars.slice(0, 5);
  }

  console.log(`[calendar-fetcher] Fetching from ${calendars.length} calendars for user ${userId}`);

  const allEvents: CalendarEvent[] = [];
  const seenIds = new Set<string>();

  // Fetch sequentially to avoid rate limits and control time
  for (const cal of calendars) {
    try {
      const events = await fetchEventsFromCalendar(accessToken, cal.id, timeMin, timeMax);
      for (const event of events) {
        if (!seenIds.has(event.eventId)) {
          seenIds.add(event.eventId);
          allEvents.push(event);
        }
      }
      console.log(`[calendar-fetcher] Calendar "${cal.summary}": ${events.length} events`);
    } catch (e) {
      console.warn(`[calendar-fetcher] Failed to fetch calendar ${cal.id}:`, (e as Error).message);
    }
  }

  allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  console.log(`[calendar-fetcher] Total ${allEvents.length} unique events (${daysBack}d back, ${daysForward}d forward)`);
  return allEvents;
}

async function listCalendars(
  accessToken: string,
): Promise<Array<{ id: string; summary: string }>> {
  const resp = await fetch(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&showHidden=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Calendar list failed (${resp.status}): ${detail.slice(0, 200)}`);
  }

  const data = await resp.json();
  return (data.items ?? [])
    .filter((c: any) => !c.deleted)
    .map((c: any) => ({ id: c.id, summary: c.summary ?? c.id }));
}

async function fetchEventsFromCalendar(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Calendar events failed (${resp.status}): ${detail.slice(0, 200)}`);
    }

    const data = await resp.json();

    for (const item of data.items ?? []) {
      if (item.status === "cancelled") continue;

      const start = item.start?.dateTime ?? item.start?.date ?? "";
      const end = item.end?.dateTime ?? item.end?.date ?? "";
      if (!start) continue;

      const attendeeList = (item.attendees ?? [])
        .filter((a: any) => !a.self)
        .map((a: any) => a.displayName || a.email || "")
        .filter(Boolean);

      const meetingLink = item.hangoutLink
        ?? item.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri
        ?? "";

      events.push({
        eventId: item.id,
        calendarId,
        title: item.summary ?? "(No title)",
        description: (item.description ?? "").slice(0, 500),
        start,
        end,
        attendees: attendeeList.join(", "),
        organiser: item.organizer?.displayName ?? item.organizer?.email ?? "",
        location: item.location ?? "",
        meetingLink,
        status: item.status ?? "confirmed",
        recurringEventId: item.recurringEventId ?? null,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}
