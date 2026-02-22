-- QA feedback table for the localhost testing dashboard.
-- Stores ratings and annotations against specific agent responses.

CREATE TABLE IF NOT EXISTS qa_feedback (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_id TEXT,
    query       TEXT NOT NULL,
    response    TEXT NOT NULL,
    rating      TEXT CHECK (rating IN ('good', 'bad')),
    note        TEXT,
    debug_json  JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qa_feedback_user   ON qa_feedback (user_id);
CREATE INDEX idx_qa_feedback_rating ON qa_feedback (rating);
CREATE INDEX idx_qa_feedback_created ON qa_feedback (created_at DESC);

ALTER TABLE qa_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on qa_feedback"
    ON qa_feedback FOR ALL
    USING (true)
    WITH CHECK (true);
