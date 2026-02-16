-- Nest: Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- This creates all tables, indexes, RLS policies, and triggers.

-- ============================================================
-- 1. TABLES
-- ============================================================

-- pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles (auto-created on signup via trigger)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Folders
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color_hex TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    raw_notes TEXT NOT NULL DEFAULT '',
    enhanced_notes TEXT,
    calendar_event_id TEXT,
    attendees TEXT[] DEFAULT '{}',
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    share_url TEXT,
    status TEXT NOT NULL DEFAULT 'inProgress',
    note_type TEXT NOT NULL DEFAULT 'meeting',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    linked_note_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Search document canonical store (semantic + lexical retrieval unit)
CREATE TABLE search_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (
        source_type IN (
            'note_summary',
            'note_chunk',
            'utterance_chunk',
            'email_summary',
            'email_chunk',
            'calendar_summary'
        )
    ),
    source_id TEXT NOT NULL,
    parent_id UUID REFERENCES search_documents(id) ON DELETE CASCADE,
    title TEXT,
    summary_text TEXT,
    chunk_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    token_count INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT NOT NULL DEFAULT '',
    retention_policy TEXT NOT NULL DEFAULT 'retain_forever',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embeddings for semantic retrieval (OpenAI text-embedding-3-large = 3072 dims)
CREATE TABLE search_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
    embedding vector(3072) NOT NULL,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    model_version TEXT NOT NULL DEFAULT '2024-01',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, embedding_model, model_version)
);

-- Encrypted email body storage (for semantic retrieval on email content)
CREATE TABLE email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    gmail_message_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    history_id TEXT,
    subject TEXT NOT NULL DEFAULT '',
    from_email TEXT NOT NULL DEFAULT '',
    to_emails TEXT[] NOT NULL DEFAULT '{}',
    cc_emails TEXT[] NOT NULL DEFAULT '{}',
    label_ids TEXT[] NOT NULL DEFAULT '{}',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    body_ciphertext TEXT NOT NULL DEFAULT '',
    body_iv TEXT NOT NULL DEFAULT '',
    body_tag TEXT NOT NULL DEFAULT '',
    body_preview TEXT NOT NULL DEFAULT '',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, gmail_message_id)
);

-- Search/indexing orchestration and observability
CREATE TABLE search_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN ('backfill', 'incremental', 'reindex')),
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    source_type TEXT,
    source_id TEXT,
    progress_percent REAL NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Utterances (transcript segments)
CREATE TABLE utterances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('mic', 'system')),
    text TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note-Tag junction (many-to-many)
CREATE TABLE note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Style Profiles (email writing style)
CREATE TABLE style_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_email TEXT NOT NULL,
    greetings JSONB NOT NULL DEFAULT '[]',
    sign_offs JSONB NOT NULL DEFAULT '[]',
    signature_name TEXT NOT NULL DEFAULT '',
    average_sentence_length INTEGER NOT NULL DEFAULT 12,
    formality_score REAL NOT NULL DEFAULT 0.5,
    uses_contractions BOOLEAN NOT NULL DEFAULT TRUE,
    uses_emoji BOOLEAN NOT NULL DEFAULT FALSE,
    prefers_bullet_points BOOLEAN NOT NULL DEFAULT FALSE,
    common_phrases JSONB NOT NULL DEFAULT '[]',
    avoided_phrases JSONB NOT NULL DEFAULT '[]',
    locale TEXT NOT NULL DEFAULT 'en-AU',
    style_summary TEXT NOT NULL DEFAULT '',
    sample_excerpts JSONB NOT NULL DEFAULT '[]',
    emails_analysed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_email)
);

