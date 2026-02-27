-- Track meeting notes pitch status per user
-- Prevents re-pitching after decline, tracks acceptance state

ALTER TABLE v2_user_memory
    ADD COLUMN IF NOT EXISTS recall_pitch_status TEXT DEFAULT 'not_pitched'
    CHECK (recall_pitch_status IN ('not_pitched', 'pitched', 'accepted', 'declined'));

ALTER TABLE v2_user_memory
    ADD COLUMN IF NOT EXISTS recall_pitched_at TIMESTAMPTZ;
