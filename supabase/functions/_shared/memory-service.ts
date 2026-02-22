// Memory service — rolling conversation summary.
//
// Strategy: 20 raw messages for immediate context + a rolling summary
// that captures everything before that. The summary is updated every
// 20 new messages using a cheap GPT-4.1-mini call (~$0.0004 each).
//
// This gives Nest near-perfect memory at ~2000 tokens per request
// instead of ~15,000 for raw history.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

const SUMMARY_INTERVAL = 20;

export interface UserMemory {
  summary: string;
  writingStyle: string | null;
  preferences: Record<string, any>;
  messageCountAtSummary: number;
}

export async function getUserMemory(
  userId: string,
  supabase: SupabaseClient,
): Promise<UserMemory | null> {
  const { data, error } = await supabase
    .from("v2_user_memory")
    .select("summary, writing_style, preferences, message_count_at_summary")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    summary: data.summary,
    writingStyle: data.writing_style,
    preferences: data.preferences ?? {},
    messageCountAtSummary: data.message_count_at_summary ?? 0,
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
  const fetchCount = Math.min(unsummarisedCount + 4, 60);

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

  const newSummary = await summariseConversation(messages, existing?.summary, existing?.writingStyle);
  if (!newSummary) return;

  const { error } = await supabase
    .from("v2_user_memory")
    .upsert(
      {
        user_id: userId,
        summary: newSummary.summary,
        writing_style: newSummary.writingStyle,
        preferences: newSummary.preferences,
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
}

interface SummaryResult {
  summary: string;
  writingStyle: string;
  preferences: Record<string, any>;
}

async function summariseConversation(
  messages: Array<{ role: string; content: string }>,
  existingSummary?: string | null,
  existingWritingStyle?: string | null,
): Promise<SummaryResult | null> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");

  const systemPrompt = `You are a memory system for an AI assistant called Nest. Your job is to maintain a rolling summary of the entire conversation history.

${existingSummary ? `EXISTING SUMMARY (update and extend this, never discard information unless it's clearly outdated):\n${existingSummary}\n` : "No existing summary yet. Create one from scratch."}
${existingWritingStyle ? `EXISTING WRITING STYLE NOTES:\n${existingWritingStyle}\n` : ""}

You will receive the latest batch of messages. Merge them into the existing summary.

Produce a JSON object with exactly these fields:
{
  "summary": "A rolling summary covering the ENTIRE conversation history. Include: key facts about the user (name, job, company, interests), important decisions, tasks completed, tasks pending, ongoing threads, personal details shared, and anything Nest should remember. Keep under 600 words. Be specific with names, dates, and details. Never lose information from the existing summary unless it's been superseded.",
  "writing_style": "A CONCRETE, SPECIFIC description of the user's iMessage texting style. Include ALL of these dimensions: (1) average message length in words, (2) capitalisation (all lowercase / sentence case / mixed), (3) punctuation habits (periods? commas? question marks? none?), (4) emoji usage (never / rare / frequent), (5) abbreviations or slang they use (list specific ones), (6) greeting patterns (hey / hi / nothing / yo), (7) sign-off patterns, (8) formality level (1-5 scale, 1=very casual, 5=formal), (9) typical response they seem to prefer from Nest (short punchy vs detailed). Example: 'avg 8 words, all lowercase, no periods, no emoji, uses abbreviations (u, ur, tbh), greets with hey or nothing, formality 2/5, prefers short punchy responses'",
  "preferences": {
    "communication_style": "how they prefer info delivered",
    "topics_of_interest": ["recurring topics"],
    "noted_preferences": ["explicit preferences stated"],
    "key_contacts": ["names/emails mentioned frequently"]
  }
}

Return ONLY valid JSON, no markdown fences.`;

  try {
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
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("[memory-service] OpenAI error:", resp.status);
      return null;
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      summary: parsed.summary ?? "",
      writingStyle: parsed.writing_style ?? "",
      preferences: parsed.preferences ?? {},
    };
  } catch (e) {
    console.error("[memory-service] Summarisation failed:", e);
    return null;
  }
}
