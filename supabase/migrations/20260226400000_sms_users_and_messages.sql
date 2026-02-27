-- SMS user and message tracking tables.
-- Mirrors the iMessage user/outbound pattern but for SMS via MobileMessage API.

-- ── SMS Users ────────────────────────────────────────────────
-- Maps SMS phone numbers to Supabase auth users.
-- Separate from imessage_users to keep channels independent.

CREATE TABLE IF NOT EXISTS public.sms_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'unsubscribed')),
    onboarding_token UUID NOT NULL DEFAULT gen_random_uuid(),
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.sms_users
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sms_users_phone
    ON public.sms_users (phone_number);

CREATE INDEX IF NOT EXISTS idx_sms_users_user_id
    ON public.sms_users (user_id);

CREATE INDEX IF NOT EXISTS idx_sms_users_status
    ON public.sms_users (status);

-- ── SMS Messages ─────────────────────────────────────────────
-- Tracks all inbound and outbound SMS for audit, debugging, and delivery tracking.

CREATE TABLE IF NOT EXISTS public.sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sms_user_id UUID REFERENCES public.sms_users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent'
        CHECK (status IN ('sent', 'delivered', 'failed', 'received')),
    mobile_message_id TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.sms_messages
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sms_messages_user
    ON public.sms_messages (sms_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone
    ON public.sms_messages (phone_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_mobile_id
    ON public.sms_messages (mobile_message_id)
    WHERE mobile_message_id IS NOT NULL;
