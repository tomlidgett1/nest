-- Cache People Data Labs enrichment result on imessage_users.
-- Populated on first contact so the onboarding chat can greet them by name/role.

ALTER TABLE public.imessage_users
  ADD COLUMN IF NOT EXISTS pdl_profile JSONB;
