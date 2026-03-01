/**
 * SMS sender — MobileMessage API integration.
 *
 * Mirrors the iMessage bridge's message splitting and inter-message
 * delay logic so SMS conversations feel identical to iMessage ones.
 *
 * MobileMessage API: https://api.mobilemessage.com.au/
 */

const SMS_API_BASE = "https://api.mobilemessage.com.au";

const MAX_MESSAGE_LENGTH = 1530; // GSM-7 max (10 parts × 153)
const MIN_INTER_MSG_DELAY = 2.5;
const MAX_INTER_MSG_DELAY = 3.5;
const LONG_MSG_MIN_DELAY = 4.0;
const LONG_MSG_MAX_DELAY = 4.8;
const LONG_MSG_WORD_THRESHOLD = 18;

// ── Markdown Stripping ───────────────────────────────────────
// SMS does not render bold, italic, or any markdown formatting.
// Strip everything to plain text.

export function stripMarkdown(text: string): string {
  let out = text;
  out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  out = out.replace(/\*(.+?)\*/g, "$1");
  out = out.replace(/^#{1,4}\s+/gm, "");
  out = out.replace(/^- /gm, "• ");
  out = out.replace(/`(.+?)`/g, "$1");
  out = out.replace(/<!--.*?-->/gs, "");
  return out.trim();
}

// ── Message Splitting ────────────────────────────────────────
// Exact port of imessage.py _split_conversational logic.

const NEST_CONTENT_RE = /<nest-content>([\s\S]*?)<\/nest-content>/g;
const SEPARATOR_RE = /\n---\n|\n---$|^---\n|\s+---\s+|\s+---$|^---\s+/;

function splitByParagraphs(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split("\n\n")) {
    if (current && current.length + paragraph.length + 2 > MAX_MESSAGE_LENGTH) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, MAX_MESSAGE_LENGTH)];
}

export function splitConversational(text: string): string[] {
  type Segment = { text: string; isBlock: boolean };
  const segments: Segment[] = [];
  let lastEnd = 0;

  // Reset regex state
  NEST_CONTENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NEST_CONTENT_RE.exec(text)) !== null) {
    const before = text.slice(lastEnd, match.index).trim();
    if (before) segments.push({ text: before, isBlock: false });
    segments.push({ text: match[1].trim(), isBlock: true });
    lastEnd = match.index + match[0].length;
  }
  const trailing = text.slice(lastEnd).trim();
  if (trailing) segments.push({ text: trailing, isBlock: false });

  if (segments.length === 0) segments.push({ text, isBlock: false });

  const chunks: string[] = [];

  for (const seg of segments) {
    if (seg.isBlock) {
      if (seg.text.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(seg.text);
      } else {
        chunks.push(...splitByParagraphs(seg.text));
      }
      continue;
    }

    const hasSeparator = seg.text.includes("---");
    const parts = hasSeparator
      ? seg.text.split(SEPARATOR_RE)
      : seg.text.includes("\n")
        ? seg.text.split("\n")
        : [seg.text];

    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;
      if (part.length <= MAX_MESSAGE_LENGTH) {
        chunks.push(part);
      } else {
        chunks.push(...splitByParagraphs(part));
      }
    }
  }

  if (chunks.length === 0) return [text.trim().slice(0, MAX_MESSAGE_LENGTH)];
  return chunks;
}

// ── Delay Calculation ────────────────────────────────────────

