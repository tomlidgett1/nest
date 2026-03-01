-- Track when the Nest signup link was last shared in a group chat.
-- Used to rate-limit link sharing: max once per 3 hours AND once per 50 messages.

ALTER TABLE public.group_chats
    ADD COLUMN IF NOT EXISTS last_nest_link_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS messages_since_link INTEGER NOT NULL DEFAULT 0;
