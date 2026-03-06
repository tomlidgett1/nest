// hirafu-conversation-store.ts — Groups Hirafu exchanges into sessions.
//
// A new conversation is created when there is a >10 minute gap
// since the last message in the most recent conversation.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CONVERSATION_GAP_MS = 10 * 60 * 1000;

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  ts: string;
}

export async function appendToConversation(
  supabase: SupabaseClient,
  newMessages: ConversationMessage[],
  opts: { userId?: string; phoneNumber?: string },
): Promise<string> {
  if (newMessages.length === 0) return "";

  const { userId, phoneNumber } = opts;
  if (!userId && !phoneNumber) {
    console.error("[hirafu-conv] Need at least userId or phoneNumber");
    return "";
  }

  const now = new Date();

  let query = supabase
    .from("hirafu_conversations")
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
      .from("hirafu_conversations")
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
      console.error("[hirafu-conv] Insert failed:", error.message);
      return "";
    }
    return row?.id ?? "";
  }

  const existingMessages = (latest.messages as ConversationMessage[]) ?? [];
  const merged = [...existingMessages, ...newMessages];

  const { error } = await supabase
    .from("hirafu_conversations")
    .update({
      messages: merged,
      last_message_at: newMessages[newMessages.length - 1].ts,
    })
    .eq("id", latest.id);

  if (error) {
    console.error("[hirafu-conv] Update failed:", error.message);
  }

  return latest.id;
}

export async function linkConversationsToUser(
  supabase: SupabaseClient,
  phoneNumber: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("hirafu_conversations")
    .update({ user_id: userId })
    .eq("phone_number", phoneNumber)
    .eq("user_id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("[hirafu-conv] Link failed:", error.message);
  }
}
