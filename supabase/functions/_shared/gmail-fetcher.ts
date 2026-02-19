// Gmail thread fetcher for server-side ingestion pipeline.
// Fetches threads via Gmail API with pagination and rate limiting.
//
// Two-phase API:
//   listGmailThreadIds()  — cheap: just lists IDs via search (~1 req per 100 threads)
//   fetchGmailThreadsByIds() — expensive: fetches full thread content for specific IDs

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getGoogleAccessToken } from "./gmail-helpers.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 50;

export interface GmailThread {
  threadId: string;
  subject: string;
  participants: string[];
  messages: GmailParsedMessage[];
  lastMessageDate: string;
}

export interface GmailParsedMessage {
  messageId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  bodyPlain: string;
  internalDate: number;
}

/**
 * List all thread IDs matching the date range (cheap — only lists, doesn't fetch content).
 */
export async function listGmailThreadIds(
  accessToken: string,
  daysBack: number,
  maxThreads = Infinity,
): Promise<string[]> {
  const query = `newer_than:${daysBack}d -in:trash -in:spam`;
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const batchSize = Number.isFinite(maxThreads)
      ? Math.min(100, maxThreads - ids.length)
      : 100;
    const params = new URLSearchParams({ q: query, maxResults: String(batchSize) });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(`${GMAIL_API}/threads?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`Gmail list threads failed (${resp.status}): ${detail.slice(0, 200)}`);
    }

    const data = await resp.json();
    for (const t of data.threads ?? []) {
      if (ids.length >= maxThreads) break;
      ids.push(t.id);
    }
    pageToken = data.nextPageToken;

    const cap = Number.isFinite(maxThreads) ? `/${maxThreads}` : "";
    console.log(`[gmail-fetcher] Listed ${ids.length}${cap} thread IDs...`);
  } while (pageToken && ids.length < maxThreads);

  return ids;
}

/**
 * Fetch and parse full thread content for a list of thread IDs.
 * Only fetches the threads you actually need — no wasted API calls.
 */
export async function fetchGmailThreadsByIds(
  accessToken: string,
  threadIds: string[],
): Promise<GmailThread[]> {
  if (threadIds.length === 0) return [];

  const threads: GmailThread[] = [];

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((id) => fetchAndParseThread(accessToken, id).catch((e) => {
        console.warn(`[gmail-fetcher] Failed to fetch thread ${id}:`, e.message);
        return null;
      })),
    );
    for (const t of results) {
      if (t) threads.push(t);
    }

    if (i + BATCH_SIZE < threadIds.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return threads;
}

/**
 * Legacy convenience wrapper — lists + fetches all in one call.
 */
export async function fetchGmailThreads(
  userId: string,
  supabase: SupabaseClient,
  daysBack = 120,
  maxThreads = 300,
  preAuthToken?: string,
): Promise<GmailThread[]> {
  const accessToken = preAuthToken ?? await getGoogleAccessToken(supabase, userId);
  const allThreadIds = await listGmailThreadIds(accessToken, daysBack, maxThreads);

  console.log(`[gmail-fetcher] Found ${allThreadIds.length} threads for user ${userId} (${daysBack}d)`);
  if (allThreadIds.length === 0) return [];

  const threads = await fetchGmailThreadsByIds(accessToken, allThreadIds);
  console.log(`[gmail-fetcher] Successfully parsed ${threads.length} threads`);
  return threads;
}

async function fetchAndParseThread(
  accessToken: string,
  threadId: string,
): Promise<GmailThread> {
  const resp = await fetch(`${GMAIL_API}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Gmail get thread failed (${resp.status}): ${detail.slice(0, 200)}`);
  }

  const data = await resp.json();
  const messages: GmailParsedMessage[] = [];
  const participantSet = new Set<string>();
  let subject = "";

  for (const msg of data.messages ?? []) {
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers ?? []) {
      headers[h.name] = h.value;
    }

    if (!subject && headers["Subject"]) subject = headers["Subject"];

    const from = headers["From"] ?? "";
    const to = headers["To"] ?? "";
    const cc = headers["Cc"] ?? "";

    if (from) participantSet.add(extractEmail(from));
    for (const addr of [to, cc].join(",").split(",")) {
      const e = extractEmail(addr.trim());
      if (e) participantSet.add(e);
    }

    const bodyPlain = extractPlainText(msg.payload) ?? msg.snippet ?? "";

    messages.push({
      messageId: msg.id,
      from,
      to,
      cc,
      subject: headers["Subject"] ?? subject,
      date: headers["Date"] ?? "",
      bodyPlain,
      internalDate: parseInt(msg.internalDate ?? "0", 10),
    });
  }

  messages.sort((a, b) => a.internalDate - b.internalDate);

  return {
    threadId,
    subject,
    participants: [...participantSet],
    messages,
    lastMessageDate: messages.length > 0
      ? new Date(messages[messages.length - 1].internalDate).toISOString()
      : new Date().toISOString(),
  };
}

function extractPlainText(payload: any): string | null {
  if (!payload) return null;

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try {
      return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return null;
    }
  }

  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part);
    if (text) return text;
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    try {
      const html = atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    } catch {
      return null;
    }
  }

  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/html" && part.body?.data) {
      try {
        const html = atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      } catch {
        continue;
      }
    }
  }

  return null;
}

function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (headerValue.includes("@")) return headerValue.trim().toLowerCase();
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
