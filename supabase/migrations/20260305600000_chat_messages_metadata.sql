-- Add metadata JSONB column to v2_chat_messages for automation tracking
ALTER TABLE v2_chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB;
