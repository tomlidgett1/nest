ALTER TABLE public.imessage_users
    ADD COLUMN IF NOT EXISTS google_email TEXT;

CREATE INDEX IF NOT EXISTS idx_imessage_users_google_email
    ON public.imessage_users (google_email);
