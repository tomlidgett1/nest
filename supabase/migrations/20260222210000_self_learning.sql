-- Self-learning system: persistent learnings + relationship memory + identity model
--
-- Layer 1: v2_user_learnings — discrete facts, preferences, corrections
-- Layer 2: relationship_notes + key_moments on v2_user_memory
-- Layer 3: identity_model on v2_user_memory

-- ── Layer 1: User Learnings Table ──────────────────────────────

CREATE TABLE IF NOT EXISTS v2_user_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  category TEXT NOT NULL CHECK (category IN (
    'preference',
    'correction',
    'fact',
    'dislike',
    'contact_note',
    'anticipation'
  )),

  content TEXT NOT NULL,
  context TEXT,
  emotional_weight TEXT DEFAULT 'medium' CHECK (emotional_weight IN ('high', 'medium', 'low')),

  confidence REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('explicit', 'inferred', 'correction')),
  times_reinforced INTEGER NOT NULL DEFAULT 1,

  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES v2_user_learnings(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learnings_user ON v2_user_learnings(user_id, active, category);
CREATE INDEX IF NOT EXISTS idx_learnings_recent ON v2_user_learnings(user_id, last_observed_at DESC);

-- ── Layer 2: Relationship Memory ───────────────────────────────

ALTER TABLE v2_user_memory
ADD COLUMN IF NOT EXISTS relationship_notes TEXT,
ADD COLUMN IF NOT EXISTS key_moments JSONB DEFAULT '[]'::jsonb;

-- ── Layer 3: Identity Model ────────────────────────────────────

ALTER TABLE v2_user_memory
ADD COLUMN IF NOT EXISTS identity_model JSONB;

-- ── Profile Evolution ──────────────────────────────────────────

ALTER TABLE imessage_users
ADD COLUMN IF NOT EXISTS profile_deltas JSONB DEFAULT '[]'::jsonb;
