-- Add source column to v2_chat_messages to distinguish channels.
-- Allows SMS and iMessage conversations to maintain separate history
-- for the same user.

ALTER TABLE public.v2_chat_messages
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'imessage';

CREATE INDEX IF NOT EXISTS idx_v2_chat_source
    ON v2_chat_messages(user_id, source, created_at DESC);
