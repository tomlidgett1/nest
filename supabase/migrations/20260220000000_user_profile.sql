-- Rich user profile built from Gmail, Calendar, PDL, and web signals.
-- Populated asynchronously by the profile-builder Edge Function after Google OAuth.

ALTER TABLE public.imessage_users
  ADD COLUMN IF NOT EXISTS user_profile JSONB,
  ADD COLUMN IF NOT EXISTS profile_built_at TIMESTAMPTZ;
