// hirafu-memory.ts — Three-tier memory service for Hirafu.
//
// Strategy: 20 raw messages for immediate context + rolling summary.
// Summary updated every 20 new messages via GPT-4.1-mini (~$0.0006).
//
// Layers:
//   1. Learned facts — extracted per-message, persisted to hirafu_user_learnings
//   2. Relationship memory — relationship_notes + key_moments on hirafu_user_memory
//   3. Identity model — deep psychological profile, updated every ~100 messages

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const SUMMARY_INTERVAL = 20;
const IDENTITY_UPDATE_INTERVAL = 100;

// ── Types ────────────────────────────────────────────────────

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

export interface IdentityModel {
  personality_patterns: string[];
  emotional_triggers: {
    stress_signals: string[];
    excitement_signals: string[];
    comfort_signals: string[];
  };
  communication_dna: {
    wants_from_hirafu: string | null;
    responds_well_to: string | null;
    responds_poorly_to: string | null;
    decision_style: string | null;
  };
  life_themes: string[];
  anticipation_patterns: Array<{
    trigger: string;
    likely_need: string;
    confidence: number;
  }>;
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
}

// ── Read ─────────────────────────────────────────────────────

export async function getUserMemory(
  userId: string,
  supabase: SupabaseClient,
): Promise<UserMemory | null> {
  const { data, error } = await supabase
    .from("hirafu_user_memory")
    .select("summary, writing_style, preferences, message_count_at_summary, open_loops, emotional_arc, relationship_notes, key_moments, identity_model")
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
  };
}

// ── Update (rolling summary) ─────────────────────────────────

