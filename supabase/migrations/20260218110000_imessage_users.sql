-- iMessage user onboarding table
-- Maps phone numbers to Supabase auth users for the iMessage bridge

CREATE TABLE IF NOT EXISTS public.imessage_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'onboarding', 'active')),
    onboarding_token UUID NOT NULL DEFAULT gen_random_uuid(),
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.imessage_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.imessage_users
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_imessage_users_phone
    ON public.imessage_users (phone_number);

CREATE INDEX IF NOT EXISTS idx_imessage_users_status
    ON public.imessage_users (status);

CREATE INDEX IF NOT EXISTS idx_imessage_users_token
    ON public.imessage_users (onboarding_token);
