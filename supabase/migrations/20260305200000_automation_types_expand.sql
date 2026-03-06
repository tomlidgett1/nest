-- Expand automation_type CHECK to support new automations
ALTER TABLE user_automations DROP CONSTRAINT IF EXISTS user_automations_automation_type_check;
ALTER TABLE user_automations ADD CONSTRAINT user_automations_automation_type_check
    CHECK (automation_type IN (
        'email_summary',
        'meeting_prep',
        'weekly_digest',
        'follow_up_nudge',
        'daily_wrap'
    ));
