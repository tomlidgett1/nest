-- Track whether we've done a full identity-based PDL enrichment (name+email+phone).
-- Prevents re-calling PDL on every message after the user connects their Google account.

ALTER TABLE public.imessage_users
  ADD COLUMN IF NOT EXISTS pdl_identity_enriched BOOLEAN NOT NULL DEFAULT false;
