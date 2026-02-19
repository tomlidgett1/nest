-- Ingestion job tracking for server-side data pipeline
CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    mode TEXT NOT NULL DEFAULT 'full'
        CHECK (mode IN ('full', 'incremental')),
    sources_requested TEXT[] DEFAULT '{}',
    progress JSONB DEFAULT '{}',
    total_documents INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    total_embeddings INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.ingestion_jobs
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_user ON public.ingestion_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON public.ingestion_jobs (status);

-- Person entities table for entity resolution
CREATE TABLE IF NOT EXISTS public.person_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canonical_name TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    email_addresses TEXT[] DEFAULT '{}',
    role TEXT,
    organisation TEXT,
    last_seen_at TIMESTAMPTZ,
    mention_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.person_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.person_entities
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_person_entities_user ON public.person_entities (user_id);
CREATE INDEX IF NOT EXISTS idx_person_entities_name ON public.person_entities (user_id, canonical_name);

-- Action items extracted during ingestion
CREATE TABLE IF NOT EXISTS public.action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    assignee TEXT,
    description TEXT NOT NULL,
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'completed', 'dismissed')),
    extracted_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.action_items
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_action_items_user ON public.action_items (user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_source ON public.action_items (source_type, source_id);

-- Expand source_type check to include calendar_chunk
ALTER TABLE public.search_documents DROP CONSTRAINT IF EXISTS search_documents_source_type_check;
ALTER TABLE public.search_documents ADD CONSTRAINT search_documents_source_type_check
    CHECK (source_type IN (
        'note_summary', 'note_chunk', 'utterance_chunk',
        'email_summary', 'email_chunk',
        'calendar_summary', 'calendar_chunk'
    ));

-- Add unique constraint on search_documents for upsert-by-content-hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_documents_user_content_hash
    ON public.search_documents (user_id, content_hash)
    WHERE content_hash != '' AND content_hash IS NOT NULL;
