-- Add onboarding conversation tracking to imessage_users
-- Allows the bridge to maintain conversation history during the pre-signup flow

ALTER TABLE public.imessage_users
  ADD COLUMN IF NOT EXISTS onboard_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboard_count INTEGER NOT NULL DEFAULT 0;
