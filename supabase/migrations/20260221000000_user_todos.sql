-- User-facing todo/task list.
-- Separate from action_items (auto-extracted from meetings/emails).
-- These are explicitly created by the user via iMessage ("add to my todo list").

CREATE TABLE IF NOT EXISTS v2_user_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    notes TEXT,
    due_at TIMESTAMPTZ,
    priority TEXT DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'open'
        CHECK (status IN ('open', 'completed', 'dismissed')),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE v2_user_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON v2_user_todos
    FOR ALL USING (true) WITH CHECK (true);

DO $$ BEGIN
    CREATE POLICY "v2_user_todos_own_data" ON v2_user_todos
        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_v2_user_todos_user_status
    ON v2_user_todos (user_id, status)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_v2_user_todos_due
    ON v2_user_todos (user_id, due_at)
    WHERE status = 'open' AND due_at IS NOT NULL;