function randomUniform(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function calculateDelay(chunk: string): number {
  const wordCount = chunk.split(/\s+/).length;
  if (wordCount > LONG_MSG_WORD_THRESHOLD) {
    return Math.max(LONG_MSG_MIN_DELAY, randomUniform(LONG_MSG_MIN_DELAY, LONG_MSG_MAX_DELAY));
  }
  return randomUniform(MIN_INTER_MSG_DELAY, MAX_INTER_MSG_DELAY);
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// ── MobileMessage API ────────────────────────────────────────

interface SendSmsResult {
  success: boolean;
  messageIds: string[];
  totalCost: number;
  errors: string[];
}

function buildAuthHeader(username: string, password: string): string {
  const encoded = btoa(`${username}:${password}`);
  return `Basic ${encoded}`;
}

// ── Concurrency Limiter ──────────────────────────────────────
// MobileMessage allows max 5 simultaneous requests per account.
// This semaphore ensures we never exceed that, even when multiple
// edge function invocations are sending SMS at the same time
// within the same isolate.

const MAX_CONCURRENT_REQUESTS = 4; // Leave 1 slot as headroom
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30000;

let _activeRequests = 0;
const _waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (_activeRequests < MAX_CONCURRENT_REQUESTS) {
    _activeRequests++;
    return;
  }
  await new Promise<void>((resolve) => {
    _waitQueue.push(resolve);
  });
  _activeRequests++;
}

function releaseSlot(): void {
  _activeRequests--;
  const next = _waitQueue.shift();
  if (next) next();
}

/**
 * Send a single SMS via MobileMessage API with retry + backoff.
 *
 * Retries on:
 *   - HTTP 429 (rate limit / too many concurrent requests)
 *   - HTTP 5xx (server errors)
 *   - Network failures
 *
 * Does NOT retry on:
 *   - HTTP 400/401/403 (bad request, auth, insufficient credits)
 *   - Successful response with per-message error (invalid number, etc.)
 */
async function sendSingleSms(
  to: string,
  message: string,
  sender: string,
  authHeader: string,
  customRef?: string,
): Promise<{ success: boolean; messageId?: string; cost?: number; error?: string }> {
  const payload: Record<string, unknown> = {
    enable_unicode: true,
    messages: [
      {
        to,
        message,
        sender,
        unicode: true,
        ...(customRef ? { custom_ref: customRef } : {}),
      },
    ],
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await acquireSlot();
    try {
      const resp = await fetch(`${SMS_API_BASE}/v1/messages`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Rate limited — retry with backoff
      if (resp.status === 429) {
        const bodyText = await resp.text().catch(() => "");
        const retryDelay = getRetryDelay(attempt);
        console.warn(
          `[sms] 429 rate limited (attempt ${attempt}/${MAX_RETRIES}), ` +
          `retrying in ${(retryDelay / 1000).toFixed(1)}s: ${bodyText.slice(0, 100)}`,
        );
        releaseSlot();
        await sleep(retryDelay / 1000);
        continue;
      }

      // Server error — retry with backoff
      if (resp.status >= 500) {
        const bodyText = await resp.text().catch(() => "");
        const retryDelay = getRetryDelay(attempt);
        console.warn(
          `[sms] ${resp.status} server error (attempt ${attempt}/${MAX_RETRIES}), ` +
          `retrying in ${(retryDelay / 1000).toFixed(1)}s: ${bodyText.slice(0, 100)}`,
        );
        releaseSlot();
        await sleep(retryDelay / 1000);
        continue;
      }

      // Client error — don't retry (bad request, auth failure, insufficient credits)
      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[sms] API error ${resp.status} (non-retryable): ${errText.slice(0, 300)}`);
        releaseSlot();
        return { success: false, error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` };
      }

      const data = await resp.json();
      const result = data.results?.[0];
      releaseSlot();

      if (result?.status === "success") {
        if (attempt > 1) {
          console.log(`[sms] Sent successfully on attempt ${attempt}`);
        }
        return {
          success: true,
          messageId: result.message_id,
          cost: result.cost ?? 0,
        };
      }

      // Per-message error (invalid number, unsubscribed, etc.) — don't retry
      const msgError = result?.status ?? "unknown error";
      console.error(`[sms] Message-level error (non-retryable): ${msgError}`);
      return { success: false, error: msgError };

    } catch (e) {
      releaseSlot();
      const msg = e instanceof Error ? e.message : "unknown";

      if (attempt < MAX_RETRIES) {
        const retryDelay = getRetryDelay(attempt);
        console.warn(
          `[sms] Network error (attempt ${attempt}/${MAX_RETRIES}), ` +
          `retrying in ${(retryDelay / 1000).toFixed(1)}s: ${msg}`,
        );
        await sleep(retryDelay / 1000);
        continue;
      }

      console.error(`[sms] Send failed after ${MAX_RETRIES} attempts: ${msg}`);
      return { success: false, error: msg };
    }
  }

  return { success: false, error: `Failed after ${MAX_RETRIES} attempts` };
}

