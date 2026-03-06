-- Custom automations: allow user-defined automations via chat
-- Adds 'custom' type, relaxes UNIQUE for multiple custom rows, adds label column

-- 1. Drop and re-add CHECK to include 'custom'
ALTER TABLE user_automations DROP CONSTRAINT IF EXISTS user_automations_automation_type_check;
ALTER TABLE user_automations ADD CONSTRAINT user_automations_automation_type_check
    CHECK (automation_type IN (
        'email_summary', 'meeting_prep', 'weekly_digest', 'follow_up_nudge',
        'daily_wrap', 'email_monitor', 'relationship_radar', 'meeting_intel',
        'custom'
    ));

-- 2. Replace UNIQUE(user_id, automation_type) with partial index
--    Built-ins: still one per type. Custom: unlimited per user.
ALTER TABLE user_automations DROP CONSTRAINT IF EXISTS user_automations_user_id_automation_type_key;
DROP INDEX IF EXISTS user_automations_user_id_automation_type_key;
DROP INDEX IF EXISTS user_automations_builtin_unique;
CREATE UNIQUE INDEX user_automations_builtin_unique
    ON user_automations(user_id, automation_type)
    WHERE automation_type != 'custom';

-- 3. Add label column for custom automations (short user-facing name)
ALTER TABLE user_automations ADD COLUMN IF NOT EXISTS label TEXT;
