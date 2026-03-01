-- Group chat customer acquisition tables.
-- Three tables: group_prospects (master dedup), group_chats (registry),
-- group_chat_members (junction).

-- ── Master prospect table ────────────────────────────────────
-- One row per phone number, deduplicated across ALL group chats.
-- Stores PDL enrichment and tracks conversion funnel.

CREATE TABLE IF NOT EXISTS public.group_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    display_name TEXT,
    pdl_profile JSONB,
    pdl_enriched_at TIMESTAMPTZ,
    pdl_enrichment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (pdl_enrichment_status IN ('pending', 'enriching', 'success', 'not_found', 'error')),
    is_nest_user BOOLEAN NOT NULL DEFAULT false,
    imessage_user_id UUID REFERENCES public.imessage_users(id) ON DELETE SET NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_interaction_at TIMESTAMPTZ,
    interaction_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.group_prospects
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_group_prospects_phone ON public.group_prospects(phone_number);
CREATE INDEX idx_group_prospects_pending ON public.group_prospects(pdl_enrichment_status)
    WHERE pdl_enrichment_status = 'pending';

-- ── Group chat registry ──────────────────────────────────────
-- One row per group chat Nest has been added to.

CREATE TABLE IF NOT EXISTS public.group_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_guid TEXT NOT NULL UNIQUE,
    display_name TEXT,
    participant_count INTEGER NOT NULL DEFAULT 0,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    group_vibe TEXT DEFAULT 'mixed'
        CHECK (group_vibe IN ('banter', 'professional', 'planning', 'supportive', 'mixed')),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.group_chats
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_group_chats_guid ON public.group_chats(chat_guid);

-- ── Junction: prospects ↔ groups ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.group_chat_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_chat_id UUID NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES public.group_prospects(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ,
    message_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE(group_chat_id, prospect_id)
);

ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.group_chat_members
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_group_members_group ON public.group_chat_members(group_chat_id);
CREATE INDEX idx_group_members_prospect ON public.group_chat_members(prospect_id);
