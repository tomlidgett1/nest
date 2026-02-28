-- Enable pg_cron and pg_net extensions (may already exist)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role (required for pg_cron)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule: call v2-trigger every 60 seconds to fire due SMS cron reminders.
-- The edge function checks v2_triggers for due items and sends SMS directly.
-- iMessage reminders are handled by the Python bridge's own 60s poller.
SELECT cron.schedule(
    'sms-cron-reminders',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://ynoidbjupfcaaymzbtic.supabase.co/functions/v1/v2-trigger',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlub2lkYmp1cGZjYWF5bXpidGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTEyODYyMiwiZXhwIjoyMDg2NzA0NjIyfQ.RHDlgzWK6V_zUa3zkTtfSGWdI24kqHpRZY9iY_tFOeU',
            'Content-Type', 'application/json'
        ),
        body := '{"action": "check_cron_reminders"}'::jsonb
    );
    $$
);
