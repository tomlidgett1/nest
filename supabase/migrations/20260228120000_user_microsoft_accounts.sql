-- Multi-Microsoft-account support: one Supabase user can link many Microsoft/Outlook accounts.

CREATE TABLE IF NOT EXISTS user_microsoft_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    microsoft_email TEXT NOT NULL,
    microsoft_name TEXT,
    microsoft_avatar_url TEXT,
    refresh_token TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, microsoft_email)
);

ALTER TABLE user_microsoft_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own microsoft accounts"
    ON user_microsoft_accounts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own microsoft accounts"
    ON user_microsoft_accounts FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_microsoft_accounts"
    ON user_microsoft_accounts FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE INDEX idx_user_microsoft_accounts_user ON user_microsoft_accounts(user_id);
