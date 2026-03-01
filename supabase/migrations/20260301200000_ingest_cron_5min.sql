-- Schedule ingest-cron every 5 minutes for near-real-time email/calendar/notes ingestion.
-- Incremental mode: checks last 3 days of email, 7 days of calendar, 1 day of notes.
-- Lightweight: ~50 threads max per run, only processes new/changed content.

SELECT cron.schedule(
    'ingest-cron-5min',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://ynoidbjupfcaaymzbtic.supabase.co/functions/v1/ingest-cron',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlub2lkYmp1cGZjYWF5bXpidGljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTEyODYyMiwiZXhwIjoyMDg2NzA0NjIyfQ.RHDlgzWK6V_zUa3zkTtfSGWdI24kqHpRZY9iY_tFOeU',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);
