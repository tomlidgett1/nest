-- Persistent task queue for the ingestion pipeline.
-- Each row is an atomic, retry-safe unit of work.
-- The pipeline processes ONE task per Edge Function invocation,
-- guaranteeing completion even if individual invocations are killed.

CREATE TABLE IF NOT EXISTS public.ingestion_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('notes', 'emails', 'calendar')),
    params JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ingestion_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.ingestion_tasks
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ingestion_tasks_job_status
    ON public.ingestion_tasks (job_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_tasks_pending
    ON public.ingestion_tasks (status, created_at)
    WHERE status = 'pending';

-- Ensure ingestion_jobs has the google_email / is_primary columns
-- (may already exist from dashboard changes).
ALTER TABLE public.ingestion_jobs
    ADD COLUMN IF NOT EXISTS google_email TEXT,
    ADD COLUMN IF NOT EXISTS is_primary_account BOOLEAN;