-- Contact Rules (per-contact email instructions)
CREATE TABLE contact_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    match_type TEXT NOT NULL CHECK (match_type IN ('email', 'domain')),
    match_value TEXT NOT NULL,
    display_name TEXT,
    instructions TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Preferences
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    capture_system_audio BOOLEAN NOT NULL DEFAULT TRUE,
    capture_mic_audio BOOLEAN NOT NULL DEFAULT TRUE,
    launch_at_login BOOLEAN NOT NULL DEFAULT FALSE,
    global_email_instructions TEXT,
    recent_one_off_instructions JSONB DEFAULT '[]',
    default_variant_count INTEGER NOT NULL DEFAULT 3,
    auto_suggest_actions BOOLEAN NOT NULL DEFAULT TRUE,
    style_profile_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- To-Dos (AI-extracted and manual tasks)
CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date TIMESTAMPTZ,
    priority TEXT NOT NULL DEFAULT 'medium',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_id TEXT,
    source_title TEXT,
    source_snippet TEXT,
    sender_email   TEXT,                     -- email sender address (for exclusion rules)
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- App Config (shared API keys, read-only for clients)
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Google OAuth token vault (per-user refresh token for server-side token broker)
CREATE TABLE google_oauth_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_folder_id ON notes(folder_id);
CREATE INDEX idx_notes_created_at ON notes(user_id, created_at DESC);
CREATE INDEX idx_notes_status ON notes(user_id, status);
CREATE INDEX idx_notes_note_type ON notes(user_id, note_type);
CREATE INDEX idx_utterances_note_id ON utterances(note_id);
CREATE INDEX idx_utterances_user_id ON utterances(user_id);
CREATE INDEX idx_search_documents_user_type ON search_documents(user_id, source_type);
CREATE INDEX idx_search_documents_source ON search_documents(user_id, source_id);
CREATE INDEX idx_search_documents_parent_id ON search_documents(parent_id);
CREATE INDEX idx_search_documents_metadata_gin ON search_documents USING gin(metadata);
CREATE INDEX idx_search_embeddings_user_id ON search_embeddings(user_id);
CREATE INDEX idx_search_embeddings_doc_id ON search_embeddings(document_id);
CREATE INDEX idx_search_embeddings_vector_ivfflat ON search_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_email_messages_user_thread ON email_messages(user_id, thread_id);
CREATE INDEX idx_email_messages_user_sent_at ON email_messages(user_id, sent_at DESC);
CREATE INDEX idx_search_jobs_user_status ON search_jobs(user_id, status);
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
CREATE INDEX idx_style_profiles_user_id ON style_profiles(user_id);
CREATE INDEX idx_contact_rules_user_id ON contact_rules(user_id);
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_user_completed ON todos(user_id, is_completed);
CREATE INDEX idx_todos_source ON todos(user_id, source_type, source_id);
CREATE INDEX idx_google_oauth_tokens_user_id ON google_oauth_tokens(user_id);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE utterances ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid());

-- User-owned tables: full CRUD
CREATE POLICY folders_all ON folders FOR ALL USING (user_id = auth.uid());
CREATE POLICY tags_all ON tags FOR ALL USING (user_id = auth.uid());
CREATE POLICY notes_all ON notes FOR ALL USING (user_id = auth.uid());
CREATE POLICY utterances_all ON utterances FOR ALL USING (user_id = auth.uid());
CREATE POLICY style_profiles_all ON style_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY contact_rules_all ON contact_rules FOR ALL USING (user_id = auth.uid());
CREATE POLICY user_preferences_all ON user_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY search_documents_all ON search_documents FOR ALL USING (user_id = auth.uid());
CREATE POLICY search_embeddings_all ON search_embeddings FOR ALL USING (user_id = auth.uid());
CREATE POLICY email_messages_all ON email_messages FOR ALL USING (user_id = auth.uid());
CREATE POLICY search_jobs_all ON search_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY todos_all ON todos FOR ALL USING (user_id = auth.uid());
CREATE POLICY google_oauth_tokens_all ON google_oauth_tokens FOR ALL USING (user_id = auth.uid());

-- Note-tags: accessible if the user owns the note
CREATE POLICY note_tags_all ON note_tags FOR ALL
    USING (EXISTS (SELECT 1 FROM notes WHERE notes.id = note_tags.note_id AND notes.user_id = auth.uid()));

