-- Strava integration: OAuth accounts, structured activities, webhook tracking

-- ── user_strava_accounts ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_strava_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strava_athlete_id BIGINT NOT NULL,
    athlete_name TEXT,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, strava_athlete_id)
);

ALTER TABLE user_strava_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own strava accounts"
    ON user_strava_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE INDEX idx_strava_accounts_user ON user_strava_accounts(user_id);
CREATE INDEX idx_strava_accounts_athlete ON user_strava_accounts(strava_athlete_id);

-- ── strava_activities ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strava_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strava_id BIGINT NOT NULL,
    name TEXT,
    sport_type TEXT,
    activity_type TEXT,
    start_date TIMESTAMPTZ,
    start_date_local TIMESTAMPTZ,
    timezone TEXT,
    distance_metres DOUBLE PRECISION DEFAULT 0,
    moving_time_secs INTEGER DEFAULT 0,
    elapsed_time_secs INTEGER DEFAULT 0,
    total_elevation_gain_metres DOUBLE PRECISION DEFAULT 0,
    average_speed DOUBLE PRECISION,
    max_speed DOUBLE PRECISION,
    average_heartrate DOUBLE PRECISION,
    max_heartrate DOUBLE PRECISION,
    average_cadence DOUBLE PRECISION,
    average_watts DOUBLE PRECISION,
    calories DOUBLE PRECISION,
    suffer_score INTEGER,
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lng DOUBLE PRECISION,
    gear_name TEXT,
    athlete_count INTEGER DEFAULT 1,
    kudos_count INTEGER DEFAULT 0,
    pr_count INTEGER DEFAULT 0,
    description TEXT,
    is_race BOOLEAN DEFAULT false,
    workout_type INTEGER,
    raw_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, strava_id)
);

ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own strava activities"
    ON strava_activities FOR SELECT
    USING (auth.uid() = user_id);

CREATE INDEX idx_strava_activities_user_date ON strava_activities(user_id, start_date_local DESC);
CREATE INDEX idx_strava_activities_user_sport ON strava_activities(user_id, sport_type);

-- ── strava_webhook_subscriptions ─────────────────────────────
CREATE TABLE IF NOT EXISTS strava_webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id INTEGER NOT NULL UNIQUE,
    callback_url TEXT NOT NULL,
    verify_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
