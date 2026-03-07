// Three-Layer Conversation Memory Search
//
// Layer 1: Episodic Memory — distilled fact sheets from closed conversation sessions
// Layer 2: Semantic Knowledge Base — embedded learnings from v2_user_learnings
// Layer 3: Narrative Threads — multi-session arcs from open_loops
//
// All layers feed into the existing search_documents + search_embeddings tables
// and are searchable via hybrid_search_documents RPC.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embedChunks, truncateForEmbedding, type ChunkToEmbed } from "./embedder.ts";
import { sentenceAwareChunks, contentHash, CHUNKING_VERSION } from "./chunker.ts";
import { softDeleteSource, insertEmbeddedChunks } from "./ingestion-helpers.ts";
import { logApiUsage } from "./cost-tracker.ts";
import type { OpenLoop } from "./memory-service.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

function extractResponseText(data: Record<string, unknown>): string {
  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output) return "";
  return output
    .filter((o) => o.type === "message")
    .flatMap((o) => (o.content as Array<Record<string, unknown>>) ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text as string)
    .join("");
}

// ══════════════════════════════════════════════════════════════
// LAYER 1: Episodic Memory — Session-Level Fact Extraction
// ══════════════════════════════════════════════════════════════

const SESSION_EXTRACTION_PROMPT = `You are a memory extraction system. Given a conversation between a user and their AI assistant "Nest", extract a detailed fact sheet of everything worth remembering.

Extract ONLY from what the USER said or revealed. Nest's messages provide context but are not facts to store.

Produce a structured fact sheet with these sections (skip empty sections):

TOPICS: Specific subjects discussed (use proper nouns, place names, product names)
DECISIONS: Any decisions made or opinions expressed by the user
PLANS: Future plans, commitments, dates, deadlines mentioned
PEOPLE: Names mentioned and their relationship/context
FACTS: Personal facts revealed (job, location, preferences, life details)
QUESTIONS: Important questions the user asked (and answers if given)
MOOD: Brief emotional tone of the session (1 sentence)

Be specific. "Discussed travel" is useless. "Planning trip to Kyoto in April, looking at ryokans near Fushimi Inari, budget around $200/night" is useful.

Return the fact sheet as plain text, not JSON. Keep under 500 words.`;

interface ConversationMessage {
  role: string;
  content: string;
  ts?: string;
}

export async function embedClosedSession(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<void> {
  try {
    const { data: convo } = await supabase
      .from("imessage_conversations")
      .select("messages, started_at, last_message_at, is_embedded")
      .eq("id", conversationId)
      .single();

    if (!convo || convo.is_embedded) return;

    const messages = (convo.messages as ConversationMessage[]) ?? [];
    if (messages.length < 2) {
      await markSessionEmbedded(supabase, conversationId);
      return;
    }

    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length === 0) {
      await markSessionEmbedded(supabase, conversationId);
      return;
    }

    const formattedText = messages
      .map(m => `${m.role === "user" ? "User" : "Nest"}: ${m.content}`)
      .join("\n");

    const factSheet = await extractSessionFacts(formattedText, userId, supabase);
    if (!factSheet || factSheet.length < 20) {
      await markSessionEmbedded(supabase, conversationId);
      return;
    }

    const startDate = convo.started_at
      ? new Date(convo.started_at).toLocaleDateString("en-AU", {
          weekday: "short", day: "numeric", month: "short", year: "numeric",
        })
      : "unknown";
    const contextHeader = `Conversation | ${startDate} | ${messages.length} messages`;

    await softDeleteSource(supabase, userId, "conversation_summary", conversationId);
    await softDeleteSource(supabase, userId, "conversation_chunk", conversationId);

    const chunks: ChunkToEmbed[] = [];

    chunks.push({
      text: truncateForEmbedding(`${contextHeader}\n---\n${factSheet}`),
      sourceType: "conversation_summary",
      sourceId: conversationId,
      title: `Conversation ${startDate}`,
      chunkIndex: 0,
      contentHash: contentHash("conversation_summary", conversationId, "summary"),
      metadata: {
        started_at: convo.started_at,
        last_message_at: convo.last_message_at,
        message_count: messages.length,
        user_message_count: userMessages.length,
      },
    });

    if (formattedText.length > 2000) {
      const rawChunks = sentenceAwareChunks(formattedText, contextHeader);
      for (let i = 0; i < rawChunks.length; i++) {
        chunks.push({
          text: truncateForEmbedding(rawChunks[i]),
          sourceType: "conversation_chunk",
          sourceId: conversationId,
          title: `Conversation ${startDate}`,
          chunkIndex: i + 1,
          contentHash: contentHash("conversation_chunk", conversationId, "chunk", i),
          parentSourceId: conversationId,
          metadata: {
            started_at: convo.started_at,
            chunk_index: i,
          },
        });
      }
    }

    const embedded = await embedChunks(chunks);
    const result = await insertEmbeddedChunks(supabase, userId, embedded);
    await markSessionEmbedded(supabase, conversationId);

    console.log(
      `[conversation-embedder] L1: Embedded session ${conversationId} — ` +
      `${result.inserted} docs (1 summary + ${chunks.length - 1} chunks)`,
    );
  } catch (e) {
    console.error(`[conversation-embedder] L1 failed for ${conversationId}:`, (e as Error).message);
  }
}

