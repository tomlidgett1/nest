// Memory service — rolling conversation summary + self-learning layers.
//
// Strategy: 70 raw messages for immediate context + a rolling summary
// that captures everything before that. The summary is updated every
// 4 new messages using a cheap GPT-4.1-mini call (~$0.0006 each).
// This aggressive cadence ensures nothing falls through the gap between
// raw history scrolling off and the summary capturing it.
//
// Self-learning layers:
//   Layer 1: Learned facts — extracted during summarisation, persisted to v2_user_learnings
//   Layer 2: Relationship memory — relationship_notes + key_moments on v2_user_memory
//   Layer 3: Identity model — deep psychological profile, updated every ~100 messages

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IdentityModel } from "./personality-agent.ts";
import { logApiUsage } from "./cost-tracker.ts";
import { embedLearning, embedNarrativeThreads } from "./conversation-embedder.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const SUMMARY_INTERVAL = 4;
const IDENTITY_UPDATE_INTERVAL = 100;

export interface OpenLoop {
  topic: string;
  firstMentioned: string;
  lastMentioned: string;
  status: "open" | "resolved" | "stale";
  context: string;
}

export interface KeyMoment {
  moment: string;
  when: string;
  emotional_tone: string;
  callback_potential: string;
}

export interface UserMemory {
  summary: string;
  writingStyle: string | null;
  preferences: Record<string, any>;
  messageCountAtSummary: number;
  openLoops: OpenLoop[];
  emotionalArc: string | null;
  relationshipNotes: string | null;
  keyMoments: KeyMoment[];
  identityModel: IdentityModel | null;
  recallPitchStatus: string | null;
}

export async function getUserMemory(
  userId: string,
  supabase: SupabaseClient,
): Promise<UserMemory | null> {
  const { data, error } = await supabase
    .from("v2_user_memory")
    .select("summary, writing_style, preferences, message_count_at_summary, open_loops, emotional_arc, relationship_notes, key_moments, identity_model, recall_pitch_status")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    summary: data.summary,
    writingStyle: data.writing_style,
    preferences: data.preferences ?? {},
    messageCountAtSummary: data.message_count_at_summary ?? 0,
    openLoops: (data.open_loops as OpenLoop[]) ?? [],
    emotionalArc: data.emotional_arc ?? null,
    relationshipNotes: data.relationship_notes ?? null,
    keyMoments: (data.key_moments as KeyMoment[]) ?? [],
    identityModel: (data.identity_model as IdentityModel) ?? null,
    recallPitchStatus: data.recall_pitch_status ?? null,
  };
}

