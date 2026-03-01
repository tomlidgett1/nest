DO $$
BEGIN
  IF to_regclass('public.imessage_users') IS NOT NULL THEN
    ALTER TABLE public.imessage_users
      ADD COLUMN IF NOT EXISTS testing BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF to_regclass('public.imessage_uses') IS NOT NULL THEN
    ALTER TABLE public.imessage_uses
      ADD COLUMN IF NOT EXISTS testing BOOLEAN NOT NULL DEFAULT false;
  END IF;
END
$$;