async function extractSessionFacts(
  conversationText: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const truncated = conversationText.slice(0, 6000);
    const _t0 = Date.now();
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        instructions: SESSION_EXTRACTION_PROMPT,
        input: truncated,
        max_output_tokens: 800,
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      console.error("[conversation-embedder] Fact extraction API error:", resp.status);
      return null;
    }

    const data = await resp.json();
    if (data.usage) {
      await logApiUsage(supabase, {
        userId, model: "gpt-4.1-nano", endpoint: "conversation-embed-l1",
        description: "Session fact sheet extraction for episodic memory",
        tokensIn: data.usage.prompt_tokens ?? 0,
        tokensOut: data.usage.completion_tokens ?? 0,
        tokensInCached: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
        tokensReasoning: data.usage.completion_tokens_details?.reasoning_tokens ?? 0,
        latencyMs: Date.now() - _t0,
      });
    }

    return extractResponseText(data).trim();
  } catch (e) {
    console.error("[conversation-embedder] Fact extraction failed:", (e as Error).message);
    return null;
  }
}

async function markSessionEmbedded(supabase: SupabaseClient, conversationId: string): Promise<void> {
  await supabase
    .from("imessage_conversations")
    .update({ is_embedded: true })
    .eq("id", conversationId);
}

// ══════════════════════════════════════════════════════════════
// LAYER 2: Semantic Knowledge Base — Learning Embeddings
// ══════════════════════════════════════════════════════════════

export async function embedLearning(
  supabase: SupabaseClient,
  userId: string,
  learningId: string,
  category: string,
  content: string,
  context: string | null,
): Promise<void> {
  try {
    if (!content || content.length < 3) return;

    const embeddingText = context
      ? `[${category}] ${content} (context: ${context})`
      : `[${category}] ${content}`;

    await softDeleteSource(supabase, userId, "learning", learningId);

    const chunk: ChunkToEmbed = {
      text: truncateForEmbedding(embeddingText),
      sourceType: "learning",
      sourceId: learningId,
      title: `${category}: ${content.slice(0, 80)}`,
      chunkIndex: 0,
      contentHash: `${CHUNKING_VERSION}:learning:${learningId}:${Date.now()}`,
      metadata: { category, content, context },
    };

    const embedded = await embedChunks([chunk]);
    await insertEmbeddedChunks(supabase, userId, embedded);

    await supabase
      .from("v2_user_learnings")
      .update({ is_embedded: true, embedding_updated_at: new Date().toISOString() })
      .eq("id", learningId);

    console.log(`[conversation-embedder] L2: Embedded learning ${category} — "${content.slice(0, 60)}"`);
  } catch (e) {
    console.error(`[conversation-embedder] L2 failed for learning ${learningId}:`, (e as Error).message);
  }
}

export async function deactivateLearningEmbedding(
  supabase: SupabaseClient,
  userId: string,
  learningId: string,
): Promise<void> {
  try {
    await softDeleteSource(supabase, userId, "learning", learningId);
  } catch (e) {
    console.error(`[conversation-embedder] L2 deactivate failed:`, (e as Error).message);
  }
}

// ══════════════════════════════════════════════════════════════
// LAYER 3: Narrative Threads — Multi-Session Arcs
// ══════════════════════════════════════════════════════════════

