-- Add timezone column to user_google_accounts
-- Populated from Google Calendar settings on account connection.
-- Falls back to PDL location or Australia/Sydney if unavailable.

ALTER TABLE user_google_accounts
    ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN user_google_accounts.timezone IS 'IANA timezone from Google Calendar settings, e.g. Australia/Sydney';
