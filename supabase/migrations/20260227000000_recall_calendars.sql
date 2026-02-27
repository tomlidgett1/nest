-- Recall.ai calendar connections
-- Tracks each user's connected calendar for automatic meeting recording via Recall.ai Calendar V2 API

CREATE TABLE IF NOT EXISTS recall_calendars (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recall_calendar_id  TEXT NOT NULL UNIQUE,
    platform            TEXT NOT NULL CHECK (platform IN ('google_calendar', 'microsoft_outlook')),
    calendar_email      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'syncing', 'active', 'error', 'disconnected')),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, calendar_email)
);

ALTER TABLE recall_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recall calendars"
    ON recall_calendars FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on recall_calendars"
    ON recall_calendars FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX idx_recall_calendars_user ON recall_calendars(user_id);
CREATE INDEX idx_recall_calendars_recall_id ON recall_calendars(recall_calendar_id);