function threadSourceId(userId: string, topic: string): string {
  const normalized = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
  return `thread:${userId.slice(0, 8)}:${normalized}`;
}

export async function embedNarrativeThreads(
  supabase: SupabaseClient,
  userId: string,
  currentLoops: OpenLoop[],
  previousLoops: OpenLoop[] | null | undefined,
): Promise<void> {
  try {
    if (!currentLoops || currentLoops.length === 0) return;

    const prevMap = new Map<string, OpenLoop>();
    if (previousLoops) {
      for (const loop of previousLoops) {
        prevMap.set(loop.topic, loop);
      }
    }

    const chunksToEmbed: ChunkToEmbed[] = [];

    for (const loop of currentLoops) {
      const prev = prevMap.get(loop.topic);
      const isNew = !prev;
      const isUpdated = prev && (
        prev.status !== loop.status ||
        prev.lastMentioned !== loop.lastMentioned ||
        prev.context !== loop.context
      );

      if (!isNew && !isUpdated) continue;

      const sourceId = threadSourceId(userId, loop.topic);

      await softDeleteSource(supabase, userId, "thread_summary", sourceId);

      const narrativeText = [
        `Thread: ${loop.topic}`,
        `Status: ${loop.status}`,
        `First mentioned: ${loop.firstMentioned}`,
        `Last mentioned: ${loop.lastMentioned}`,
        `Narrative: ${loop.context}`,
      ].join("\n");

      chunksToEmbed.push({
        text: truncateForEmbedding(narrativeText),
        sourceType: "thread_summary",
        sourceId,
        title: `Thread: ${loop.topic}`,
        chunkIndex: 0,
        contentHash: `${CHUNKING_VERSION}:thread:${sourceId}:${Date.now()}`,
        metadata: {
          topic: loop.topic,
          status: loop.status,
          first_mentioned: loop.firstMentioned,
          last_mentioned: loop.lastMentioned,
        },
      });
    }

    if (chunksToEmbed.length === 0) return;

    const embedded = await embedChunks(chunksToEmbed);
    await insertEmbeddedChunks(supabase, userId, embedded);

    console.log(
      `[conversation-embedder] L3: Embedded ${chunksToEmbed.length} narrative thread(s) ` +
      `[${chunksToEmbed.map(c => c.title).join(", ")}]`,
    );
  } catch (e) {
    console.error("[conversation-embedder] L3 failed:", (e as Error).message);
  }
}

// ══════════════════════════════════════════════════════════════
// BACKFILL — Index all existing historical data
// ══════════════════════════════════════════════════════════════

export async function backfillConversations(
  supabase: SupabaseClient,
  userId?: string,
  batchSize = 20,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  let query = supabase
    .from("imessage_conversations")
    .select("id, user_id")
    .or("is_embedded.is.null,is_embedded.eq.false")
    .order("last_message_at", { ascending: true })
    .limit(batchSize);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: sessions } = await query;
  if (!sessions || sessions.length === 0) return { processed: 0, errors: 0 };

  console.log(`[conversation-embedder] Backfill: ${sessions.length} sessions to process`);

  for (const session of sessions) {
    try {
      await embedClosedSession(supabase, session.user_id, session.id);
      processed++;
    } catch (e) {
      console.error(`[conversation-embedder] Backfill session ${session.id} failed:`, (e as Error).message);
      errors++;
    }
  }

  console.log(`[conversation-embedder] Backfill conversations: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

export async function backfillLearnings(
  supabase: SupabaseClient,
  userId?: string,
  batchSize = 50,
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  let query = supabase
    .from("v2_user_learnings")
    .select("id, user_id, category, content, context")
    .eq("active", true)
    .or("is_embedded.is.null,is_embedded.eq.false")
    .order("last_observed_at", { ascending: false })
    .limit(batchSize);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: learnings } = await query;
  if (!learnings || learnings.length === 0) return { processed: 0, errors: 0 };

  console.log(`[conversation-embedder] Backfill: ${learnings.length} learnings to process`);

  for (const l of learnings) {
    try {
      await embedLearning(supabase, l.user_id, l.id, l.category, l.content, l.context);
      processed++;
    } catch (e) {
      console.error(`[conversation-embedder] Backfill learning ${l.id} failed:`, (e as Error).message);
      errors++;
    }
  }

  console.log(`[conversation-embedder] Backfill learnings: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}
