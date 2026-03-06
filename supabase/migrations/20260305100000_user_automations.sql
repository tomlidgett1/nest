-- ============================================================
-- User Automations — scheduled actions (email summary, etc.)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    automation_type TEXT NOT NULL
        CHECK (automation_type IN ('email_summary', 'meeting_prep', 'weekly_digest')),
    active BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}'::jsonb,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, automation_type)
);

ALTER TABLE user_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_automations_own_data" ON user_automations
    FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_automations_due
    ON user_automations(next_run_at)
    WHERE active = true;

-- Schedule: call v2-trigger every 60s to fire due automations.
SELECT cron.schedule(
    'automation-cron',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://ynoidbjupfcaaymzbtic.supabase.co/functions/v1/v2-trigger',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlub2lkYmp1cGZjYWF5bXpidGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTEyODYyMiwiZXhwIjoyMDg2NzA0NjIyfQ.RHDlgzWK6V_zUa3zkTtfSGWdI24kqHpRZY9iY_tFOeU',
            'Content-Type', 'application/json'
        ),
        body := '{"action": "check_automations"}'::jsonb
    );
    $$
);
