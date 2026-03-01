-- Fix v2_daily_briefing FK to auth.users — was missing ON DELETE CASCADE,
-- which blocked account deletion.
ALTER TABLE v2_daily_briefing
  DROP CONSTRAINT IF EXISTS v2_daily_briefing_user_id_fkey;

ALTER TABLE v2_daily_briefing
  ADD CONSTRAINT v2_daily_briefing_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