-- App config: read-only for all authenticated users
CREATE POLICY app_config_select ON app_config FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 4. TRIGGERS
-- ============================================================

-- Auto-create profile + preferences on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    );
    INSERT INTO user_preferences (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON style_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON contact_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON search_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON email_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON search_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON todos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON google_oauth_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 5. RPC FUNCTIONS (HYBRID + SEMANTIC SEARCH)
-- ============================================================

CREATE OR REPLACE FUNCTION match_search_documents(
    query_embedding vector(3072),
    match_count INT DEFAULT 24,
    source_filters TEXT[] DEFAULT NULL,
    min_score FLOAT DEFAULT 0.55
)
RETURNS TABLE (
    document_id UUID,
    source_type TEXT,
    source_id TEXT,
    title TEXT,
    summary_text TEXT,
    chunk_text TEXT,
    metadata JSONB,
    semantic_score FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        d.id AS document_id,
        d.source_type,
        d.source_id,
        d.title,
        d.summary_text,
        d.chunk_text,
        d.metadata,
        (1 - (e.embedding <=> query_embedding))::float AS semantic_score
    FROM search_embeddings e
    JOIN search_documents d ON d.id = e.document_id
    WHERE d.user_id = auth.uid()
      AND e.user_id = auth.uid()
      AND d.is_deleted = FALSE
      AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
      AND (1 - (e.embedding <=> query_embedding)) >= min_score
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_documents(
    query_text TEXT,
    query_embedding vector(3072),
    match_count INT DEFAULT 24,
    source_filters TEXT[] DEFAULT NULL,
    min_semantic_score FLOAT DEFAULT 0.45
)
RETURNS TABLE (
    document_id UUID,
    source_type TEXT,
    source_id TEXT,
    title TEXT,
    summary_text TEXT,
    chunk_text TEXT,
    metadata JSONB,
    semantic_score FLOAT,
    lexical_score FLOAT,
    fused_score FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH lexical AS (
        SELECT
            d.id,
            ts_rank(
                to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.summary_text, '') || ' ' || coalesce(d.chunk_text, '')),
                plainto_tsquery('english', query_text)
            )::float AS lexical_score
        FROM search_documents d
        WHERE d.user_id = auth.uid()
          AND d.is_deleted = FALSE
          AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
    ),
    semantic AS (
        SELECT
            d.id,
            (1 - (e.embedding <=> query_embedding))::float AS semantic_score
        FROM search_embeddings e
        JOIN search_documents d ON d.id = e.document_id
        WHERE d.user_id = auth.uid()
          AND e.user_id = auth.uid()
          AND d.is_deleted = FALSE
          AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
          AND (1 - (e.embedding <=> query_embedding)) >= min_semantic_score
    )
    SELECT
        d.id AS document_id,
        d.source_type,
        d.source_id,
        d.title,
        d.summary_text,
        d.chunk_text,
        d.metadata,
        COALESCE(s.semantic_score, 0)::float AS semantic_score,
        COALESCE(l.lexical_score, 0)::float AS lexical_score,
        (COALESCE(s.semantic_score, 0) * 0.8 + COALESCE(l.lexical_score, 0) * 0.2)::float AS fused_score
    FROM search_documents d
    LEFT JOIN semantic s ON s.id = d.id
    LEFT JOIN lexical l ON l.id = d.id
    WHERE d.user_id = auth.uid()
      AND d.is_deleted = FALSE
      AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
      AND (COALESCE(s.semantic_score, 0) > 0 OR COALESCE(l.lexical_score, 0) > 0)
    ORDER BY fused_score DESC
    LIMIT match_count;
$$;

-- ============================================================
-- 6. SEED DATA (API Keys — replace with your actual keys)
-- ============================================================

INSERT INTO app_config (key, value) VALUES
    ('deepgram_api_key', 'YOUR_DEEPGRAM_KEY'),
    ('openai_api_key', 'YOUR_OPENAI_KEY'),
    ('anthropic_api_key', 'YOUR_ANTHROPIC_KEY');
