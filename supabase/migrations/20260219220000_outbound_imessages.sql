-- Queue for outbound iMessages that edge functions need to send.
-- The iMessage bridge polls this table and delivers pending messages.

CREATE TABLE IF NOT EXISTS public.outbound_imessages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

ALTER TABLE public.outbound_imessages ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON public.outbound_imessages
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_outbound_imessages_pending
    ON public.outbound_imessages (status, created_at)
    WHERE status = 'pending';
