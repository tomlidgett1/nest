-- Add conversation_json column to qa_feedback for storing
-- full conversation chains with highlighted messages, tools, and config.

ALTER TABLE qa_feedback ADD COLUMN IF NOT EXISTS conversation_json JSONB;
