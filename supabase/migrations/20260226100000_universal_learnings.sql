-- Universal Learnings: add relationship and location categories
-- to support real-time extraction of people and places from every message.

-- Expand the allowed categories
ALTER TABLE v2_user_learnings DROP CONSTRAINT IF EXISTS v2_user_learnings_category_check;
ALTER TABLE v2_user_learnings ADD CONSTRAINT v2_user_learnings_category_check
  CHECK (category IN ('preference', 'correction', 'fact', 'dislike', 'contact_note', 'anticipation', 'commitment', 'relationship', 'location'));

-- Index for recent learnings (used by universal extraction dedup + request-time query)
CREATE INDEX IF NOT EXISTS idx_learnings_last_observed
  ON v2_user_learnings (user_id, last_observed_at DESC)
  WHERE active = true;