export async function updateMemory(
  userId: string,
  totalMessageCount: number,
  recentMessages: Array<{ role: string; content: string }>,
  supabase: SupabaseClient,
): Promise<void> {
  const existing = await getUserMemory(userId, supabase);
  const lastSummarisedAt = existing?.messageCountAtSummary ?? 0;

  if (totalMessageCount - lastSummarisedAt < SUMMARY_INTERVAL) {
    return;
  }

  // Fetch the messages that haven't been summarised yet (between
  // last summary and now), plus a small overlap for continuity.
  const unsummarisedCount = totalMessageCount - lastSummarisedAt;
  const fetchCount = Math.min(unsummarisedCount + 6, 30);

  const { data: rawMessages } = await supabase
    .from("v2_chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(fetchCount);

  const messages = (rawMessages ?? [])
    .filter((m: any) => m.content && m.content.trim().length > 0)
    .reverse();

  if (messages.length === 0) return;

  const newSummary = await summariseConversation(
    messages,
    existing?.summary,
    existing?.writingStyle,
    existing?.openLoops,
    existing?.emotionalArc,
    existing?.relationshipNotes,
    existing?.keyMoments,
    userId,
    supabase,
  );
  if (!newSummary) return;

  const { error } = await supabase
    .from("v2_user_memory")
    .upsert(
      {
        user_id: userId,
        summary: newSummary.summary,
        writing_style: newSummary.writingStyle,
        preferences: newSummary.preferences,
        open_loops: newSummary.openLoops,
        emotional_arc: newSummary.emotionalArc,
        relationship_notes: newSummary.relationshipNotes,
        key_moments: newSummary.keyMoments,
        message_count_at_summary: totalMessageCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[memory-service] Failed to save memory:", error.message);
  } else {
    console.log(`[memory-service] Updated rolling summary for user ${userId} at message ${totalMessageCount}`);
  }

  // Save extracted learnings to v2_user_learnings (Layer 1)
  if (newSummary.learnedFacts && newSummary.learnedFacts.length > 0) {
    await saveExtractedLearnings(userId, newSummary.learnedFacts, supabase);
  }

  // Embed narrative threads from open_loops (Layer 3 of memory search)
  if (newSummary.openLoops && newSummary.openLoops.length > 0) {
    embedNarrativeThreads(supabase, userId, newSummary.openLoops, existing?.openLoops ?? null).catch(e =>
      console.error("[memory-service] Narrative thread embedding failed:", (e as Error).message),
    );
  }

  // Identity model update (Layer 3) — every ~100 messages
  if (totalMessageCount % IDENTITY_UPDATE_INTERVAL < SUMMARY_INTERVAL) {
    console.log(`[memory-service] Triggering identity model update at message ${totalMessageCount}`);
    updateIdentityModel(userId, supabase, newSummary, existing?.identityModel).catch(e =>
      console.error("[memory-service] Identity model update failed:", (e as Error).message),
    );
  }
}

// ── Summarisation ────────────────────────────────────────────

interface ExtractedLearning {
  category: string;
  content: string;
  context: string;
  emotional_weight: string;
  confidence: number;
}

interface SummaryResult {
  summary: string;
  writingStyle: string;
  preferences: Record<string, any>;
  openLoops: OpenLoop[];
  emotionalArc: string;
  relationshipNotes: string;
  keyMoments: KeyMoment[];
  learnedFacts: ExtractedLearning[];
}

async function summariseConversation(
  messages: Array<{ role: string; content: string }>,
  existingSummary?: string | null,
  existingWritingStyle?: string | null,
  existingOpenLoops?: OpenLoop[] | null,
  existingEmotionalArc?: string | null,
  existingRelationshipNotes?: string | null,
  existingKeyMoments?: KeyMoment[] | null,
  userId?: string,
  supabase?: SupabaseClient,
): Promise<SummaryResult | null> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
    .join("\n");

  const openLoopsContext = existingOpenLoops && existingOpenLoops.length > 0
    ? `\nEXISTING OPEN LOOPS (carry forward, update status as needed):\n${JSON.stringify(existingOpenLoops)}\n`
    : "";

  const emotionalArcContext = existingEmotionalArc
    ? `\nEXISTING EMOTIONAL ARC:\n${existingEmotionalArc}\n`
    : "";

  const relationshipContext = existingRelationshipNotes
    ? `\nEXISTING RELATIONSHIP NOTES (evolve these, don't restart):\n${existingRelationshipNotes}\n`
    : "";

  const keyMomentsContext = existingKeyMoments && existingKeyMoments.length > 0
    ? `\nEXISTING KEY MOMENTS (carry forward, add new standout moments):\n${JSON.stringify(existingKeyMoments)}\n`
    : "";

  const systemPrompt = `You are a memory system for an AI assistant called Nest. Your job is to maintain a rolling summary AND extract relationship intelligence from the conversation.

${existingSummary ? `EXISTING SUMMARY (update and extend this, never discard information unless it's clearly outdated):\n${existingSummary}\n` : "No existing summary yet. Create one from scratch."}
${existingWritingStyle ? `EXISTING WRITING STYLE NOTES:\n${existingWritingStyle}\n` : ""}${openLoopsContext}${emotionalArcContext}${relationshipContext}${keyMomentsContext}

You will receive the latest batch of messages. Merge them into the existing summary AND extract learnings.

Produce a JSON object with exactly these fields:
{
  "summary": "A rolling summary covering the ENTIRE conversation history. Include: key facts about the user (name, job, company, interests), important decisions, tasks completed, tasks pending, ongoing threads, personal details shared, and anything Nest should remember. Keep under 600 words. Be specific with names, dates, and details. Never lose information from the existing summary unless it's been superseded.",
  "writing_style": "A CONCRETE, SPECIFIC description of the user's iMessage texting style. Include ALL of these dimensions: (1) average message length in words, (2) capitalisation (all lowercase / sentence case / mixed), (3) punctuation habits (periods? commas? question marks? none?), (4) emoji usage (never / rare / frequent), (5) abbreviations or slang they use (list specific ones), (6) greeting patterns (hey / hi / nothing / yo), (7) sign-off patterns, (8) formality level (1-5 scale, 1=very casual, 5=formal), (9) typical response they seem to prefer from Nest (short punchy vs detailed). Example: 'avg 8 words, all lowercase, no periods, no emoji, uses abbreviations (u, ur, tbh), greets with hey or nothing, formality 2/5, prefers short punchy responses'",
  "preferences": {
    "communication_style": "how they prefer info delivered",
    "topics_of_interest": ["recurring topics"],
    "noted_preferences": ["explicit preferences stated"],
    "key_contacts": ["names/emails mentioned frequently"]
  },
  "open_loops": [
    {
      "topic": "short description of the unresolved topic",
      "firstMentioned": "ISO date when first mentioned (carry forward from existing)",
      "lastMentioned": "ISO date of most recent mention",
      "status": "open | resolved | stale",
      "context": "3-5 sentences telling the full story across sessions: when/why this first came up, how it has evolved, key decisions or changes, and how the user feels about it now. This narrative should connect the dots across multiple conversations so someone reading it later can understand the full arc."
    }
  ],
  "emotional_arc": "1-2 sentences describing how the user's overall mood and energy has shifted across recent conversations.",
  "relationship_notes": "2-4 sentences about the current state of the Nest-user relationship. How comfortable are they with Nest? What's the vibe? Are they opening up more? Do they trust Nest? Any recurring dynamics (e.g. they test Nest, they joke with Nest, they're all business)? How has the relationship evolved?",
  "key_moments": [
    {
      "moment": "Brief description of a memorable interaction",
      "when": "approximate date (YYYY-MM-DD)",
      "emotional_tone": "how the user felt (e.g. relieved, impressed, frustrated, amused)",
      "callback_potential": "high | medium | low"
    }
  ],
  "learned_facts": [
    {
      "category": "preference | correction | fact | dislike | contact_note | anticipation",
      "content": "What was learned — be specific and concise",
      "context": "Brief context for why this matters or when it came up",
      "emotional_weight": "high | medium | low",
      "confidence": 0.5-1.0
    }
  ]
}

OPEN LOOPS RULES:
- Track things the user mentioned but haven't resolved: life decisions ("thinking about switching jobs"), pending tasks ("need to sort that invoice"), plans ("might go to Tokyo in March"), ongoing projects ("the rebrand is dragging")
- Carry forward ALL existing open_loops, updating their status and lastMentioned date as needed
- When a loop is clearly resolved (user says they did it, or outcome is known), set status to "resolved"
- When a loop hasn't been mentioned in the last 14 days of conversation, set status to "stale"
- Keep max 10 open loops. Drop resolved/stale ones first if you need space
- Don't create loops for routine tasks (checking email, looking at calendar) — only meaningful ongoing threads

EMOTIONAL ARC RULES:
- Look at the TREND across conversations, not just the latest messages
- Note shifts: "was stressed last week, seems calmer now" or "energy has been low for several days"
- If the emotional tone hasn't changed, say so: "consistently upbeat" or "stable, no major shifts"

RELATIONSHIP MEMORY RULES:
- Track how the relationship is EVOLVING, not just what happened
- Note trust signals: are they sharing more personal stuff? Testing Nest less? Being more direct?
- Note friction points: corrections, frustrations, times Nest let them down
- Carry forward existing relationship_notes, evolving them. Don't restart from scratch.

KEY MOMENTS RULES:
- Only capture interactions that STOOD OUT — positive or negative
  - A moment where Nest impressed them
  - A moment where Nest screwed up
  - An inside joke or reference that developed
  - A time they opened up about something personal
- Keep max 10 key moments. Drop old "low" callback_potential ones when adding new ones.
- callback_potential: "high" = could become a natural callback. "low" = don't bring this up (negative memory)
- Carry forward ALL existing key_moments unless dropping for space

LEARNING EXTRACTION RULES:
- ONLY extract learnings from what the USER said. Nest's messages are context only — they help you understand the user's intent, but NEVER store something Nest said as a user fact. If Nest says "you like wine" and the user doesn't confirm it, that is NOT a learning.
- Extract things the user EXPLICITLY stated: preferences ("I prefer short summaries"), facts ("my dog's name is Bruno"), dislikes ("don't call me mate")
- Extract CORRECTIONS with context: what Nest got wrong and what the right answer was
- Extract contact DYNAMICS: how they talk about people ("Sarah has been difficult", "Tom is my go-to")
- Extract ANTICIPATION patterns: "user always asks for X after Y" or "Monday mornings they want calendar"
- For each learning, assess emotional_weight:
  - "high": Clearly matters to them (repeated, emotional language, life-impacting)
  - "medium": Useful to know but not deeply personal
  - "low": Minor detail
- CRITICAL: Only extract things with real signal. Don't manufacture learnings from nothing.
- If no new learnings in this batch, return empty array.

Return ONLY valid JSON, no markdown fences.`;

  try {
    const _t0 = Date.now();
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `New messages to incorporate:\n${conversationText}` },
        ],
        max_tokens: 2500,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("[memory-service] OpenAI error:", resp.status);
      return null;
    }

    const data = await resp.json();
    if (userId && supabase && data.usage) {
      await logApiUsage(supabase, {
        userId, model: "gpt-4.1-mini", endpoint: "memory-summary",
        description:     "Rolling conversation summary update",
        tokensIn:        data.usage.prompt_tokens                              ?? 0,
        tokensOut:       data.usage.completion_tokens                          ?? 0,
        tokensInCached:  data.usage.prompt_tokens_details?.cached_tokens       ?? 0,
        tokensReasoning: data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
        latencyMs: Date.now() - _t0,
      });
    }
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Parse open loops with date defaults
    const now = new Date().toISOString();
    const openLoops: OpenLoop[] = (parsed.open_loops ?? []).map((l: any) => ({
      topic: l.topic ?? "",
      firstMentioned: l.firstMentioned ?? now,
      lastMentioned: l.lastMentioned ?? now,
      status: l.status ?? "open",
      context: l.context ?? "",
    }));

    // Parse key moments
    const keyMoments: KeyMoment[] = (parsed.key_moments ?? []).map((m: any) => ({
      moment: m.moment ?? "",
      when: m.when ?? now.slice(0, 10),
      emotional_tone: m.emotional_tone ?? "",
      callback_potential: m.callback_potential ?? "medium",
    }));

    // Parse learned facts
    const learnedFacts: ExtractedLearning[] = (parsed.learned_facts ?? []).map((f: any) => ({
      category: f.category ?? "fact",
      content: f.content ?? "",
      context: f.context ?? "",
      emotional_weight: f.emotional_weight ?? "medium",
      confidence: typeof f.confidence === "number" ? f.confidence : 0.7,
    }));

    return {
      summary: parsed.summary ?? "",
      writingStyle: parsed.writing_style ?? "",
      preferences: parsed.preferences ?? {},
      openLoops,
      emotionalArc: parsed.emotional_arc ?? "",
      relationshipNotes: parsed.relationship_notes ?? "",
      keyMoments,
      learnedFacts,
    };
  } catch (e) {
    console.error("[memory-service] Summarisation failed:", e);
    return null;
  }
}

// ── Save extracted learnings to v2_user_learnings ────────────

async function saveExtractedLearnings(
  userId: string,
  learnings: ExtractedLearning[],
  supabase: SupabaseClient,
): Promise<void> {
  for (const l of learnings) {
    if (!l.content || l.content.length < 3) continue;

    try {
      // Check for similar existing learning
      const { data: existing } = await supabase
        .from("v2_user_learnings")
        .select("id, times_reinforced, confidence")
        .eq("user_id", userId)
        .eq("category", l.category)
        .eq("active", true)
        .ilike("content", `%${l.content.slice(0, 40)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await supabase
          .from("v2_user_learnings")
          .update({
            times_reinforced: existing.times_reinforced + 1,
            confidence: Math.min(existing.confidence + 0.05, 1.0),
            last_observed_at: new Date().toISOString(),
            context: l.context || undefined,
          })
          .eq("id", existing.id);
        if (updateErr) console.error(`[memory-service] Learning reinforce failed:`, updateErr.message);
        else {
          console.log(`[memory-service] Reinforced learning: ${l.category} — "${l.content.slice(0, 60)}"`);
          embedLearning(supabase, userId, existing.id, l.category, l.content, l.context || null).catch(() => {});
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase.from("v2_user_learnings").insert({
          user_id: userId,
          category: l.category,
          content: l.content,
          context: l.context || null,
          emotional_weight: l.emotional_weight,
          confidence: l.confidence,
          source: "inferred",
        }).select("id").single();
        if (insertErr) console.error(`[memory-service] Learning insert failed:`, insertErr.message, insertErr.details);
        else {
          console.log(`[memory-service] New learning: ${l.category} — "${l.content.slice(0, 60)}"`);
          if (inserted?.id) {
            embedLearning(supabase, userId, inserted.id, l.category, l.content, l.context || null).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error(`[memory-service] Learning save exception:`, (e as Error).message);
    }
  }
  console.log(`[memory-service] Processed ${learnings.length} learnings for user ${userId}`);
}

// ── Real-Time Universal Learning Extraction ──────────────────
// Runs on every user message (fire-and-forget). Extracts ALL learnable
// info in a single gpt-4.1-nano call: plans, facts, preferences,
// people, locations, dislikes, corrections. ~$0.0001 per call.

const SKIP_PATTERN = /^(ok|okay|thanks|thank you|ty|haha|hahaha|lol|yep|yea|yeah|nah|sure|cool|nice|kk|bet|gotcha|cheers|np|k|yes|no|nope|aight|word|true|facts|right|ah|oh|hmm|mm|omg|wow|ooh|nah|ya|ugh|bruh|lmao|ikr|same|mood|fr|slay|w|l)\s*[.!?]*$/i;

const LEARNING_SYSTEM = `Extract ALL learnable information from this user message.
Return a JSON array of learnings. Return [] if nothing to extract.

Each item: { "type": "<category>", "content": "<what you learned>", "target_date": "<YYYY-MM-DD if time-bound, else null>", "expires_after": "<YYYY-MM-DD or null>", "confidence": 0.5-0.9 }

Categories and examples:
- "commitment": plans, events, things they will do at a specific time
  "going to a museum tomorrow" → { type: "commitment", content: "going to a museum", target_date: "2026-02-27", expires_after: "2026-02-28", confidence: 0.7 }
  "dinner with Sarah next week" → commitment with date
  "need to send report by Thursday" → commitment with deadline

- "fact": personal facts about the user
  "I work at Google" → { type: "fact", content: "works at Google", target_date: null, confidence: 0.9 }
  "my dog's name is Bruno" → fact
  "I'm 32" → fact

- "preference": things they like or want
  "I prefer short answers" → { type: "preference", content: "prefers short concise answers", target_date: null, confidence: 0.85 }
  "I love Italian food" → preference

- "dislike": things they don't like or don't want
  "don't call me mate" → { type: "dislike", content: "doesn't like being called mate", confidence: 0.9 }
  "I hate long emails" → dislike

- "relationship": people in their life and who they are
  "Sarah is my sister" → { type: "relationship", content: "Sarah is their sister", confidence: 0.9 }
  "Tom is my boss at Acme" → relationship
  "meeting James for coffee" → { type: "relationship", content: "James - friend/acquaintance (met for coffee)", confidence: 0.6 }

- "location": where they are or live
  "I'm in Tokyo this week" → { type: "location", content: "currently in Tokyo", target_date: null, confidence: 0.85 }
  "I live in Sydney" → { type: "location", content: "lives in Sydney", confidence: 0.9 }

- "correction": something they corrected about a previous misunderstanding
  "no, I said Melbourne not Sydney" → correction

- "contact_note": how they feel about someone
  "Sarah has been really helpful lately" → contact_note

- "anticipation": patterns in their behavior
  "I always check my calendar first thing Monday" → anticipation

Rules:
- Extract from the USER's perspective only. Write content in third person ("works at Google", not "I work at Google")
- A single message can have MULTIPLE learnings (e.g. "my sister Sarah lives in London" = relationship + location)
- Resolve relative dates using TODAY. Set target_date only for time-bound items
- confidence: 0.9 = explicit statement, 0.7 = implied, 0.5 = inferred
- Return [] if the message is purely conversational with nothing to learn
- ONLY valid JSON array, nothing else`;

export async function extractLearnings(
  message: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  // Skip very short messages and pure acknowledgments
  if (message.length < 12 || SKIP_PATTERN.test(message.trim())) return;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const _t0 = Date.now();
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        messages: [
          { role: "system", content: `${LEARNING_SYSTEM}\n\nTODAY: ${today}` },
          { role: "user", content: message },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("[memory-service] Learning extraction OpenAI error:", resp.status);
      return;
    }

    const data = await resp.json();
    if (data.usage) {
      await logApiUsage(supabase, {
        userId, model: "gpt-4.1-nano", endpoint: "memory-learnings",
        description:     "User learning & preference extraction",
        tokensIn:        data.usage.prompt_tokens                              ?? 0,
        tokensOut:       data.usage.completion_tokens                          ?? 0,
        tokensInCached:  data.usage.prompt_tokens_details?.cached_tokens       ?? 0,
        tokensReasoning: data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
        latencyMs: Date.now() - _t0,
      });
    }
    const raw = data.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const learnings = JSON.parse(cleaned);

    if (!Array.isArray(learnings) || learnings.length === 0) return;

    console.log(`[memory-service] Extracted ${learnings.length} learning(s) from message`);

    for (const l of learnings) {
      if (!l.content || !l.type) continue;

      const category = l.type as string;
      const content = (l.content as string).slice(0, 500);

      // Check for existing similar learning (same category + similar content)
      const { data: existing } = await supabase
        .from("v2_user_learnings")
        .select("id, times_reinforced, confidence")
        .eq("user_id", userId)
        .eq("category", category)
        .eq("active", true)
        .ilike("content", `%${content.slice(0, 30)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("v2_user_learnings")
          .update({
            times_reinforced: existing.times_reinforced + 1,
            confidence: Math.min((existing.confidence ?? 0.7) + 0.05, 1.0),
            last_observed_at: new Date().toISOString(),
            ...(l.target_date ? { target_date: l.target_date } : {}),
            ...(l.expires_after ? { expires_after: l.expires_after } : {}),
          })
          .eq("id", existing.id);
        console.log(`[memory-service] Reinforced ${category}: "${content.slice(0, 60)}"`);
        embedLearning(supabase, userId, existing.id, category, content, `Mentioned on ${today}`).catch(() => {});
      } else {
        const { data: inserted } = await supabase.from("v2_user_learnings").insert({
          user_id: userId,
          category,
          content,
          context: `Mentioned on ${today}`,
          emotional_weight: l.type === "dislike" || l.type === "correction" ? "high" : "medium",
          confidence: l.confidence ?? 0.7,
          source: "inferred",
          target_date: l.target_date ?? null,
          expires_after: l.expires_after ?? null,
        }).select("id").single();
        console.log(`[memory-service] New ${category}: "${content.slice(0, 60)}"${l.target_date ? ` → ${l.target_date}` : ""}`);
        if (inserted?.id) {
          embedLearning(supabase, userId, inserted.id, category, content, `Mentioned on ${today}`).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error("[memory-service] Learning extraction failed:", (e as Error).message);
  }
}

// Backwards-compatible alias
export const extractCommitments = extractLearnings;

// ── Identity Model Update (Layer 3) ─────────────────────────

async function updateIdentityModel(
  userId: string,
  supabase: SupabaseClient,
  latestSummary: SummaryResult,
  existingIdentity: IdentityModel | null | undefined,
): Promise<void> {
  // Fetch active learnings for context
  const { data: learnings } = await supabase
    .from("v2_user_learnings")
    .select("category, content, confidence, times_reinforced, emotional_weight")
    .eq("user_id", userId)
    .eq("active", true)
    .gte("confidence", 0.5)
    .order("confidence", { ascending: false })
    .limit(30);

  const learningsText = (learnings ?? [])
    .map((l: any) => `[${l.category}] ${l.content} (confidence: ${l.confidence}, weight: ${l.emotional_weight}${l.times_reinforced > 1 ? `, mentioned ${l.times_reinforced}x` : ""})`)
    .join("\n");

  const momentsText = (latestSummary.keyMoments ?? [])
    .map(m => `- ${m.moment} (${m.emotional_tone}, callback: ${m.callback_potential})`)
    .join("\n");

  const existingIdentityText = existingIdentity
    ? JSON.stringify(existingIdentity, null, 2)
    : "No existing identity model yet. Build from scratch.";

  const systemPrompt = `You are building a deep psychological profile of a user based on months of conversation data with an AI assistant called Nest. This isn't about facts — it's about PATTERNS. You're trying to understand WHO this person is the way a close friend would.

EXISTING IDENTITY MODEL:
${existingIdentityText}

CONVERSATION SUMMARY:
${latestSummary.summary}

EMOTIONAL ARC:
${latestSummary.emotionalArc}

RELATIONSHIP NOTES:
${latestSummary.relationshipNotes}

RECENT LEARNINGS:
${learningsText || "None yet."}

KEY MOMENTS:
${momentsText || "None yet."}

Update the identity model. Return a JSON object with exactly these fields:

{
  "personality_patterns": ["up to 6 patterns in how they think, decide, and behave — NOT facts ('works at Blacklane') but patterns ('competitive, hates losing time to inefficiency'). Each should feel like something a close friend would say about them."],
  "emotional_triggers": {
    "stress_signals": ["up to 3 observable signals when they're stressed — specific texting behavior changes"],
    "excitement_signals": ["up to 3 signals when they're excited or engaged"],
    "comfort_signals": ["up to 3 signals when they're comfortable and relaxed"]
  },
  "communication_dna": {
    "wants_from_nest": "What do they actually want from this relationship? Speed? Warmth? Challenge? Efficiency?",
    "responds_well_to": "What makes them engage more? Be specific.",
    "responds_poorly_to": "What makes them disengage or get frustrated? Be specific.",
    "decision_style": "How do they make decisions? Fast/slow? Data/gut? Options/recommendations?"
  },
  "life_themes": ["2-4 big threads running through their life right now — not tasks but themes ('navigating a career transition while managing team expectations')"],
  "anticipation_patterns": [
    {
      "trigger": "When X happens or in Y context",
      "likely_need": "They probably want Z",
      "confidence": 0.5-1.0
    }
  ]
}

RULES:
- Evolve the existing model, don't restart. Add new patterns, refine existing ones, drop ones that are no longer accurate.
- Every insight should feel like something a best friend would notice, not a therapist's clinical note.
- Be SPECIFIC. "Gets stressed" is useless. "Goes quiet and sends one-word answers when stressed about work deadlines" is useful.
- Max 6 personality patterns, 3 items per emotional_triggers bucket, 4 life themes, 6 anticipation patterns.
- If you don't have enough data for a section, leave it sparse rather than making things up.

Return ONLY valid JSON, no markdown fences.`;

  try {
    const _t0 = Date.now();
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Build or update the identity model based on all available data." },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error("[memory-service] Identity model OpenAI error:", resp.status);
      return;
    }

    const data = await resp.json();
    if (data.usage) {
      await logApiUsage(supabase, {
        userId, model: "gpt-4.1-mini", endpoint: "memory-identity",
        description:     "Identity & personality model update",
        tokensIn:        data.usage.prompt_tokens                              ?? 0,
        tokensOut:       data.usage.completion_tokens                          ?? 0,
        tokensInCached:  data.usage.prompt_tokens_details?.cached_tokens       ?? 0,
        tokensReasoning: data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
        latencyMs: Date.now() - _t0,
      });
    }
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate structure
    const model: IdentityModel = {
      personality_patterns: Array.isArray(parsed.personality_patterns) ? parsed.personality_patterns.slice(0, 6) : [],
      emotional_triggers: {
        stress_signals: Array.isArray(parsed.emotional_triggers?.stress_signals) ? parsed.emotional_triggers.stress_signals.slice(0, 3) : [],
        excitement_signals: Array.isArray(parsed.emotional_triggers?.excitement_signals) ? parsed.emotional_triggers.excitement_signals.slice(0, 3) : [],
        comfort_signals: Array.isArray(parsed.emotional_triggers?.comfort_signals) ? parsed.emotional_triggers.comfort_signals.slice(0, 3) : [],
      },
      communication_dna: {
        wants_from_nest: parsed.communication_dna?.wants_from_nest ?? null,
        responds_well_to: parsed.communication_dna?.responds_well_to ?? null,
        responds_poorly_to: parsed.communication_dna?.responds_poorly_to ?? null,
        decision_style: parsed.communication_dna?.decision_style ?? null,
      },
      life_themes: Array.isArray(parsed.life_themes) ? parsed.life_themes.slice(0, 4) : [],
      anticipation_patterns: Array.isArray(parsed.anticipation_patterns)
        ? parsed.anticipation_patterns.slice(0, 6).map((p: any) => ({
            trigger: p.trigger ?? "",
            likely_need: p.likely_need ?? "",
            confidence: typeof p.confidence === "number" ? p.confidence : 0.6,
          }))
        : [],
    };

    const { error } = await supabase
      .from("v2_user_memory")
      .update({ identity_model: model })
      .eq("user_id", userId);

    if (error) {
      console.error("[memory-service] Failed to save identity model:", error.message);
    } else {
      console.log(`[memory-service] Updated identity model for user ${userId} (${model.personality_patterns?.length ?? 0} patterns, ${model.anticipation_patterns?.length ?? 0} anticipations)`);
    }
  } catch (e) {
    console.error("[memory-service] Identity model update failed:", e);
  }
}
