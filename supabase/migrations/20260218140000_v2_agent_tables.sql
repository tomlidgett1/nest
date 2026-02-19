-- ============================================================
-- V2 Agent Architecture Tables
-- Multi-agent chatbot (Interaction Agent + Execution Agents)
-- ============================================================

-- ── EXECUTION AGENTS ─────────────────────────────────────────
create table if not exists v2_agents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid(),

    name text not null,
    agent_type text not null
        check (agent_type in ('email', 'meeting_search')),

    system_prompt text not null,
    tools text[] not null default '{}',

    meeting_id uuid,

    status text default 'active'
        check (status in ('active', 'dormant', 'archived')),
    last_active_at timestamptz default now(),

    created_at timestamptz default now()
);

create index if not exists idx_v2_agents_user
    on v2_agents(user_id, status);

-- ── AGENT MESSAGE HISTORY (persistent per-agent memory) ──────
create table if not exists v2_agent_messages (
    id uuid primary key default gen_random_uuid(),
    agent_id uuid not null references v2_agents(id) on delete cascade,

    role text not null
        check (role in ('user', 'assistant', 'tool_call', 'tool_result')),
    content text not null,
    tool_name text,

    created_at timestamptz default now()
);

create index if not exists idx_v2_agent_msgs
    on v2_agent_messages(agent_id, created_at);

-- ── USER ↔ INTERACTION AGENT CHAT HISTORY ────────────────────
create table if not exists v2_chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid(),

    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null,

    agents_used uuid[] default '{}',

    created_at timestamptz default now()
);

create index if not exists idx_v2_chat
    on v2_chat_messages(user_id, created_at desc);

-- ── TRIGGERS ─────────────────────────────────────────────────
create table if not exists v2_triggers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid(),
    agent_id uuid references v2_agents(id),

    trigger_type text not null
        check (trigger_type in ('new_email', 'calendar_start')),

    email_from_filter text,
    email_subject_filter text,

    minutes_before integer default 1,
    attendee_match text[],

    action_description text not null,

    active boolean default true,
    last_fired_at timestamptz,

    created_at timestamptz default now()
);

create index if not exists idx_v2_triggers_active
    on v2_triggers(trigger_type, active) where active = true;

-- ── RLS ──────────────────────────────────────────────────────
alter table v2_agents enable row level security;
alter table v2_agent_messages enable row level security;
alter table v2_chat_messages enable row level security;
alter table v2_triggers enable row level security;

create policy "v2_agents_own_data" on v2_agents
    for all using (user_id = auth.uid());

create policy "v2_chat_messages_own_data" on v2_chat_messages
    for all using (user_id = auth.uid());

create policy "v2_triggers_own_data" on v2_triggers
    for all using (user_id = auth.uid());

create policy "v2_agent_messages_own_data" on v2_agent_messages
    for all using (
        agent_id in (select id from v2_agents where user_id = auth.uid())
    );

-- ── REALTIME (for trigger-pushed messages) ───────────────────
alter publication supabase_realtime add table v2_chat_messages;

-- ── pg_cron: trigger checker every minute ────────────────────
-- Uncomment and adjust the URL once the v2-trigger function is deployed:
--
-- select cron.schedule(
--     'v2-trigger-check',
--     '* * * * *',
--     $$
--     select net.http_post(
--         url := current_setting('app.settings.supabase_url') || '/functions/v1/v2-trigger',
--         headers := jsonb_build_object(
--             'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--             'Content-Type', 'application/json'
--         ),
--         body := '{}'::jsonb
--     );
--     $$
-- );
