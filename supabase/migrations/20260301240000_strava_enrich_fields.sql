-- Add missing Strava fields and reverse-geocoded location names
ALTER TABLE strava_activities
    ADD COLUMN IF NOT EXISTS start_location_name TEXT,
    ADD COLUMN IF NOT EXISTS end_location_name TEXT,
    ADD COLUMN IF NOT EXISTS elev_high DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS elev_low DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS average_temp DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS device_name TEXT,
    ADD COLUMN IF NOT EXISTS kilojoules DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS max_watts DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS weighted_average_watts DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS achievement_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_commute BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_trainer BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_heartrate BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS map_polyline TEXT;

CREATE INDEX IF NOT EXISTS idx_strava_activities_location
    ON strava_activities(user_id, start_location_name)
    WHERE start_location_name IS NOT NULL;