export async function updateMemory(
  userId: string,
  totalMessageCount: number,
  recentMessages: Array<{ role: string; content: string }>,
  supabase: SupabaseClient,
): Promise<void> {
  const existing = await getUserMemory(userId, supabase);
  const lastSummarisedAt = existing?.messageCountAtSummary ?? 0;

  if (totalMessageCount - lastSummarisedAt < SUMMARY_INTERVAL) return;

  const unsummarisedCount = totalMessageCount - lastSummarisedAt;
  const fetchCount = Math.min(unsummarisedCount + 4, 60);

  const { data: rawMessages } = await supabase
    .from("hirafu_chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(fetchCount);

  const messages = (rawMessages ?? [])
    .filter((m: any) => m.content && m.content.trim().length > 0)
    .reverse();

  if (messages.length === 0) return;

  const newSummary = await summariseConversation(messages, existing);
  if (!newSummary) return;

  const { error } = await supabase
    .from("hirafu_user_memory")
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
    console.error("[hirafu-memory] Failed to save memory:", error.message);
  } else {
    console.log(`[hirafu-memory] Updated summary for user ${userId} at message ${totalMessageCount}`);
  }

  if (newSummary.learnedFacts && newSummary.learnedFacts.length > 0) {
    await saveExtractedLearnings(userId, newSummary.learnedFacts, supabase);
  }

  if (totalMessageCount % IDENTITY_UPDATE_INTERVAL < SUMMARY_INTERVAL) {
    console.log(`[hirafu-memory] Triggering identity model update at message ${totalMessageCount}`);
    updateIdentityModel(userId, supabase, newSummary, existing?.identityModel).catch(e =>
      console.error("[hirafu-memory] Identity model update failed:", (e as Error).message),
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
  existing: UserMemory | null,
): Promise<SummaryResult | null> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const openLoopsContext = existing?.openLoops?.length
    ? `\nEXISTING OPEN LOOPS:\n${JSON.stringify(existing.openLoops)}\n`
    : "";
  const emotionalArcContext = existing?.emotionalArc
    ? `\nEXISTING EMOTIONAL ARC:\n${existing.emotionalArc}\n`
    : "";
  const relationshipContext = existing?.relationshipNotes
    ? `\nEXISTING RELATIONSHIP NOTES:\n${existing.relationshipNotes}\n`
    : "";
  const keyMomentsContext = existing?.keyMoments?.length
    ? `\nEXISTING KEY MOMENTS:\n${JSON.stringify(existing.keyMoments)}\n`
    : "";

  const systemPrompt = `You are a memory system for an AI assistant called Hirafu. Maintain a rolling summary AND extract relationship intelligence.

${existing?.summary ? `EXISTING SUMMARY (update and extend, never discard unless outdated):\n${existing.summary}\n` : "No existing summary. Create from scratch."}
${existing?.writingStyle ? `EXISTING WRITING STYLE:\n${existing.writingStyle}\n` : ""}${openLoopsContext}${emotionalArcContext}${relationshipContext}${keyMomentsContext}

Produce a JSON object with these fields:
{
  "summary": "Rolling summary of ENTIRE conversation history. Key facts, decisions, tasks, threads, personal details. Under 600 words. Be specific.",
  "writing_style": "Concrete description: (1) avg message length, (2) capitalisation, (3) punctuation, (4) emoji usage, (5) abbreviations, (6) greeting patterns, (7) sign-off patterns, (8) formality 1-5, (9) preferred response style",
  "preferences": { "communication_style": "", "topics_of_interest": [], "noted_preferences": [], "key_contacts": [] },
  "open_loops": [{ "topic": "", "firstMentioned": "ISO", "lastMentioned": "ISO", "status": "open|resolved|stale", "context": "" }],
  "emotional_arc": "1-2 sentences on mood trend",
  "relationship_notes": "2-4 sentences on Hirafu-user relationship state",
  "key_moments": [{ "moment": "", "when": "YYYY-MM-DD", "emotional_tone": "", "callback_potential": "high|medium|low" }],
  "learned_facts": [{ "category": "preference|correction|fact|dislike|contact_note|anticipation", "content": "", "context": "", "emotional_weight": "high|medium|low", "confidence": 0.5-1.0 }]
}

RULES:
- Max 10 open loops, 10 key moments. Drop resolved/stale/low-callback first.
- Only extract learnings from USER messages. Hirafu messages are context only.
- Return ONLY valid JSON, no markdown fences.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: systemPrompt,
        input: [
          { role: "user", content: `New messages to incorporate:\n${conversationText}` },
        ],
        max_output_tokens: 2500,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("[hirafu-memory] OpenAI error:", resp.status);
      return null;
    }

    const data = await resp.json();
    const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
    const raw = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const now = new Date().toISOString();
    const openLoops: OpenLoop[] = (parsed.open_loops ?? []).map((l: any) => ({
      topic: l.topic ?? "",
      firstMentioned: l.firstMentioned ?? now,
      lastMentioned: l.lastMentioned ?? now,
      status: l.status ?? "open",
      context: l.context ?? "",
    }));

    const keyMoments: KeyMoment[] = (parsed.key_moments ?? []).map((m: any) => ({
      moment: m.moment ?? "",
      when: m.when ?? now.slice(0, 10),
      emotional_tone: m.emotional_tone ?? "",
      callback_potential: m.callback_potential ?? "medium",
    }));

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
    console.error("[hirafu-memory] Summarisation failed:", e);
    return null;
  }
}

// ── Save extracted learnings ─────────────────────────────────

async function saveExtractedLearnings(
  userId: string,
  learnings: ExtractedLearning[],
  supabase: SupabaseClient,
): Promise<void> {
  for (const l of learnings) {
    if (!l.content || l.content.length < 3) continue;

    try {
      const { data: existing } = await supabase
        .from("hirafu_user_learnings")
        .select("id, times_reinforced, confidence")
        .eq("user_id", userId)
        .eq("category", l.category)
        .eq("active", true)
        .ilike("content", `%${l.content.slice(0, 40)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("hirafu_user_learnings")
          .update({
            times_reinforced: existing.times_reinforced + 1,
            confidence: Math.min(existing.confidence + 0.05, 1.0),
            last_observed_at: new Date().toISOString(),
            context: l.context || undefined,
          })
          .eq("id", existing.id);
        console.log(`[hirafu-memory] Reinforced: ${l.category} — "${l.content.slice(0, 60)}"`);
      } else {
        await supabase.from("hirafu_user_learnings").insert({
          user_id: userId,
          category: l.category,
          content: l.content,
          context: l.context || null,
          emotional_weight: l.emotional_weight,
          confidence: l.confidence,
          source: "inferred",
        });
        console.log(`[hirafu-memory] New learning: ${l.category} — "${l.content.slice(0, 60)}"`);
      }
    } catch (e) {
      console.error(`[hirafu-memory] Learning save failed:`, (e as Error).message);
    }
  }
}

// ── Real-time learning extraction (fire-and-forget per message) ──

const SKIP_PATTERN = /^(ok|okay|thanks|thank you|ty|haha|hahaha|lol|yep|yea|yeah|nah|sure|cool|nice|kk|bet|gotcha|cheers|np|k|yes|no|nope|aight|word|true|facts|right|ah|oh|hmm|mm|omg|wow|ooh|ya|ugh|bruh|lmao|ikr|same|mood|fr|slay|w|l)\s*[.!?]*$/i;

const LEARNING_SYSTEM = `Extract ALL learnable information from this user message.
Return a JSON array. Return [] if nothing to extract.

Each item: { "type": "<category>", "content": "<what you learned>", "target_date": "<YYYY-MM-DD if time-bound, else null>", "expires_after": "<YYYY-MM-DD or null>", "confidence": 0.5-0.9 }

Categories: commitment, fact, preference, dislike, relationship, location, correction, contact_note, anticipation

Rules:
- Extract from USER perspective. Write in third person.
- Single message can have multiple learnings.
- Resolve relative dates using TODAY.
- confidence: 0.9 = explicit, 0.7 = implied, 0.5 = inferred
- Return [] if purely conversational.
- ONLY valid JSON array.`;

