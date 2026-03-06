-- Three-Layer Conversation Memory Search
-- Adds semantic search support for:
--   1. conversation_summary / conversation_chunk — distilled session knowledge
--   2. learning — embedded facts from v2_user_learnings
--   3. thread_summary — narrative arcs across sessions (from open_loops)

-- 1. Extend source_type CHECK for new document types
ALTER TABLE public.search_documents
    DROP CONSTRAINT IF EXISTS search_documents_source_type_check;

ALTER TABLE public.search_documents
    ADD CONSTRAINT search_documents_source_type_check
    CHECK (source_type IN (
        'note_summary', 'note_chunk', 'utterance_chunk',
        'email_summary', 'email_chunk',
        'calendar_summary', 'calendar_chunk',
        'strava_summary', 'strava_chunk',
        'conversation_summary', 'conversation_chunk',
        'learning',
        'thread_summary'
    ));

-- 2. Track which conversation sessions have been embedded
ALTER TABLE imessage_conversations
ADD COLUMN IF NOT EXISTS is_embedded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_imsg_conv_not_embedded
    ON imessage_conversations(user_id, last_message_at ASC)
    WHERE is_embedded = false;

-- 3. Track which learnings have been embedded (for incremental sync)
ALTER TABLE v2_user_learnings
ADD COLUMN IF NOT EXISTS is_embedded BOOLEAN DEFAULT false;

ALTER TABLE v2_user_learnings
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_learnings_not_embedded
    ON v2_user_learnings(user_id)
    WHERE active = true AND is_embedded = false;
