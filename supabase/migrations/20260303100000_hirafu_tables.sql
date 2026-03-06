-- ============================================================
-- Project Hirafu — Complete Database Schema
-- All tables prefixed with hirafu_ for clean separation from Nest.
-- Reuses auth.users, user_google_accounts, user_microsoft_accounts.
-- ============================================================

-- ── hirafu_users (phone → user mapping, onboarding state) ────

CREATE TABLE IF NOT EXISTS public.hirafu_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'pre_registered', 'active')),
    onboarding_token UUID NOT NULL DEFAULT gen_random_uuid(),
    display_name TEXT,
    onboard_messages JSONB DEFAULT '[]'::jsonb,
    onboard_count INTEGER NOT NULL DEFAULT 0,
    pdl_profile JSONB,
    user_profile JSONB,
    profile_built_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hirafu_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_users_service_role ON public.hirafu_users
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_users_phone
    ON public.hirafu_users (phone_number);

CREATE INDEX IF NOT EXISTS idx_hirafu_users_status
    ON public.hirafu_users (status);

CREATE INDEX IF NOT EXISTS idx_hirafu_users_token
    ON public.hirafu_users (onboarding_token);

CREATE INDEX IF NOT EXISTS idx_hirafu_users_user_id
    ON public.hirafu_users (user_id);

-- ── hirafu_chat_messages (conversation history) ──────────────

CREATE TABLE IF NOT EXISTS public.hirafu_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL DEFAULT 'imessage'
);

ALTER TABLE public.hirafu_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_chat_messages_own ON public.hirafu_chat_messages
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_chat_messages_service ON public.hirafu_chat_messages
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_chat_user_time
    ON public.hirafu_chat_messages (user_id, created_at DESC);

-- ── hirafu_user_memory (rolling summary, identity model) ─────

CREATE TABLE IF NOT EXISTS public.hirafu_user_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    summary TEXT NOT NULL DEFAULT '',
    writing_style TEXT,
    preferences JSONB DEFAULT '{}'::jsonb,
    message_count_at_summary INTEGER DEFAULT 0,
    open_loops JSONB DEFAULT '[]'::jsonb,
    emotional_arc TEXT,
    relationship_notes TEXT,
    key_moments JSONB DEFAULT '[]'::jsonb,
    identity_model JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hirafu_user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_user_memory_own ON public.hirafu_user_memory
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_user_memory_service ON public.hirafu_user_memory
    FOR ALL USING (true) WITH CHECK (true);

-- ── hirafu_user_learnings (discrete facts, preferences) ──────

CREATE TABLE IF NOT EXISTS public.hirafu_user_learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'preference', 'correction', 'fact', 'dislike',
        'contact_note', 'anticipation', 'commitment',
        'relationship', 'location'
    )),
    content TEXT NOT NULL,
    context TEXT,
    emotional_weight TEXT DEFAULT 'medium'
        CHECK (emotional_weight IN ('high', 'medium', 'low')),
    confidence REAL NOT NULL DEFAULT 0.7
        CHECK (confidence >= 0 AND confidence <= 1),
    source TEXT NOT NULL CHECK (source IN ('explicit', 'inferred', 'correction')),
    times_reinforced INTEGER NOT NULL DEFAULT 1,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT true,
    superseded_by UUID REFERENCES public.hirafu_user_learnings(id),
    target_date DATE,
    expires_after DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hirafu_user_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_user_learnings_own ON public.hirafu_user_learnings
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_user_learnings_service ON public.hirafu_user_learnings
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_learnings_user
    ON public.hirafu_user_learnings (user_id, active, category);

