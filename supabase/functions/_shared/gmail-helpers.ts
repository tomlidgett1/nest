// Gmail OAuth + raw email helpers for v2 agent system.
// Reuses the google-token-broker pattern: refresh tokens live in
// `google_oauth_tokens` and we exchange them for short-lived access tokens.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

interface GmailTokens {
  accessToken: string;
  expiresIn: number;
}

/**
 * Get a fresh Google access token for a user by refreshing their stored token.
 * Uses the legacy single-token table (google_oauth_tokens).
 */
export async function getGoogleAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  // Prefer multi-account storage (primary account), then fallback to legacy.
  const { data: primaryAccount } = await supabase
    .from("user_google_accounts")
    .select("id, refresh_token")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  let source: "primary_account" | "legacy" = "primary_account";
  let sourceAccountId: string | null = primaryAccount?.id ?? null;
  let refreshToken: string | null = primaryAccount?.refresh_token ?? null;

  if (!refreshToken) {
    const { data: legacy, error } = await supabase
      .from("google_oauth_tokens")
      .select("refresh_token")
      .eq("user_id", userId)
      .single();

    if (error || !legacy?.refresh_token) {
      throw new Error(`No Google refresh token found for user ${userId}`);
    }
    source = "legacy";
    sourceAccountId = null;
    refreshToken = legacy.refresh_token;
  }

  const accessToken = await refreshAccessToken(refreshToken);

  // Rotate refresh token if Google issued a new one.
  if (accessToken._newRefreshToken && accessToken._newRefreshToken !== refreshToken) {
    if (source === "primary_account" && sourceAccountId) {
      await supabase
        .from("user_google_accounts")
        .update({ refresh_token: accessToken._newRefreshToken })
        .eq("id", sourceAccountId);
    }

    await supabase
      .from("google_oauth_tokens")
      .update({ refresh_token: accessToken._newRefreshToken })
      .eq("user_id", userId);
  }

  return accessToken.token;
}

/**
 * Get a fresh access token for a specific linked Google account.
 * Reads from user_google_accounts by account row ID.
 */
export async function getAccessTokenForAccount(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("user_google_accounts")
    .select("refresh_token")
    .eq("id", accountId)
    .single();

  if (error || !data?.refresh_token) {
    throw new Error(`No refresh token for google account ${accountId}`);
  }

  const result = await refreshAccessToken(data.refresh_token);

  if (result._newRefreshToken && result._newRefreshToken !== data.refresh_token) {
    await supabase
      .from("user_google_accounts")
      .update({ refresh_token: result._newRefreshToken })
      .eq("id", accountId);
  }

  return result.token;
}

// ── Multi-account helpers ────────────────────────────────────

export interface AccountToken {
  accountId: string;
  email: string;
  accessToken: string;
  isPrimary: boolean;
}

/**
 * Get fresh access tokens for ALL linked Google accounts.
 * Uses Promise.allSettled so one failed account doesn't block the rest.
 * Falls back to legacy single-token table if no multi-account rows exist.
 */
export async function getAllAccountTokens(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountToken[]> {
  const { data: accounts } = await supabase
    .from("user_google_accounts")
    .select("id, google_email, refresh_token, is_primary")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false });

  if (!accounts?.length) {
    const token = await getGoogleAccessToken(supabase, userId);
    return [{ accountId: "legacy", email: "primary", accessToken: token, isPrimary: true }];
  }

  const results = await Promise.allSettled(
    accounts.map(async (acct) => {
      const result = await refreshAccessToken(acct.refresh_token);
      if (result._newRefreshToken && result._newRefreshToken !== acct.refresh_token) {
        await supabase
          .from("user_google_accounts")
          .update({ refresh_token: result._newRefreshToken })
          .eq("id", acct.id);
      }
      return {
        accountId: acct.id,
        email: acct.google_email,
        accessToken: result.token,
        isPrimary: !!acct.is_primary,
      } as AccountToken;
    }),
  );

  const tokens = results
    .filter((r): r is PromiseFulfilledResult<AccountToken> => r.status === "fulfilled")
    .map((r) => r.value);

  for (const r of results) {
    if (r.status === "rejected") {
      console.warn(`[gmail-helpers] Token refresh failed for one account: ${(r.reason as Error).message}`);
    }
  }

  if (tokens.length === 0) {
    throw new Error(`All Google account token refreshes failed for user ${userId}`);
  }

  return tokens;
}

