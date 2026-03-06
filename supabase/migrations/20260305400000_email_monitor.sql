-- Replace bill_reminder with email_monitor (hourly proactive email scanner)

-- Drop old constraint first to allow the update
ALTER TABLE user_automations DROP CONSTRAINT IF EXISTS user_automations_automation_type_check;

-- Migrate any existing bill_reminder rows to email_monitor
UPDATE user_automations SET automation_type = 'email_monitor' WHERE automation_type = 'bill_reminder';

-- Add the new constraint
ALTER TABLE user_automations ADD CONSTRAINT user_automations_automation_type_check
    CHECK (automation_type IN (
        'email_summary',
        'meeting_prep',
        'weekly_digest',
        'follow_up_nudge',
        'daily_wrap',
        'email_monitor',
        'relationship_radar',
        'meeting_intel'
    ));
