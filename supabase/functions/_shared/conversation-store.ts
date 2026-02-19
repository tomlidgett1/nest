/**
 * Conversation store — groups iMessage exchanges into sessions.
 *
 * A new conversation is created when there is a >10 minute gap
 * since the last message in the most recent conversation.
 * Messages are stored as a JSONB array on the conversation row.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONVERSATION_GAP_MS = 10 * 60 * 1000; // 10 minutes

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: string; // ISO 8601
}

/**
 * Append one or more messages to the current conversation.
 * Looks up the latest conversation by user_id (if provided) or phone_number.
 * If the last message is older than 10 minutes, a new conversation row is created.
 */
export async function appendToConversation(
  supabase: SupabaseClient,
  newMessages: ConversationMessage[],
  opts: { userId?: string; phoneNumber?: string },
): Promise<string> {
  if (newMessages.length === 0) return "";

  const { userId, phoneNumber } = opts;
  if (!userId && !phoneNumber) {
    console.error("[conversation-store] Need at least userId or phoneNumber");
    return "";
  }

  const now = new Date();

  // Fetch the most recent conversation by user_id or phone_number
  let query = supabase
    .from("imessage_conversations")
    .select("id, last_message_at, messages");

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("phone_number", phoneNumber!);
  }

  const { data: latest } = await query
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const shouldCreateNew =
    !latest ||
    now.getTime() - new Date(latest.last_message_at).getTime() > CONVERSATION_GAP_MS;

  if (shouldCreateNew) {
    const { data: row, error } = await supabase
      .from("imessage_conversations")
      .insert({
        user_id: userId ?? "00000000-0000-0000-0000-000000000000",
        phone_number: phoneNumber ?? null,
        messages: newMessages,
        started_at: newMessages[0].ts,
        last_message_at: newMessages[newMessages.length - 1].ts,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[conversation-store] Insert failed:", error.message);
      return "";
    }
    return row?.id ?? "";
  }

  // Append to existing conversation
  const existingMessages = (latest.messages as ConversationMessage[]) ?? [];
  const merged = [...existingMessages, ...newMessages];

  const { error } = await supabase
    .from("imessage_conversations")
    .update({
      messages: merged,
      last_message_at: newMessages[newMessages.length - 1].ts,
    })
    .eq("id", latest.id);

  if (error) {
    console.error("[conversation-store] Update failed:", error.message);
  }

  return latest.id;
}

/**
 * Backfill: when an onboarding user signs up, migrate their phone-only
 * conversations to be associated with their new user_id.
 */
export async function linkConversationsToUser(
  supabase: SupabaseClient,
  phoneNumber: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("imessage_conversations")
    .update({ user_id: userId })
    .eq("phone_number", phoneNumber)
    .eq("user_id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("[conversation-store] Link failed:", error.message);
  }
}