/**
 * Get a fresh access token for a specific Google account by email.
 * Falls back to primary if the requested email isn't found.
 */
export async function getTokenForEmail(
  supabase: SupabaseClient,
  userId: string,
  accountEmail: string,
): Promise<{ accessToken: string; email: string }> {
  const { data: acct } = await supabase
    .from("user_google_accounts")
    .select("id, google_email, refresh_token")
    .eq("user_id", userId)
    .eq("google_email", accountEmail)
    .maybeSingle();

  if (acct?.refresh_token) {
    const result = await refreshAccessToken(acct.refresh_token);
    if (result._newRefreshToken && result._newRefreshToken !== acct.refresh_token) {
      await supabase
        .from("user_google_accounts")
        .update({ refresh_token: result._newRefreshToken })
        .eq("id", acct.id);
    }
    return { accessToken: result.token, email: acct.google_email };
  }

  console.warn(`[gmail-helpers] Account ${accountEmail} not found for user ${userId}, falling back to primary`);
  const token = await getGoogleAccessToken(supabase, userId);
  return { accessToken: token, email: accountEmail };
}

/**
 * Exchange a refresh token for a fresh access token.
 * Low-level helper — callers decide where the refresh token comes from.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ token: string; _newRefreshToken?: string }> {
  const body = new URLSearchParams({
    client_id: googleClientId,
    client_secret: googleClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 400 && /invalid_grant/i.test(detail)) {
      throw new Error(
        `GOOGLE_REAUTH_REQUIRED: Google refresh token is invalid or revoked (${detail.slice(0, 300)})`,
      );
    }
    throw new Error(`Google token refresh failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  const accessToken = payload.access_token as string;
  if (!accessToken) {
    throw new Error("Google token refresh returned no access_token");
  }

  return {
    token: accessToken,
    _newRefreshToken: payload.refresh_token ?? undefined,
  };
}

/**
 * Create a Gmail draft email.
 */
export async function createGmailDraft(
  accessToken: string,
  to: string[],
  subject: string,
  body: string,
  cc?: string[],
  bcc?: string[],
): Promise<{ draftId: string; status: string }> {
  const raw = createRawEmail(to, subject, body, cc, bcc);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { raw },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail create draft failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const draft = await response.json();
  return { draftId: draft.id, status: "draft_created" };
}

/**
 * Create a Gmail draft reply to an existing thread.
 */
export async function createGmailReplyDraft(
  accessToken: string,
  threadId: string,
  body: string,
  _replyAll: boolean = false
): Promise<{ draftId: string; threadId: string; status: string }> {
  const raw = createRawReply(body);

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        threadId,
        raw,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gmail reply draft failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const draft = await response.json();
  return { draftId: draft.id, threadId, status: "reply_draft_created" };
}

/**
 * List recent Gmail messages matching a query.
 */
export async function listGmailMessages(
  accessToken: string,
  query: string,
  maxResults: number = 5
): Promise<any[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return data.messages ?? [];
}

/**
 * Rich Gmail message data returned by getGmailMessage.
 */
export interface GmailMessageData {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  replyTo: string;
  subject: string;
  date: string;
  snippet: string;
  bodyPreview: string;
  labelIds: string[];
  isImportant: boolean;
  isStarred: boolean;
  internalDate: number;
  attachmentCount: number;
  allHeaders: Record<string, string>;
}

