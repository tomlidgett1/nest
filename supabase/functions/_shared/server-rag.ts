// Server-side RAG pipeline — mirrors SearchQueryPipeline.swift.
// Called by v2-chat-service when no client-side evidence is provided (iMessage path).
//
// Performance optimisations:
//   - Casual message gate: "hey", "thanks" etc. skip the pipeline entirely (~0ms)
//   - Batch embeddings: all queries embedded in 1 API call instead of N (~500ms vs ~3s)
//   - Embedding cache: duplicate queries across phases are never re-embedded
//   - Planner runs concurrently with initial search (no added latency)
//
// Pipeline stages:
//   1. Casual message gate (instant skip for greetings/chat)
//   2. Query enrichment (coreference resolution from conversation history)
//   3. Sub-query generation (stop-word stripping, topic extraction)
//   4. Temporal resolution (today/tomorrow/this week/etc.)
//   5. LLM query planner + parallel initial search (concurrent)
//   6. Source-filtered search (driven by planner)
//   7. Deduplication by document_id
//   8. MMR diversity (0.3 penalty per same-source cluster)
//   9. Evidence block building + formatting
//  10. Agentic fallback (second retrieval round if evidence < 3)

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBatchEmbeddings, vectorString } from "./tools.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const MAX_EVIDENCE_BLOCKS = 12;
const MAX_EVIDENCE_CHARS = 1200;
const MIN_SEMANTIC_SCORE = 0.28;

// ── Source type display names (match Swift SearchSourceType.displayName) ──

const SOURCE_DISPLAY: Record<string, string> = {
  note_summary: "Notes",
  note_chunk: "Note Snippet",
  utterance_chunk: "Transcript",
  email_summary: "Email Summary",
  email_chunk: "Email Snippet",
  calendar_summary: "Calendar",
};

// ── Types ────────────────────────────────────────────────────

interface SearchResult {
  document_id: string;
  source_type: string;
  source_id: string;
  title: string;
  summary_text: string | null;
  chunk_text: string | null;
  metadata: any;
  semantic_score: number;
  lexical_score: number | null;
  fused_score: number;
}

interface QueryPlan {
  sources: string[];
  searchQueries: string[];
  rewrittenQuery: string | null;
  intent: string;
}

interface TemporalRange {
  start: string;
  end: string;
  label: string;
}

interface EvidenceBlock {
  sourceType: string;
  title: string;
  text: string;
  score: number;
  sourceId: string;
}

// ── Embedding Cache ──────────────────────────────────────────
// Avoids re-embedding the same query text within a single pipeline run.

class EmbeddingCache {
  private cache = new Map<string, number[]>();

  /** Embed all texts that aren't already cached in a single batch API call. */
  async ensureCached(texts: string[]): Promise<void> {
    const uncached = texts.filter((t) => !this.cache.has(t));
    if (uncached.length === 0) return;

    const embeddings = await getBatchEmbeddings(uncached);
    for (let i = 0; i < uncached.length; i++) {
      this.cache.set(uncached[i], embeddings[i]);
    }
  }

  get(text: string): number[] {
    const v = this.cache.get(text);
    if (!v) throw new Error(`Embedding not cached for: ${text.slice(0, 50)}`);
    return v;
  }

  has(text: string): boolean {
    return this.cache.has(text);
  }
}

// ── Casual Message Detection ─────────────────────────────────

const CASUAL_PATTERNS = new Set([
  "hey", "hi", "hello", "yo", "sup", "hiya", "g'day",
  "thanks", "thank you", "cheers", "ta", "thx",
  "ok", "okay", "k", "kk", "sure", "yep", "yup", "nah", "nope",
  "good morning", "good afternoon", "good evening", "good night",
  "gm", "gn", "morning", "night",
  "lol", "haha", "hahaha", "lmao", "nice", "cool", "great", "awesome",
  "bye", "cya", "see ya", "later", "ttyl",
  "yes", "no", "yeah", "nah",
  "how are you", "how's it going", "what's up", "whats up",
]);