/**
 * Exponential backoff with jitter.
 * attempt 1 → ~2s, attempt 2 → ~4s, attempt 3 → ~8s, attempt 4 → ~16s, capped at 30s.
 */
function getRetryDelay(attempt: number): number {
  const exponential = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, MAX_RETRY_DELAY_MS);
  const jitter = capped * (0.5 + Math.random() * 0.5);
  return jitter;
}

/**
 * Send a full response as SMS, splitting into multiple messages
 * with natural delays between them — identical to iMessage delivery.
 *
 * Each individual SMS send has retry logic with exponential backoff
 * for 429 rate limits and server errors. A concurrency semaphore
 * ensures we never exceed MobileMessage's 5-request limit.
 *
 * Returns the result with all message IDs and total cost.
 */
export async function sendSmsResponse(
  to: string,
  text: string,
  opts: {
    apiUsername: string;
    apiPassword: string;
    senderId: string;
    customRefPrefix?: string;
  },
): Promise<SendSmsResult> {
  const clean = stripMarkdown(text);
  if (!clean) {
    console.warn("[sms] Empty message after markdown stripping");
    return { success: false, messageIds: [], totalCost: 0, errors: ["empty message"] };
  }

  const chunks = splitConversational(clean);
  const authHeader = buildAuthHeader(opts.apiUsername, opts.apiPassword);

  console.log(`[sms] Sending ${chunks.length} message(s) to ${to} (${clean.length} chars total)`);

  const messageIds: string[] = [];
  let totalCost = 0;
  const errors: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const customRef = opts.customRefPrefix
      ? `${opts.customRefPrefix}-${i + 1}`
      : undefined;

    const result = await sendSingleSms(to, chunk, opts.senderId, authHeader, customRef);

    if (result.success) {
      if (result.messageId) messageIds.push(result.messageId);
      totalCost += result.cost ?? 0;
    } else {
      console.error(`[sms] Failed to send chunk ${i + 1}/${chunks.length}: ${result.error}`);
      errors.push(result.error ?? "unknown");
      return { success: false, messageIds, totalCost, errors };
    }

    // Natural delay between messages (same as iMessage bridge)
    if (chunks.length > 1 && i < chunks.length - 1) {
      const delay = calculateDelay(chunk);
      console.log(`[sms] Waiting ${delay.toFixed(1)}s before next message`);
      await sleep(delay);
    }
  }

  console.log(`[sms] Sent ${chunks.length} SMS to ${to} (cost: ${totalCost} credits)`);
  return { success: true, messageIds, totalCost, errors };
}

/**
 * Send a single short SMS immediately (no splitting, no delays).
 * Used for ack messages that need to go out fast while the agent
 * is still processing.
 */
export async function sendQuickSms(
  to: string,
  text: string,
  opts: {
    apiUsername: string;
    apiPassword: string;
    senderId: string;
    customRef?: string;
  },
): Promise<{ success: boolean; messageId?: string }> {
  const authHeader = buildAuthHeader(opts.apiUsername, opts.apiPassword);
  const result = await sendSingleSms(to, text, opts.senderId, authHeader, opts.customRef);
  return { success: result.success, messageId: result.messageId };
}

/**
 * Check MobileMessage account credit balance.
 */
export async function checkBalance(
  apiUsername: string,
  apiPassword: string,
): Promise<number | null> {
  try {
    const authHeader = buildAuthHeader(apiUsername, apiPassword);
    const resp = await fetch(`${SMS_API_BASE}/v1/account`, {
      method: "GET",
      headers: { Authorization: authHeader },
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.credit_balance ?? null;
  } catch {
    return null;
  }
}
