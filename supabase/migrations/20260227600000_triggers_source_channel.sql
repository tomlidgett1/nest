-- Add source_channel to v2_triggers so reminders fire on the correct channel
ALTER TABLE v2_triggers
  ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'imessage'
  CHECK (source_channel IN ('imessage', 'sms'));

-- Also store the user's phone number for SMS delivery (so v2-trigger can send directly)
ALTER TABLE v2_triggers
  ADD COLUMN IF NOT EXISTS delivery_phone TEXT;

COMMENT ON COLUMN v2_triggers.source_channel IS 'Channel the reminder was created from (imessage or sms). Determines delivery method.';
COMMENT ON COLUMN v2_triggers.delivery_phone IS 'Phone number for SMS delivery. Null for iMessage (bridge resolves phone).';
