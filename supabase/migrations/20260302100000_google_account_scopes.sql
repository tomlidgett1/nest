-- Add scopes tracking to user_google_accounts for incremental Google OAuth.

ALTER TABLE user_google_accounts
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';

-- Backfill existing rows with the base scopes granted at signup.
UPDATE user_google_accounts
SET scopes = ARRAY[
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly'
]
WHERE scopes = '{}';
