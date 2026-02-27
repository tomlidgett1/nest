-- Recall.ai meeting recordings
-- Tracks individual meeting recordings, bot state, transcripts, and processing status

CREATE TABLE IF NOT EXISTS recall_meetings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recall_calendar_id  TEXT NOT NULL,
    recall_event_id     TEXT NOT NULL UNIQUE,
    recall_bot_id       TEXT,
    recall_recording_id TEXT,
    event_title         TEXT NOT NULL,
    event_start         TIMESTAMPTZ NOT NULL,
    event_end           TIMESTAMPTZ,
    meeting_url         TEXT,
    attendees           JSONB DEFAULT '[]',
    bot_status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (bot_status IN (
                            'pending', 'scheduled', 'joining', 'recording',
                            'done', 'error', 'no_meeting_url'
                        )),
    transcript_status   TEXT NOT NULL DEFAULT 'pending'
                        CHECK (transcript_status IN ('pending', 'processing', 'ready', 'error')),
    transcript_text     TEXT,
    summary_text        TEXT,
    insights_extracted  BOOLEAN NOT NULL DEFAULT false,
    notification_sent   BOOLEAN NOT NULL DEFAULT false,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recall_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recall meetings"
    ON recall_meetings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on recall_meetings"
    ON recall_meetings FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX idx_recall_meetings_user ON recall_meetings(user_id);
CREATE INDEX idx_recall_meetings_event ON recall_meetings(recall_event_id);
CREATE INDEX idx_recall_meetings_bot ON recall_meetings(recall_bot_id);
CREATE INDEX idx_recall_meetings_recording ON recall_meetings(recall_recording_id);
CREATE INDEX idx_recall_meetings_start ON recall_meetings(user_id, event_start DESC);
CREATE INDEX idx_recall_meetings_pending_insights
    ON recall_meetings(user_id)
    WHERE transcript_status = 'ready' AND insights_extracted = false;
