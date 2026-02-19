-- Migration: Add archive (soft-delete) support for notes
-- Run this in Supabase SQL Editor if your database was created before this feature.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(user_id, is_archived);
