-- Debug logging: comprehensive execution traces for every message.
-- Enables deep debugging of why the AI model behaved a certain way.

CREATE TABLE IF NOT EXISTS v2_debug_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    source      TEXT NOT NULL,           -- 'app' | 'imessage' | 'group'
    route_path  TEXT NOT NULL,           -- 'static' | 'casual' | 'agent'
    model       TEXT,                    -- 'gpt-4.1' | 'gpt-4.1-nano' | null
    user_message TEXT NOT NULL,
    trace       JSONB NOT NULL,          -- full execution trace
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_user    ON v2_debug_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_created ON v2_debug_logs (created_at DESC);

-- Service-role only access
ALTER TABLE v2_debug_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_debug_logs" ON v2_debug_logs FOR ALL USING (true) WITH CHECK (true);

-- Auto-cleanup: delete traces older than 7 days to keep table lean
-- (can be run manually or via pg_cron if set up)
