// Sentence-aware chunking — TypeScript port of SearchIngestionService.swift.
// Matches the exact algorithm: sentence splitting, configurable overlap,
// word-boundary fallback for oversized sentences.

export const MAX_CHUNK_CHARS = 2000;
export const CHUNK_OVERLAP_CHARS = 300;
export const MAX_CHUNKS_PER_SOURCE = 64;
export const MAX_SUMMARY_CHARS = 2000;
export const CHUNKING_VERSION = "v3";

// ── Sentence-aware chunking ──────────────────────────────────

export function sentenceAwareChunks(
  text: string,
  contextHeader: string,
  maxChars = MAX_CHUNK_CHARS,
  overlapChars = CHUNK_OVERLAP_CHARS,
): string[] {
  if (!text || text.trim().length === 0) return [];

  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current.join(" "));
        current = [];
        currentLen = 0;
      }
      chunks.push(...splitAtWordBoundary(trimmed, maxChars));
      continue;
    }

    if (currentLen + trimmed.length + 1 > maxChars && current.length > 0) {
      chunks.push(current.join(" "));

      // Carry overlap: last N sentences fitting within overlapChars
      const overlap: string[] = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        if (overlapLen + current[i].length + 1 > overlapChars) break;
        overlap.unshift(current[i]);
        overlapLen += current[i].length + 1;
      }
      current = [...overlap, trimmed];
      currentLen = overlap.reduce((sum, s) => sum + s.length + 1, 0) + trimmed.length;
    } else {
      current.push(trimmed);
      currentLen += trimmed.length + 1;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks.slice(0, MAX_CHUNKS_PER_SOURCE).map(
    (chunk) => `${contextHeader}\n---\n${chunk}`
  );
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace,
  // or on double newlines (paragraph boundaries)
  const parts = text.split(/(?<=[.!?])\s+|\n{2,}/);
  const result: string[] = [];
  for (const p of parts) {
    const trimmed = p.trim();
    if (trimmed) result.push(trimmed);
  }
  // If no splits found, try splitting by single newlines
  if (result.length <= 1 && text.includes("\n")) {
    return text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  }
  return result;
}

function splitAtWordBoundary(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      chunks.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ── Summary builders ─────────────────────────────────────────

export function buildNoteSummary(
  rawNotes: string,
  enhancedNotes: string | null,
): string {
  const combined = [rawNotes, enhancedNotes].filter(Boolean).join("\n\n");
  const lines = combined.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(0, 30).join("\n").slice(0, MAX_SUMMARY_CHARS);
}

export function buildEmailSummary(
  messages: Array<{ from: string; body: string; date: string }>,
): string {
  const last6 = messages.slice(-6);
  return last6
    .map((m) => `From: ${m.from} (${m.date})\n${m.body.slice(0, 300)}`)
    .join("\n\n")
    .slice(0, MAX_SUMMARY_CHARS);
}

export function buildCalendarSummary(event: {
  title: string;
  start: string;
  end: string;
  attendees: string;
}): string {
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const dateStr = startDate.toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
  const endStr = endDate.toLocaleTimeString("en-AU", {
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
  let summary = `${event.title}\n${dateStr} – ${endStr}`;
  if (event.attendees) summary += `\nAttendees: ${event.attendees}`;
  return summary;
}

// ── Content hash ─────────────────────────────────────────────

export function contentHash(
  sourceType: string,
  sourceId: string,
  type: "summary" | "chunk",
  index = 0,
): string {
  return `${CHUNKING_VERSION}:${sourceType}:${sourceId}:${type}${type === "chunk" ? `:${index}` : ""}`;
}

// ── Enriched context headers ─────────────────────────────────
// Richer than the basic Swift headers — includes more metadata
// for better embedding quality (free, no LLM cost).

export function noteContextHeader(
  title: string,
  noteType: string,
  attendees: string[],
  createdAt: string,
): string {
  const date = new Date(createdAt).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const parts = [`Note: ${title}`, `Type: ${noteType}`, `Date: ${date}`];
  if (attendees.length > 0) parts.push(`Attendees: ${attendees.join(", ")}`);
  return parts.join(" | ");
}

export function transcriptContextHeader(
  noteTitle: string,
  speakers: string[],
  createdAt: string,
): string {
  const date = new Date(createdAt).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const parts = [`Transcript: ${noteTitle}`, `Date: ${date}`];
  if (speakers.length > 0) parts.push(`Speakers: ${speakers.join(", ")}`);
  return parts.join(" | ");
}

export function emailContextHeader(
  subject: string,
  participants: string[],
  date: string,
): string {
  const dateStr = new Date(date).toLocaleDateString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const parts = [`Email Thread: ${subject}`, `Date: ${dateStr}`];
  if (participants.length > 0) {
    parts.push(`Participants: ${participants.slice(0, 6).join(", ")}`);
  }
  return parts.join(" | ");
}
