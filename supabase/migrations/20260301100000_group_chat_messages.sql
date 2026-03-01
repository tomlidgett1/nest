-- Add chat_guid and sender_name to v2_chat_messages for group chat persistence.
-- Group messages are stored with source='group' and chat_guid set.

ALTER TABLE public.v2_chat_messages
    ADD COLUMN IF NOT EXISTS chat_guid TEXT,
    ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Index for loading group chat history by chat_guid
CREATE INDEX IF NOT EXISTS idx_v2_chat_group
    ON v2_chat_messages(chat_guid, created_at DESC)
    WHERE chat_guid IS NOT NULL;
