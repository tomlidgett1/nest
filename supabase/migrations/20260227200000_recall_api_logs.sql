-- Recall.ai API interaction logs
-- Comprehensive audit trail of all outbound API calls and inbound webhooks

CREATE TABLE IF NOT EXISTS recall_api_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID,
    direction       TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    endpoint        TEXT NOT NULL,
    method          TEXT,
    request_body    JSONB,
    response_status INT,
    response_body   JSONB,
    error           TEXT,
    duration_ms     INT,
    recall_ids      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recall_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on recall_api_logs"
    ON recall_api_logs FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX idx_recall_api_logs_user ON recall_api_logs(user_id, created_at DESC);
CREATE INDEX idx_recall_api_logs_created ON recall_api_logs(created_at DESC);
