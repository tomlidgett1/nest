-- Allow 'strava' as a valid task_type in ingestion_tasks
ALTER TABLE public.ingestion_tasks
    DROP CONSTRAINT IF EXISTS ingestion_tasks_task_type_check;

ALTER TABLE public.ingestion_tasks
    ADD CONSTRAINT ingestion_tasks_task_type_check
    CHECK (task_type IN ('notes', 'emails', 'calendar', 'strava'));

-- Allow strava source types in search_documents
ALTER TABLE public.search_documents
    DROP CONSTRAINT IF EXISTS search_documents_source_type_check;

ALTER TABLE public.search_documents
    ADD CONSTRAINT search_documents_source_type_check
    CHECK (source_type IN (
        'note_summary', 'note_chunk', 'utterance_chunk',
        'email_summary', 'email_chunk',
        'calendar_summary', 'calendar_chunk',
        'strava_summary', 'strava_chunk'
    ));
