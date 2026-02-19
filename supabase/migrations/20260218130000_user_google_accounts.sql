-- Multi-Google-account support: one Supabase user can link many Google accounts.

CREATE TABLE IF NOT EXISTS user_google_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    google_email TEXT NOT NULL,
    google_name TEXT,
    google_avatar_url TEXT,
    refresh_token TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, google_email)
);

ALTER TABLE user_google_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own google accounts"
    ON user_google_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own google accounts"
    ON user_google_accounts FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_google_accounts"
    ON user_google_accounts FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX idx_user_google_accounts_user ON user_google_accounts(user_id);

-- Migrate existing rows from the legacy single-token table
INSERT INTO user_google_accounts (user_id, google_email, refresh_token, is_primary)
SELECT got.user_id, COALESCE(p.email, 'unknown'), got.refresh_token, true
FROM google_oauth_tokens got
LEFT JOIN profiles p ON p.id = got.user_id
ON CONFLICT (user_id, google_email) DO NOTHING;
