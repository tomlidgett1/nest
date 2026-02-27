-- Add open_loops and emotional_arc to v2_user_memory
-- for narrative memory: tracking unresolved conversation threads
-- and mood trends across sessions.

ALTER TABLE v2_user_memory
ADD COLUMN IF NOT EXISTS open_loops JSONB DEFAULT '[]'::jsonb;

ALTER TABLE v2_user_memory
ADD COLUMN IF NOT EXISTS emotional_arc TEXT;