CREATE INDEX IF NOT EXISTS idx_hirafu_learnings_recent
    ON public.hirafu_user_learnings (user_id, last_observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirafu_learnings_commitments
    ON public.hirafu_user_learnings (user_id, target_date)
    WHERE active = true AND category = 'commitment';

-- ── hirafu_outbound_messages (iMessage delivery queue) ───────

CREATE TABLE IF NOT EXISTS public.hirafu_outbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

ALTER TABLE public.hirafu_outbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_outbound_service ON public.hirafu_outbound_messages
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_outbound_pending
    ON public.hirafu_outbound_messages (status, created_at)
    WHERE status = 'pending';

-- ── hirafu_conversations (sessioned conversation groups) ─────

CREATE TABLE IF NOT EXISTS public.hirafu_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    phone_number TEXT,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hirafu_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_conversations_own ON public.hirafu_conversations
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_conversations_service ON public.hirafu_conversations
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_conv_user
    ON public.hirafu_conversations (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_hirafu_conv_phone
    ON public.hirafu_conversations (phone_number, last_message_at DESC);

-- ── hirafu_pending_actions (confirmation gating) ─────────────

CREATE TABLE IF NOT EXISTS public.hirafu_pending_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
    action_type TEXT NOT NULL,
    tool_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    account_id UUID,
    human_summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'awaiting_confirmation'
        CHECK (status IN (
            'awaiting_confirmation', 'confirmed', 'cancelled',
            'expired', 'executed', 'failed'
        )),
    execution_result JSONB,
    idempotency_key TEXT NOT NULL
);

ALTER TABLE public.hirafu_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_pending_actions_own ON public.hirafu_pending_actions
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_pending_actions_service ON public.hirafu_pending_actions
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_pending_user_status
    ON public.hirafu_pending_actions (user_id, status)
    WHERE status = 'awaiting_confirmation';

CREATE INDEX IF NOT EXISTS idx_hirafu_pending_idempotency
    ON public.hirafu_pending_actions (idempotency_key);

-- ── hirafu_audit_events (observability) ──────────────────────

CREATE TABLE IF NOT EXISTS public.hirafu_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    trace_id TEXT NOT NULL
);

ALTER TABLE public.hirafu_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_audit_service ON public.hirafu_audit_events
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_audit_user
    ON public.hirafu_audit_events (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_hirafu_audit_trace
    ON public.hirafu_audit_events (trace_id);

CREATE INDEX IF NOT EXISTS idx_hirafu_audit_type
    ON public.hirafu_audit_events (event_type, timestamp DESC);

-- ── hirafu_triggers (proactive notifications) ────────────────

CREATE TABLE IF NOT EXISTS public.hirafu_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN ('new_email', 'calendar_start', 'cron', 'email_match')),
    email_from_filter TEXT,
    email_subject_filter TEXT,
    minutes_before INTEGER DEFAULT 1,
    attendee_match TEXT[],
    action_description TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    last_fired_at TIMESTAMPTZ,
    cron_expression TEXT,
    repeating BOOLEAN DEFAULT true,
    next_fire_at TIMESTAMPTZ,
    source_channel TEXT NOT NULL DEFAULT 'imessage'
        CHECK (source_channel IN ('imessage')),
    delivery_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hirafu_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_triggers_own ON public.hirafu_triggers
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY hirafu_triggers_service ON public.hirafu_triggers
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hirafu_triggers_active
    ON public.hirafu_triggers (trigger_type, active)
    WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_hirafu_triggers_cron
    ON public.hirafu_triggers (next_fire_at)
    WHERE active = true AND trigger_type = 'cron';

-- ── hirafu_daily_briefing (situational awareness) ────────────

CREATE TABLE IF NOT EXISTS public.hirafu_daily_briefing (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    briefing_date DATE NOT NULL,
    briefing TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sources JSONB DEFAULT '[]'::jsonb
);

ALTER TABLE public.hirafu_daily_briefing ENABLE ROW LEVEL SECURITY;

CREATE POLICY hirafu_briefing_own ON public.hirafu_daily_briefing
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY hirafu_briefing_service ON public.hirafu_daily_briefing
    FOR ALL USING (true) WITH CHECK (true);
