-- Situational Awareness Engine — schema changes
--
-- 1. Add target_date / expires_after to v2_user_learnings for time-bound commitments
-- 2. Create v2_daily_briefing table for pre-computed situational briefings

-- ── Commitment date columns on learnings ─────────────────────────
ALTER TABLE v2_user_learnings
ADD COLUMN IF NOT EXISTS target_date DATE,
ADD COLUMN IF NOT EXISTS expires_after DATE;

-- Allow 'commitment' as a category
ALTER TABLE v2_user_learnings DROP CONSTRAINT IF EXISTS v2_user_learnings_category_check;
ALTER TABLE v2_user_learnings ADD CONSTRAINT v2_user_learnings_category_check
  CHECK (category IN ('preference', 'correction', 'fact', 'dislike', 'contact_note', 'anticipation', 'commitment'));

-- Index for fast commitment lookups by date range
CREATE INDEX IF NOT EXISTS idx_learnings_commitments
  ON v2_user_learnings(user_id, target_date)
  WHERE active = true AND category = 'commitment';

-- ── Daily Briefing Table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS v2_daily_briefing (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  briefing_date DATE NOT NULL,
  briefing TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sources JSONB DEFAULT '[]'
);

-- RLS: users can only read their own briefing
ALTER TABLE v2_daily_briefing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own briefing"
  ON v2_daily_briefing FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (edge functions use service role key)
CREATE POLICY "Service role full access on briefing"
  ON v2_daily_briefing FOR ALL
  USING (true)
  WITH CHECK (true);