function isCasualMessage(msg: string): boolean {
  const cleaned = msg.toLowerCase().replace(/[^\w\s']/g, "").trim();
  if (CASUAL_PATTERNS.has(cleaned)) return true;
  // Very short messages with no content words are likely casual
  if (cleaned.split(/\s+/).length <= 2 && cleaned.length <= 12) {
    // Check it doesn't contain a substantive keyword
    const hasSubstance = ["meeting", "email", "note", "search", "find",
      "draft", "schedule", "calendar", "transcript", "summary"].some(
      (k) => cleaned.includes(k)
    );
    if (!hasSubstance) return true;
  }
  return false;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Calendar-only retrieval — skips embedding, semantic search, and planner.
 * Direct DB query on metadata start/end dates. ~200ms.
 */
export async function calendarOnlyRAG(
  message: string,
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const start = Date.now();

  let temporalRange = resolveTemporalRange(message);

  // Default to upcoming 7 days if no temporal hint resolved
  if (!temporalRange) {
    const now = new Date();
    const localDateStr = now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const [y, m, d] = localDateStr.split("-").map(Number);
    const localTimeStr = now.toLocaleString("sv-SE", { timeZone: "Australia/Sydney" });
    const localParsed = new Date(localTimeStr + "Z");
    const offsetMs = localParsed.getTime() - now.getTime();
    const startOfToday = new Date(Date.UTC(y, m - 1, d) - offsetMs);
    temporalRange = {
      start: startOfToday.toISOString(),
      end: new Date(startOfToday.getTime() + 7 * 86400000).toISOString(),
      label: "upcoming 7 days",
    };
  }

  const results = await temporalCalendarSearch(temporalRange, supabase, userId);
  const evidence = buildEvidenceBlocks(results, MAX_EVIDENCE_BLOCKS);

  const elapsed = Date.now() - start;
  console.log(`[server-rag] Calendar-only RAG: ${evidence.length} events (${elapsed}ms)`);

  if (evidence.length === 0) {
    return `[NO_RESULTS] Calendar search returned NO events for ${temporalRange.label}.`;
  }
  return formatEvidence(evidence, temporalRange);
}

/**
 * Targeted retrieval — semantic search with orchestrator-provided queries
 * and source filters. Skips the LLM planner. ~1-3s.
 */
export async function targetedRAG(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient,
  searchQueries: string[],
  sourceFilters: string[] | null
): Promise<string> {
  const start = Date.now();
  const embedCache = new EmbeddingCache();

  // Enrich query with conversation context (pronoun resolution)
  const enrichedQuery = enrichQuery(message, recentChat);

  // Merge orchestrator queries with locally generated sub-queries
  const localQueries = generateSubQueries(enrichedQuery);
  const allQuerySet = new Set<string>();
  const queries: string[] = [];

  // Orchestrator queries first (higher quality), then local
  for (const q of [...searchQueries, ...localQueries]) {
    const key = q.toLowerCase().trim();
    if (key && !allQuerySet.has(key)) {
      allQuerySet.add(key);
      queries.push(q);
    }
  }
  // Ensure enriched query is included
  const enrichedKey = enrichedQuery.toLowerCase().trim();
  if (!allQuerySet.has(enrichedKey)) {
    queries.unshift(enrichedQuery);
  }

  // Cap at 5 queries to limit latency
  const cappedQueries = queries.slice(0, 5);

  // Batch embed all queries in one API call
  await embedCache.ensureCached(cappedQueries);

  // Parallel search with source filters
  const searchResults = await Promise.all(
    cappedQueries.map((q) =>
      searchWithCachedEmbedding(q, embedCache, supabase, userId, sourceFilters).catch(() => [])
    )
  );

  let allResults = searchResults.flat();

  // Also check calendar if there's a temporal signal
  const temporalRange = resolveTemporalRange(message);
  if (temporalRange) {
    const calendarResults = await temporalCalendarSearch(temporalRange, supabase, userId);
    allResults.push(...calendarResults);
  }

  // Dedup + MMR + build evidence (cap at 8 blocks for targeted — less input tokens)
  allResults = deduplicateResults(allResults);
  const TARGETED_MAX_BLOCKS = 8;
  const diverse = applyMMR(allResults, TARGETED_MAX_BLOCKS * 2);
  const evidence = buildEvidenceBlocks(diverse, TARGETED_MAX_BLOCKS);

  const elapsed = Date.now() - start;
  console.log(
    `[server-rag] Targeted RAG: ${evidence.length} blocks from ` +
    `${allResults.length} results, ${cappedQueries.length} queries (${elapsed}ms)`
  );

  if (evidence.length === 0) return "[NO_RESULTS]";
  return formatEvidence(evidence, temporalRange);
}

/**
 * Full pipeline RAG — the original 10-stage pipeline for complex queries.
 */
export async function serverSideRAG(
  message: string,
  recentChat: Array<{ role: string; content: string }>,
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const start = Date.now();

  // 1. Casual message gate — skip pipeline entirely for greetings/chat
  if (isCasualMessage(message)) {
    console.log(`[server-rag] Casual message detected, skipping pipeline (0ms)`);
    return "";
  }

  const embedCache = new EmbeddingCache();

  // 2. Query enrichment — resolve pronouns using conversation history
  const enrichedQuery = enrichQuery(message, recentChat);

  // 3. Sub-query generation (fast, local)
  const subQueries = generateSubQueries(enrichedQuery);

  // 4. Temporal resolution (fast, local)
  const temporalRange = resolveTemporalRange(message);

  // 5. Batch-embed all sub-queries in ONE API call + start planner concurrently
  const [, plan] = await Promise.all([
    embedCache.ensureCached(subQueries),
    planQuery(enrichedQuery),
  ]);

  // 6. Initial parallel search (embeddings already cached — just RPC calls)
  const initialResults = await parallelSearchCached(
    subQueries, embedCache, supabase, userId
  );

  let allResults = [...initialResults];

  // 6b. Temporal-aware calendar search — direct DB query when date range detected
  if (temporalRange) {
    const calendarResults = await temporalCalendarSearch(
      temporalRange, supabase, userId
    );
    if (calendarResults.length > 0) {
      console.log(`[server-rag] Temporal calendar search: ${calendarResults.length} events for ${temporalRange.label}`);
      allResults.push(...calendarResults);
    }
  }

  // 6c. "Next [event]" / "upcoming" — search upcoming 7 days if no temporal range matched
  const lower = message.toLowerCase();
  const wantsUpcoming = !temporalRange && (
    /\bnext\b/.test(lower) || /\bupcoming\b/.test(lower) ||
    /\bwhen\s+(is|are)\b/.test(lower) || /\bdo\s+i\s+have\b/.test(lower)
  );
  if (wantsUpcoming) {
    const now = new Date();
    const weekAhead: TemporalRange = {
      start: now.toISOString(),
      end: new Date(now.getTime() + 7 * 86400000).toISOString(),
      label: "next 7 days",
    };
    const upcomingResults = await temporalCalendarSearch(weekAhead, supabase, userId);
    if (upcomingResults.length > 0) {
      console.log(`[server-rag] Upcoming calendar search: ${upcomingResults.length} events`);
      allResults.push(...upcomingResults);
    }
  }

  // 7. Planner-driven source-filtered searches
  if (plan) {
    // Collect new queries from the planner that we haven't embedded yet
    const planQueries = collectPlannerQueries(plan, subQueries);
    if (planQueries.length > 0) {
      await embedCache.ensureCached(planQueries);
    }

    const plannerResults = await plannerDrivenSearchCached(
      plan, planQueries.length > 0 ? planQueries : subQueries, embedCache, supabase, userId
    );
    allResults.push(...plannerResults);
  } else {
    const fallbackResults = await keywordSourceSearchCached(
      message, subQueries, embedCache, supabase, userId
    );
    allResults.push(...fallbackResults);
  }

  // 8. Deduplicate
  allResults = deduplicateResults(allResults);

  // 9. MMR diversity
  const diverseResults = applyMMR(allResults, MAX_EVIDENCE_BLOCKS * 2);

  // 10. Build evidence blocks
  let evidence = buildEvidenceBlocks(diverseResults, MAX_EVIDENCE_BLOCKS);

  // 11. Agentic fallback — second round if evidence is thin
  if (evidence.length < 3 && enrichedQuery.length > 0) {
    const topicNouns = extractTopicNouns(enrichedQuery);
    const fallbackQuery = topicNouns.length > 0
      ? topicNouns.join(" ")
      : enrichedQuery;

    if (!embedCache.has(fallbackQuery)) {
      await embedCache.ensureCached([fallbackQuery]);
    }
    const fallbackResults = await searchWithCachedEmbedding(
      fallbackQuery, embedCache, supabase, userId
    );
    const fallbackEvidence = buildEvidenceBlocks(
      deduplicateResults(fallbackResults), MAX_EVIDENCE_BLOCKS
    );
    if (fallbackEvidence.length > evidence.length) {
      evidence = fallbackEvidence;
    }
  }

  const elapsed = Date.now() - start;

  if (evidence.length === 0) {
    console.log(`[server-rag] No evidence found (${elapsed}ms)`);
    return "[NO_RESULTS]";
  }

  const formatted = formatEvidence(evidence, temporalRange);
  console.log(
    `[server-rag] ${evidence.length} evidence blocks, ` +
    `${allResults.length} total results, ${elapsed}ms` +
    (plan ? ` (planner: ${plan.intent}, sources: ${plan.sources.join(",")})` : " (no planner)")
  );

  return formatted;
}

// ── 2. Query Enrichment ──────────────────────────────────────

function enrichQuery(
  query: string,
  history: Array<{ role: string; content: string }>
): string {
  const recent = history.slice(-6);
  if (recent.length === 0) return query;

  const pronouns = [
    "they", "their", "them", "he", "she", "his", "her",
    "it", "its", "that", "this", "those", "these",
  ];
  const lower = query.toLowerCase();
  const hasPronouns = pronouns.some((p) => {
    const re = new RegExp(`\\b${p}\\b`);
    return re.test(lower);
  });

  // Detect contextual follow-ups: short messages that implicitly reference
  // the previous conversation (e.g. "how can I prepare", "tell me more",
  // "what should I know", "any tips")
  const FOLLOW_UP_PATTERNS = [
    /\bprepare\b/i, /\bprep\b/i, /\bready\b/i,
    /\btell me more\b/i, /\bmore detail/i, /\bexpand\b/i,
    /\bwhat should i\b/i, /\bwhat do i need\b/i,
    /\bany tips\b/i, /\bany advice\b/i,
    /\bhelp me\b/i, /\bdig deeper\b/i,
    /\bwhat about\b/i, /\bwhat else\b/i,
    /\bgive me context\b/i, /\bbackground\b/i,
  ];
  const isFollowUp = hasPronouns || FOLLOW_UP_PATTERNS.some((p) => p.test(lower));

  if (isFollowUp) {
    const lastAssistant = [...recent]
      .reverse()
      .find((m) => m.role === "assistant");
    if (lastAssistant) {
      // Extract bold entities (names, titles) and event titles from the
      // assistant's response for targeted search
      const boldEntities = [...lastAssistant.content.matchAll(/\*\*([^*]+)\*\*/g)]
        .map((m) => m[1])
        .filter((e) => e.length > 2 && e.length < 60);

      const hint = lastAssistant.content.slice(0, 400);

      if (boldEntities.length > 0) {
        return `Context: ${hint}\nKey entities: ${boldEntities.join(", ")}\nQuery: ${query}`;
      }
      return `Context: ${hint}\nQuery: ${query}`;
    }
  }

  return query;
}

// ── 3. Sub-query Generation ──────────────────────────────────

const STOP_WORDS = new Set([
  "what", "when", "where", "who", "how", "why",
  "did", "does", "do", "the", "a", "an",
  "is", "was", "were", "are", "been", "be",
  "about", "from", "with", "for", "of", "in", "on", "at", "to",
  "can", "could", "would", "should", "will",
  "you", "me", "my", "i", "we", "our",
  "tell", "show", "give", "find", "get", "list", "summarise", "summarize", "explain",
  "please", "any", "some", "that", "this", "those", "these", "it", "its",
]);

const TEMPORAL_WORDS = new Set([
  "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", "evening",
  "last", "next", "recent", "latest", "upcoming", "past",
  "week", "month", "year",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
]);

function generateSubQueries(query: string): string[] {
  const queries: string[] = [query];
  const words = query.split(/\s+/);

  const keywords = words.filter((w) => {
    const lower = w.toLowerCase().replace(/[^\w]/g, "");
    return !STOP_WORDS.has(lower) && !TEMPORAL_WORDS.has(lower) && lower.length > 1;
  });

  if (keywords.length >= 2) {
    queries.push(keywords.join(" "));
  }

  const topicWords = [...keywords].sort((a, b) => b.length - a.length).slice(0, 3);
  if (topicWords.length > 0) {
    const primary = topicWords[0];
    if (primary.toLowerCase() !== keywords.join(" ").toLowerCase()) {
      queries.push(primary);
      if (topicWords.length >= 2) {
        queries.push(topicWords.join(" "));
      }
    }
  }

  const seen = new Set<string>();
  return queries.filter((q) => {
    const key = q.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── LLM Query Planner ───────────────────────────────────────

async function planQuery(query: string): Promise<QueryPlan | null> {
  try {
    const prompt = `You are a query planning agent for a personal productivity app. The user has notes, meeting transcripts, emails, and calendar events indexed.

Given the user's question, produce a JSON object with these fields:
- "sources": array of data types to search. Values: "notes", "transcripts", "emails", "calendar". Use "notes" for meeting notes/summaries, "transcripts" for spoken words from meetings, "emails" for email threads, "calendar" for calendar events/invites. Include ALL relevant types. For meeting-related queries, ALWAYS include both "notes" and "transcripts". If the user mentions a person by name, also include "emails" (to find threads with that person).
- "search_queries": array of 2-3 short, precise search queries (3-8 words each) optimised for embedding similarity. Strip filler words, temporal references, and question syntax. Focus on topic nouns, entities, and proper nouns.
- "rewritten_query": a single best search query (3-8 words) for the core topic.
- "intent": one of "find", "summarise", "draft", "schedule", "compare", "list", "explain".

Return ONLY valid JSON, no markdown, no explanation.

User question: ${query}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 250,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.warn(`[server-rag] Planner API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return parseQueryPlan(text);
  } catch (e) {
    console.warn("[server-rag] Planner failed:", e);
    return null;
  }
}

function parseQueryPlan(raw: string): QueryPlan | null {
  try {
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const json = JSON.parse(cleaned);
    const sources: string[] = json.sources ?? ["all"];
    const searchQueries: string[] = (json.search_queries ?? []).slice(0, 3);
    const rewrittenQuery: string | null = json.rewritten_query ?? null;
    const intent: string = json.intent ?? "find";
    if (sources.length === 0) return null;
    return { sources, searchQueries, rewrittenQuery, intent };
  } catch {
    console.warn("[server-rag] Could not parse query plan:", raw.slice(0, 200));
    return null;
  }
}

// ── Temporal Resolution ──────────────────────────────────────

function resolveTemporalRange(query: string): TemporalRange | null {
  const lower = query.toLowerCase();
  const now = new Date();

  // Get today's date string in user's timezone (Australia/Sydney)
  const localDateStr = now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [y, m, d] = localDateStr.split("-").map(Number);

  // Compute midnight in user's timezone as UTC
  // Australia/Sydney is UTC+11 (AEDT) or UTC+10 (AEST)
  // We find the offset by comparing local time string to UTC
  const localTimeStr = now.toLocaleString("sv-SE", { timeZone: "Australia/Sydney" });
  const localParsed = new Date(localTimeStr + "Z"); // treat local time as if UTC
  const offsetMs = localParsed.getTime() - now.getTime();

  // Midnight local in UTC = midnight UTC of local date minus the offset
  const startOfToday = new Date(Date.UTC(y, m - 1, d) - offsetMs);
  const addDays = (base: Date, n: number) => new Date(base.getTime() + n * 86400000);

  if (lower.includes("today") || lower.includes("today's")) {
    return { start: startOfToday.toISOString(), end: addDays(startOfToday, 1).toISOString(), label: "today" };
  }
  if (lower.includes("tomorrow") || lower.includes("tomorrow's")) {
    return { start: addDays(startOfToday, 1).toISOString(), end: addDays(startOfToday, 2).toISOString(), label: "tomorrow" };
  }
  if (lower.includes("yesterday") || lower.includes("yesterday's")) {
    return { start: addDays(startOfToday, -1).toISOString(), end: startOfToday.toISOString(), label: "yesterday" };
  }
  if (lower.includes("this week") || lower.includes("this week's")) {
    // Use local day of week (startOfToday is already midnight local in UTC)
    const localDayOfWeek = new Date(startOfToday.getTime() + offsetMs).getDay();
    const daysFromMon = (localDayOfWeek + 6) % 7;
    const weekStart = addDays(startOfToday, -daysFromMon);
    return { start: weekStart.toISOString(), end: addDays(weekStart, 7).toISOString(), label: "this week" };
  }
  if (lower.includes("next week") || lower.includes("next week's")) {
    const localDayOfWeek = new Date(startOfToday.getTime() + offsetMs).getDay();
    const daysFromMon = (localDayOfWeek + 6) % 7;
    const thisWeekStart = addDays(startOfToday, -daysFromMon);
    const nextWeekStart = addDays(thisWeekStart, 7);
    return { start: nextWeekStart.toISOString(), end: addDays(nextWeekStart, 7).toISOString(), label: "next week" };
  }
  if (lower.includes("last week") || lower.includes("last week's")) {
    const localDayOfWeek = new Date(startOfToday.getTime() + offsetMs).getDay();
    const daysFromMon = (localDayOfWeek + 6) % 7;
    const thisWeekStart = addDays(startOfToday, -daysFromMon);
    const lastWeekStart = addDays(thisWeekStart, -7);
    return { start: lastWeekStart.toISOString(), end: thisWeekStart.toISOString(), label: "last week" };
  }
  if (lower.includes("this month") || lower.includes("this month's")) {
    const monthStartLocal = new Date(Date.UTC(y, m - 1, 1) - offsetMs);
    const monthEndLocal = new Date(Date.UTC(y, m, 1) - offsetMs);
    return { start: monthStartLocal.toISOString(), end: monthEndLocal.toISOString(), label: "this month" };
  }
  if (lower.includes("last month") || lower.includes("last month's")) {
    const thisMonthStart = new Date(Date.UTC(y, m - 1, 1) - offsetMs);
    const lastMonthStart = new Date(Date.UTC(y, m - 2, 1) - offsetMs);
    return { start: lastMonthStart.toISOString(), end: thisMonthStart.toISOString(), label: "last month" };
  }

  const weekdays: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  for (const [name, target] of Object.entries(weekdays)) {
    if (lower.includes(name) || lower.includes(name + "'s")) {
      const localDayOfWeek = new Date(startOfToday.getTime() + offsetMs).getDay();
      let daysBack = localDayOfWeek - target;
      if (daysBack <= 0) daysBack += 7;
      const dayStart = addDays(startOfToday, -daysBack);
      return { start: dayStart.toISOString(), end: addDays(dayStart, 1).toISOString(), label: name };
    }
  }

  return null;
}

// ── Temporal Calendar Search ─────────────────────────────────
// Queries calendar events directly by metadata start/end dates.

async function temporalCalendarSearch(
  range: TemporalRange,
  supabase: SupabaseClient,
  userId: string
): Promise<SearchResult[]> {
  try {
    console.log(`[server-rag] Temporal calendar search: ${range.label} [${range.start} → ${range.end}]`);

    const { data, error } = await supabase
      .from("search_documents")
      .select("id, source_type, source_id, title, summary_text, chunk_text, metadata")
      .eq("user_id", userId)
      .eq("source_type", "calendar_summary")
      .eq("is_deleted", false)
      .filter("metadata->>start", "gte", range.start)
      .filter("metadata->>start", "lt", range.end)
      .order("metadata->>start" as any, { ascending: true })
      .limit(20);

    if (error) {
      console.warn("[server-rag] temporal calendar query error:", error.message);
      return [];
    }

    console.log(`[server-rag] Temporal calendar raw results: ${(data ?? []).length}`);

    // Deduplicate by event_id (same event may be indexed multiple times)
    const seen = new Set<string>();
    const unique = (data ?? []).filter((d: any) => {
      const eventId = d.metadata?.event_id;
      if (eventId && seen.has(eventId)) return false;
      if (eventId) seen.add(eventId);
      return true;
    });

    const nowMs = Date.now();

    return unique.map((d: any) => {
      const startDate = d.metadata?.start
        ? new Date(d.metadata.start).toLocaleDateString("en-AU", {
            weekday: "short", day: "numeric", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney",
          })
        : "";
      const attendees = d.metadata?.attendees || "";

      // Tag events as PAST or UPCOMING relative to right now
      let timeTag = "";
      if (d.metadata?.start) {
        const eventStart = new Date(d.metadata.start).getTime();
        const eventEnd = d.metadata?.end ? new Date(d.metadata.end).getTime() : eventStart + 3600000;
        if (eventEnd < nowMs) {
          timeTag = "[ALREADY HAPPENED] ";
        } else if (eventStart <= nowMs && eventEnd >= nowMs) {
          timeTag = "[HAPPENING NOW] ";
        } else {
          timeTag = "[UPCOMING] ";
        }
      }

      const enrichedSummary = startDate
        ? `${timeTag}${d.summary_text || d.title}\nDate: ${startDate}${attendees ? `\nAttendees: ${attendees}` : ""}`
        : (d.summary_text || d.title || "");

      return {
        document_id: d.id,
        source_type: d.source_type,
        source_id: d.source_id || "",
        title: d.title || "",
        summary_text: enrichedSummary,
        chunk_text: d.chunk_text,
        metadata: d.metadata,
        semantic_score: 0.95,
        lexical_score: null,
        fused_score: 0.95,
      } as SearchResult;
    });
  } catch (e) {
    console.warn("[server-rag] temporal calendar search failed:", e);
    return [];
  }
}

// ── Cached Search Functions ──────────────────────────────────
// These use pre-cached embeddings — the only network call is the Supabase RPC.

async function searchWithCachedEmbedding(
  queryText: string,
  cache: EmbeddingCache,
  supabase: SupabaseClient,
  userId: string,
  sourceFilters?: string[] | null,
  matchCount = 15
): Promise<SearchResult[]> {
  const embedding = cache.get(queryText);
  const embStr = vectorString(embedding);

  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: queryText,
    query_embedding: embStr,
    match_count: matchCount,
    source_filters: sourceFilters ?? null,
    min_semantic_score: MIN_SEMANTIC_SCORE,
    p_user_id: userId,
  });

  if (error) {
    console.warn("[server-rag] hybrid_search error, trying fallback:", error.message);
    const fallback = await supabase.rpc("match_search_documents", {
      query_embedding: embStr,
      match_count: matchCount,
      source_filters: sourceFilters ?? null,
      min_score: MIN_SEMANTIC_SCORE,
      p_user_id: userId,
    });
    if (fallback.error) {
      console.error("[server-rag] fallback search error:", fallback.error.message);
      return [];
    }
    return (fallback.data ?? []).map((d: any) => ({
      ...d,
      fused_score: d.semantic_score ?? 0,
      lexical_score: null,
    }));
  }

  return data ?? [];
}

async function parallelSearchCached(
  queries: string[],
  cache: EmbeddingCache,
  supabase: SupabaseClient,
  userId: string
): Promise<SearchResult[]> {
  const results = await Promise.all(
    queries.map((q) =>
      searchWithCachedEmbedding(q, cache, supabase, userId).catch(() => [])
    )
  );
  return results.flat();
}

// ── Planner-driven Search ────────────────────────────────────

function buildSourceFilters(plan: QueryPlan): string[][] {
  const wantsNotes = plan.sources.includes("notes") || plan.sources.includes("meetings");
  const wantsTranscripts = plan.sources.includes("transcripts");
  const wantsEmails = plan.sources.includes("emails");
  const wantsCalendar = plan.sources.includes("calendar");
  const wantsAll = plan.sources.includes("all");

  if (wantsAll) return [];

  const filterSets: string[][] = [];
  if (wantsNotes || wantsTranscripts) {
    filterSets.push(["note_summary", "note_chunk", "utterance_chunk"]);
  }
  if (wantsEmails) {
    filterSets.push(["email_summary", "email_chunk"]);
  }
  if (wantsCalendar) {
    filterSets.push(["calendar_summary"]);
  }
  return filterSets;
}

/** Collect unique new queries from the planner that weren't in subQueries. */
function collectPlannerQueries(plan: QueryPlan, subQueries: string[]): string[] {
  const existing = new Set(subQueries.map((q) => q.toLowerCase().trim()));
  const newQueries: string[] = [];
  const seen = new Set<string>();

  const candidates = [...plan.searchQueries];
  if (plan.rewrittenQuery) candidates.push(plan.rewrittenQuery);

  for (const q of candidates) {
    const key = q.toLowerCase().trim();
    if (!existing.has(key) && !seen.has(key)) {
      newQueries.push(q);
      seen.add(key);
    }
  }

  return newQueries;
}

async function plannerDrivenSearchCached(
  plan: QueryPlan,
  queriesToUse: string[],
  cache: EmbeddingCache,
  supabase: SupabaseClient,
  userId: string
): Promise<SearchResult[]> {
  const filterSets = buildSourceFilters(plan);
  const promises: Promise<SearchResult[]>[] = [];

  // Source-filtered searches — cap at 6 total searches to limit latency
  let searchCount = 0;
  const MAX_PLANNER_SEARCHES = 6;

  for (const filters of filterSets) {
    for (const q of queriesToUse) {
      if (searchCount >= MAX_PLANNER_SEARCHES) break;
      if (cache.has(q)) {
        promises.push(
          searchWithCachedEmbedding(q, cache, supabase, userId, filters).catch(() => [])
        );
        searchCount++;
      }
    }
  }

  // Unfiltered search with rewritten query (if cached)
  if (plan.rewrittenQuery && cache.has(plan.rewrittenQuery) && searchCount < MAX_PLANNER_SEARCHES) {
    promises.push(
      searchWithCachedEmbedding(plan.rewrittenQuery, cache, supabase, userId).catch(() => [])
    );
  }

  const results = await Promise.all(promises);
  return results.flat();
}

async function keywordSourceSearchCached(
  query: string,
  subQueries: string[],
  cache: EmbeddingCache,
  supabase: SupabaseClient,
  userId: string
): Promise<SearchResult[]> {
  const lower = query.toLowerCase();
  const noteKeywords = ["meeting", "meetings", "note", "notes", "transcript",
    "discussed", "call", "standup", "sync", "recap"];
  const emailKeywords = ["email", "emails", "inbox", "thread", "replied", "wrote"];

  const wantsNotes = noteKeywords.some((k) => lower.includes(k));
  const wantsEmails = emailKeywords.some((k) => lower.includes(k));

  const promises: Promise<SearchResult[]>[] = [];

  if (wantsNotes) {
    const filters = ["note_summary", "note_chunk", "utterance_chunk"];
    for (const q of subQueries) {
      if (cache.has(q)) {
        promises.push(
          searchWithCachedEmbedding(q, cache, supabase, userId, filters).catch(() => [])
        );
      }
    }
  }
  if (wantsEmails) {
    const filters = ["email_summary", "email_chunk"];
    for (const q of subQueries) {
      if (cache.has(q)) {
        promises.push(
          searchWithCachedEmbedding(q, cache, supabase, userId, filters).catch(() => [])
        );
      }
    }
  }

  const results = await Promise.all(promises);
  return results.flat();
}

// ── Deduplication ────────────────────────────────────────────

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results
    .filter((r) => {
      const id = r.document_id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => (b.fused_score ?? 0) - (a.fused_score ?? 0));
}

// ── MMR Diversity ────────────────────────────────────────────

function applyMMR(results: SearchResult[], maxResults: number): SearchResult[] {
  if (results.length <= maxResults) return results;

  const selected: SearchResult[] = [];
  const sourceCount: Record<string, number> = {};
  const DIVERSITY_PENALTY = 0.3;

  const sorted = [...results].sort((a, b) => (b.fused_score ?? 0) - (a.fused_score ?? 0));

  for (const candidate of sorted) {
    if (selected.length >= maxResults) break;

    const sourceKey = `${candidate.source_type}::${candidate.source_id}`;
    const count = sourceCount[sourceKey] ?? 0;

    if (count < 3) {
      const penalty = count * DIVERSITY_PENALTY;
      const adjustedScore = (candidate.fused_score ?? 0) * (1.0 - penalty);
      if (adjustedScore > 0 || selected.length < 4) {
        selected.push(candidate);
        sourceCount[sourceKey] = count + 1;
      }
    }
  }

  return selected;
}

// ── Evidence Block Building ──────────────────────────────────

function buildEvidenceBlocks(results: SearchResult[], max: number): EvidenceBlock[] {
  const blocks: EvidenceBlock[] = [];

  for (const r of results.slice(0, max)) {
    let body = (r.chunk_text ?? r.summary_text ?? "").trim();
    if (!body) continue;

    if (r.source_type === "calendar_summary" && r.metadata?.start) {
      try {
        const startDate = new Date(r.metadata.start);
        const nowMs = Date.now();
        const eventEnd = r.metadata?.end ? new Date(r.metadata.end).getTime() : startDate.getTime() + 3600000;
        let timeTag = "";
        if (eventEnd < nowMs) {
          timeTag = "[ALREADY HAPPENED] ";
        } else if (startDate.getTime() <= nowMs && eventEnd >= nowMs) {
          timeTag = "[HAPPENING NOW] ";
        } else {
          timeTag = "[UPCOMING] ";
        }

        const dateLabel = startDate.toLocaleDateString("en-AU", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
          timeZone: "Australia/Sydney",
        });
        const timeLabel = startDate.toLocaleTimeString("en-AU", {
          hour: "2-digit", minute: "2-digit", hour12: true,
          timeZone: "Australia/Sydney",
        });
        const attendees = r.metadata?.attendees || "";
        body = `${timeTag}${r.title || "Event"} — ${dateLabel} at ${timeLabel}`;
        if (attendees) body += `\nAttendees: ${attendees}`;
        const summary = (r.summary_text || "").trim();
        if (summary && !summary.startsWith(r.title || "###")) {
          body += `\n${summary}`;
        }
      } catch {
        // Keep original body if date parsing fails
      }
    }

    blocks.push({
      sourceType: SOURCE_DISPLAY[r.source_type] ?? r.source_type,
      title: r.title ?? SOURCE_DISPLAY[r.source_type] ?? r.source_type,
      text: body.slice(0, MAX_EVIDENCE_CHARS),
      score: r.semantic_score ?? r.fused_score ?? 0,
      sourceId: r.source_id ?? "",
    });
  }

  return blocks;
}

// ── Format Evidence String ───────────────────────────────────

function formatEvidence(
  evidence: EvidenceBlock[],
  temporalRange: TemporalRange | null
): string {
  const now = new Date();
  const currentTime = now.toLocaleString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Australia/Sydney",
  });
  const parts: string[] = [
    `Current time: ${currentTime} (AEDT)\n`,
    "Cited context (from semantic search, ordered by relevance):\n",
  ];

  for (let i = 0; i < evidence.length; i++) {
    const e = evidence[i];
    const pct = `${Math.round(e.score * 100)}%`;
    parts.push(
      `[${i + 1}] ${e.title} — Relevance: ${pct}\n` +
      `Source: ${e.sourceType} | ID: ${e.sourceId}\n` +
      `Details: ${e.text}\n`
    );
  }

  if (temporalRange) {
    parts.push(`\nTemporal context: ${temporalRange.label}`);
  }

  return parts.join("\n");
}

// ── Topic Noun Extraction (for agentic fallback) ─────────────

const FALLBACK_STOP_WORDS = new Set([
  ...STOP_WORDS,
  ...TEMPORAL_WORDS,
  "key", "highlights", "details", "related",
]);

function extractTopicNouns(query: string): string[] {
  return query
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^\w]/g, ""))
    .filter((w) => !FALLBACK_STOP_WORDS.has(w) && w.length > 1);
}
