-- ============================================================
-- Memory System + Expanded Triggers for Two-Layer Agent Architecture
-- ============================================================

-- ── USER MEMORY (conversation summaries, writing style, preferences) ──
CREATE TABLE IF NOT EXISTS v2_user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    writing_style TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    message_count_at_summary INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)
);

ALTER TABLE v2_user_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "v2_user_memory_own_data" ON v2_user_memory
        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── EXPAND v2_agents FOR UNIFIED EXECUTION AGENT TYPE ────────
ALTER TABLE v2_agents
    DROP CONSTRAINT IF EXISTS v2_agents_agent_type_check;
ALTER TABLE v2_agents
    ADD CONSTRAINT v2_agents_agent_type_check
        CHECK (agent_type IN ('email', 'meeting_search', 'execution'));

-- ── EXPAND v2_triggers FOR CRON + EMAIL MATCH ────────────────
ALTER TABLE v2_triggers
    DROP CONSTRAINT IF EXISTS v2_triggers_trigger_type_check;

ALTER TABLE v2_triggers
    ADD CONSTRAINT v2_triggers_trigger_type_check
        CHECK (trigger_type IN ('new_email', 'calendar_start', 'cron', 'email_match'));

ALTER TABLE v2_triggers
    ADD COLUMN IF NOT EXISTS cron_expression TEXT,
    ADD COLUMN IF NOT EXISTS repeating BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS next_fire_at TIMESTAMPTZ;

-- Index for efficient cron trigger polling
CREATE INDEX IF NOT EXISTS idx_v2_triggers_cron_fire
    ON v2_triggers(next_fire_at)
    WHERE active = true AND trigger_type = 'cron';