/**
 * Get a single Gmail message with full structured data.
 * Uses format=full per the Gmail API reference to get all headers, snippet,
 * body parts, labels, internalDate, and threadId.
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessageData> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[gmail-helpers] getGmailMessage failed (${response.status}) for ${messageId}: ${detail.slice(0, 200)}`);
    return emptyGmailMessage(messageId);
  }

  const data = await response.json();

  // Extract all headers into a lookup map
  const allHeaders: Record<string, string> = {};
  const rawHeaders: Array<{ name: string; value: string }> = data.payload?.headers ?? [];
  for (const h of rawHeaders) {
    allHeaders[h.name] = h.value;
  }

  // Extract plain-text body (first text/plain part from recursive MIME structure)
  const bodyText = extractPlainTextBody(data.payload);

  // Count attachments (parts with a filename)
  const attachmentCount = countAttachments(data.payload);

  const labelIds: string[] = data.labelIds ?? [];

  const result: GmailMessageData = {
    messageId: data.id ?? messageId,
    threadId: data.threadId ?? "",
    from: allHeaders["From"] ?? "",
    to: allHeaders["To"] ?? "",
    cc: allHeaders["Cc"] ?? "",
    replyTo: allHeaders["Reply-To"] ?? "",
    subject: allHeaders["Subject"] ?? "",
    date: allHeaders["Date"] ?? "",
    snippet: data.snippet ?? "",
    bodyPreview: bodyText ? bodyText.slice(0, 800) : (data.snippet ?? ""),
    labelIds,
    isImportant: labelIds.includes("IMPORTANT"),
    isStarred: labelIds.includes("STARRED"),
    internalDate: parseInt(data.internalDate ?? "0", 10),
    attachmentCount,
    allHeaders,
  };

  console.log(`[gmail-helpers] Got message ${messageId}: From="${result.from}", Subject="${result.subject}", body=${result.bodyPreview.length}c, attachments=${attachmentCount}`);
  return result;
}

function emptyGmailMessage(messageId: string): GmailMessageData {
  return {
    messageId, threadId: "", from: "", to: "", cc: "", replyTo: "",
    subject: "", date: "", snippet: "", bodyPreview: "", labelIds: [],
    isImportant: false, isStarred: false, internalDate: 0, attachmentCount: 0,
    allHeaders: {},
  };
}

/**
 * Recursively extract the first text/plain body from a Gmail message payload.
 */
function extractPlainTextBody(payload: any): string | null {
  if (!payload) return null;

  // Direct body on this part
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    try {
      return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return null;
    }
  }

  // Recurse into parts (multipart messages)
  for (const part of payload.parts ?? []) {
    const text = extractPlainTextBody(part);
    if (text) return text;
  }

  return null;
}

/**
 * Recursively count attachment parts (parts with a filename).
 */
function countAttachments(payload: any): number {
  if (!payload) return 0;
  let count = 0;
  if (payload.filename && payload.filename.length > 0) count++;
  for (const part of payload.parts ?? []) {
    count += countAttachments(part);
  }
  return count;
}

// ── Google Calendar timezone ─────────────────────────────────

const CALENDAR_SETTINGS_API = "https://www.googleapis.com/calendar/v3/users/me/settings/timezone";

/**
 * Fetch the user's timezone from Google Calendar settings.
 * Returns an IANA timezone string (e.g. "Australia/Melbourne") or null on failure.
 */
export async function fetchCalendarTimezone(accessToken: string): Promise<string | null> {
  try {
    const resp = await fetch(CALENDAR_SETTINGS_API, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      console.warn(`[gmail-helpers] Calendar timezone fetch failed (${resp.status})`);
      return null;
    }
    const data = await resp.json();
    const tz = data.value as string | undefined;
    if (tz && tz.includes("/")) {
      console.log(`[gmail-helpers] Calendar timezone: ${tz}`);
      return tz;
    }
    return null;
  } catch (e) {
    console.warn("[gmail-helpers] Calendar timezone fetch error:", (e as Error).message);
    return null;
  }
}

// ── Raw email encoding (RFC 2822 compliant) ─────────────────

function plainTextToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");
}

function createRawEmail(
  to: string[],
  subject: string,
  body: string,
  cc?: string[],
  bcc?: string[],
): string {
  const htmlBody = body.includes("<br") || body.includes("<p") || body.includes("<div")
    ? body
    : plainTextToHtml(body);

  const headers: string[] = [
    "MIME-Version: 1.0",
    `To: ${to.join(", ")}`,
  ];
  if (cc?.length) headers.push(`Cc: ${cc.join(", ")}`);
  if (bcc?.length) headers.push(`Bcc: ${bcc.join(", ")}`);
  headers.push(`Subject: ${encodeMimeHeader(subject)}`);
  headers.push("Content-Type: text/html; charset=utf-8");
  headers.push("Content-Transfer-Encoding: base64");
  headers.push("");

  const bodyBase64 = btoa(unescape(encodeURIComponent(htmlBody)));
  headers.push(bodyBase64);

  return base64UrlEncode(headers.join("\r\n"));
}

function createRawReply(body: string): string {
  const htmlBody = body.includes("<br") || body.includes("<p") || body.includes("<div")
    ? body
    : plainTextToHtml(body);

  const headers: string[] = [
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
  ];

  const bodyBase64 = btoa(unescape(encodeURIComponent(htmlBody)));
  headers.push(bodyBase64);

  return base64UrlEncode(headers.join("\r\n"));
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${encoded}?=`;
}

function base64UrlEncode(str: string): string {
  const encoded = btoa(unescape(encodeURIComponent(str)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
