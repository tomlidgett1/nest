-- ============================================================
-- RAG v2 Migration: HNSW index, stored tsvector, RRF scoring
-- ============================================================

-- 1. Replace IVFFlat with HNSW for ~95% recall (up from ~1%)
-- NOTE: Run step 1 separately with a long timeout if you have many embeddings.
-- The CONCURRENTLY option builds the index without blocking writes and avoids
-- the default statement timeout. Run this one statement on its own first:
--
--   SET statement_timeout = '0';
--   DROP INDEX IF EXISTS idx_search_embeddings_vector_ivfflat;
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_embeddings_vector_hnsw
--       ON search_embeddings
--       USING hnsw (embedding halfvec_cosine_ops)
--       WITH (m = 16, ef_construction = 200);
--
-- Then run everything below (from step 2 onward).

DROP INDEX IF EXISTS idx_search_embeddings_vector_ivfflat;
CREATE INDEX IF NOT EXISTS idx_search_embeddings_vector_hnsw
    ON search_embeddings
    USING hnsw (embedding halfvec_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- 2. Add stored tsvector column for fast lexical search (no more per-query computation)
ALTER TABLE search_documents
    ADD COLUMN IF NOT EXISTS fts_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector(
            'english',
            coalesce(title, '') || ' ' ||
            coalesce(summary_text, '') || ' ' ||
            coalesce(chunk_text, '')
        )
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_search_documents_fts
    ON search_documents USING gin(fts_vector);

-- 3. Replace hybrid_search_documents with Reciprocal Rank Fusion + time decay
CREATE OR REPLACE FUNCTION hybrid_search_documents(
    query_text TEXT,
    query_embedding halfvec(3072),
    match_count INT DEFAULT 30,
    source_filters TEXT[] DEFAULT NULL,
    min_semantic_score FLOAT DEFAULT 0.28
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '12s'
AS $$
BEGIN
    RETURN QUERY
    WITH semantic AS (
        SELECT
            d.id,
            (1 - (e.embedding <=> query_embedding))::float AS score,
            ROW_NUMBER() OVER (
                ORDER BY e.embedding <=> query_embedding
            ) AS rank
        FROM search_embeddings e
        JOIN search_documents d ON d.id = e.document_id
        WHERE d.user_id = auth.uid()
          AND e.user_id = auth.uid()
          AND d.is_deleted = FALSE
          AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
          AND (1 - (e.embedding <=> query_embedding)) >= min_semantic_score
        ORDER BY e.embedding <=> query_embedding
        LIMIT match_count
    ),
    lexical AS (
        SELECT
            d.id,
            ts_rank_cd(d.fts_vector, plainto_tsquery('english', query_text))::float AS score,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(d.fts_vector, plainto_tsquery('english', query_text)) DESC
            ) AS rank
        FROM search_documents d
        WHERE d.user_id = auth.uid()
          AND d.is_deleted = FALSE
          AND (source_filters IS NULL OR d.source_type = ANY(source_filters))
          AND d.fts_vector @@ plainto_tsquery('english', query_text)
        ORDER BY ts_rank_cd(d.fts_vector, plainto_tsquery('english', query_text)) DESC
        LIMIT match_count
    ),
    combined AS (
        SELECT
            COALESCE(s.id, l.id) AS doc_id,
            COALESCE(s.score, 0)::float AS sem_score,
            COALESCE(l.score, 0)::float AS lex_score,
            COALESCE(s.rank, 9999) AS sem_rank,
            COALESCE(l.rank, 9999) AS lex_rank
        FROM semantic s
        FULL OUTER JOIN lexical l ON s.id = l.id
    )
    SELECT
        d.id AS document_id,
        d.source_type,
        d.source_id,
        d.title,
        d.summary_text,
        d.chunk_text,
        d.metadata,
        c.sem_score AS semantic_score,
        c.lex_score AS lexical_score,
        (
            (1.0 / (60 + c.sem_rank)) + (1.0 / (60 + c.lex_rank))
        )::float
        * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - d.created_at)) / 86400.0 * 0.003))::float
        AS fused_score
    FROM combined c
    JOIN search_documents d ON d.id = c.doc_id
    WHERE d.user_id = auth.uid()
      AND d.is_deleted = FALSE
    ORDER BY fused_score DESC
    LIMIT match_count;
END;
$$;

-- 4. Update pure semantic search to use HNSW (no config needed, just lower threshold)
CREATE OR REPLACE FUNCTION match_search_documents(
    query_embedding halfvec(3072),
    match_count INT DEFAULT 30,
    source_filters TEXT[] DEFAULT NULL,
    min_score FLOAT DEFAULT 0.28
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
