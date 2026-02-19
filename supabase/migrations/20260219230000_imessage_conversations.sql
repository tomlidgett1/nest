-- ============================================================
-- iMessage Conversations
-- Groups messages into conversation sessions.
-- A new conversation row is created when there is a >10 minute
-- gap since the last message in the previous conversation.
-- Messages are stored as a JSONB array on the row.
-- ============================================================

create table if not exists imessage_conversations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null,
    phone_number text,

    messages    jsonb not null default '[]'::jsonb,
    -- Each element: { "role": "user"|"assistant"|"system", "content": "...", "ts": "<ISO>" }

    started_at  timestamptz not null default now(),
    last_message_at timestamptz not null default now(),

    created_at  timestamptz not null default now()
);

create index if not exists idx_imsg_conv_user
    on imessage_conversations(user_id, last_message_at desc);

create index if not exists idx_imsg_conv_phone
    on imessage_conversations(phone_number, last_message_at desc);

-- RLS (service role key bypasses RLS automatically)
alter table imessage_conversations enable row level security;

create policy "imessage_conversations_own_data" on imessage_conversations
    for all using (user_id = auth.uid());