export async function extractLearnings(
  message: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<void> {
  if (message.length < 12 || SKIP_PATTERN.test(message.trim())) return;

  const today = new Date().toISOString().slice(0, 10);

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        instructions: `${LEARNING_SYSTEM}\n\nTODAY: ${today}`,
        input: [
          { role: "user", content: message },
        ],
        max_output_tokens: 500,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("[hirafu-memory] Learning extraction error:", resp.status);
      return;
    }

    const data = await resp.json();
    const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
    const raw = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "[]";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const learnings = JSON.parse(cleaned);

    if (!Array.isArray(learnings) || learnings.length === 0) return;

    console.log(`[hirafu-memory] Extracted ${learnings.length} learning(s)`);

    for (const l of learnings) {
      if (!l.content || !l.type) continue;

      const category = l.type as string;
      const content = (l.content as string).slice(0, 500);

      const { data: existing } = await supabase
        .from("hirafu_user_learnings")
        .select("id, times_reinforced, confidence")
        .eq("user_id", userId)
        .eq("category", category)
        .eq("active", true)
        .ilike("content", `%${content.slice(0, 30)}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("hirafu_user_learnings")
          .update({
            times_reinforced: existing.times_reinforced + 1,
            confidence: Math.min((existing.confidence ?? 0.7) + 0.05, 1.0),
            last_observed_at: new Date().toISOString(),
            ...(l.target_date ? { target_date: l.target_date } : {}),
            ...(l.expires_after ? { expires_after: l.expires_after } : {}),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("hirafu_user_learnings").insert({
          user_id: userId,
          category,
          content,
          context: `Mentioned on ${today}`,
          emotional_weight: l.type === "dislike" || l.type === "correction" ? "high" : "medium",
          confidence: l.confidence ?? 0.7,
          source: "inferred",
          target_date: l.target_date ?? null,
          expires_after: l.expires_after ?? null,
        });
      }
    }
  } catch (e) {
    console.error("[hirafu-memory] Learning extraction failed:", (e as Error).message);
  }
}

// ── Identity Model Update (Layer 3) ─────────────────────────

async function updateIdentityModel(
  userId: string,
  supabase: SupabaseClient,
  latestSummary: SummaryResult,
  existingIdentity: IdentityModel | null | undefined,
): Promise<void> {
  const { data: learnings } = await supabase
    .from("hirafu_user_learnings")
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

  const systemPrompt = `You are building a deep psychological profile of a user based on months of conversation with Hirafu. This is about PATTERNS, not facts.

EXISTING IDENTITY MODEL:
${existingIdentityText}

CONVERSATION SUMMARY:
${latestSummary.summary}

EMOTIONAL ARC:
${latestSummary.emotionalArc}

RELATIONSHIP NOTES:
${latestSummary.relationshipNotes}

LEARNINGS:
${learningsText || "None yet."}

KEY MOMENTS:
${momentsText || "None yet."}

Return a JSON object:
{
  "personality_patterns": ["up to 6 patterns — how they think, decide, behave"],
  "emotional_triggers": {
    "stress_signals": ["up to 3"],
    "excitement_signals": ["up to 3"],
    "comfort_signals": ["up to 3"]
  },
  "communication_dna": {
    "wants_from_hirafu": "What do they want from this relationship?",
    "responds_well_to": "What makes them engage more?",
    "responds_poorly_to": "What makes them disengage?",
    "decision_style": "How do they make decisions?"
  },
  "life_themes": ["2-4 big threads"],
  "anticipation_patterns": [{ "trigger": "", "likely_need": "", "confidence": 0.5-1.0 }]
}

Evolve existing model. Be specific. Max 6 patterns, 3 per trigger bucket, 4 themes, 6 anticipations.
Return ONLY valid JSON.`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: systemPrompt,
        input: [
          { role: "user", content: "Build or update the identity model." },
        ],
        max_output_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      console.error("[hirafu-memory] Identity model error:", resp.status);
      return;
    }

    const data = await resp.json();
    const msgItem = (data.output ?? []).find((o: any) => o.type === "message");
    const raw = msgItem?.content?.find((c: any) => c.type === "output_text")?.text ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const model: IdentityModel = {
      personality_patterns: Array.isArray(parsed.personality_patterns) ? parsed.personality_patterns.slice(0, 6) : [],
      emotional_triggers: {
        stress_signals: Array.isArray(parsed.emotional_triggers?.stress_signals) ? parsed.emotional_triggers.stress_signals.slice(0, 3) : [],
        excitement_signals: Array.isArray(parsed.emotional_triggers?.excitement_signals) ? parsed.emotional_triggers.excitement_signals.slice(0, 3) : [],
        comfort_signals: Array.isArray(parsed.emotional_triggers?.comfort_signals) ? parsed.emotional_triggers.comfort_signals.slice(0, 3) : [],
      },
      communication_dna: {
        wants_from_hirafu: parsed.communication_dna?.wants_from_hirafu ?? null,
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
      .from("hirafu_user_memory")
      .update({ identity_model: model })
      .eq("user_id", userId);

    if (error) {
      console.error("[hirafu-memory] Failed to save identity model:", error.message);
    } else {
      console.log(`[hirafu-memory] Updated identity model for ${userId}`);
    }
  } catch (e) {
    console.error("[hirafu-memory] Identity model update failed:", e);
  }
}
