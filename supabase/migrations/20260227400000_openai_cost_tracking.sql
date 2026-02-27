-- ── OpenAI Cost Tracking ─────────────────────────────────────────────────────
-- Two-table design:
--   1. openai_api_logs  — one row per API call (raw audit trail)
--   2. openai_daily_usage — one row per (user, date), auto-maintained by trigger
--
-- Usage flow:
--   App inserts into openai_api_logs → trigger fires → openai_daily_usage upserted
--   New day = new row. Same day = totals accumulated on existing row.

-- ── 1. Raw log table ─────────────────────────────────────────────────────────

create table if not exists openai_api_logs (
  id             uuid        default gen_random_uuid() primary key,
  created_at     timestamptz default now() not null,
  user_id        uuid        references auth.users(id) on delete set null,
  model          text        not null,                 -- e.g. 'gpt-4.1', 'text-embedding-3-large'
  endpoint       text        not null default 'chat',  -- 'chat' | 'embeddings' | 'memory' | 'rag-planner'
  tokens_in      integer     not null default 0,
  tokens_out     integer     not null default 0,
  tokens_total   integer     generated always as (tokens_in + tokens_out) stored,
  cost_usd       numeric(12, 8) not null default 0,
  latency_ms     integer,
  status         text        not null default 'success', -- 'success' | 'error'
  error_message  text,
  metadata       jsonb
);

create index if not exists openai_api_logs_user_created
  on openai_api_logs (user_id, created_at desc);

create index if not exists openai_api_logs_created
  on openai_api_logs (created_at desc);

-- ── 2. Daily summary table ───────────────────────────────────────────────────

create table if not exists openai_daily_usage (
  id              uuid        default gen_random_uuid() primary key,
  date            date        not null,
  user_id         uuid        references auth.users(id) on delete cascade,
  daily_cost_usd  numeric(12, 8) not null default 0,
  tokens_in       integer     not null default 0,
  tokens_out      integer     not null default 0,
  tokens_total    integer     not null default 0,
  request_count   integer     not null default 0,
  updated_at      timestamptz default now(),

  -- One row per user per day
  unique (date, user_id)
);

create index if not exists openai_daily_usage_user_date
  on openai_daily_usage (user_id, date desc);

-- ── 3. Upsert function ───────────────────────────────────────────────────────
-- Called by the trigger. Same day → accumulate. New day → insert fresh row.

create or replace function upsert_daily_openai_usage(
  p_user_id    uuid,
  p_cost_usd   numeric,
  p_tokens_in  integer,
  p_tokens_out integer
)
returns void
language sql
security definer
as $$
  insert into openai_daily_usage (
    date, user_id,
    daily_cost_usd,
    tokens_in, tokens_out, tokens_total,
    request_count,
    updated_at
  )
  values (
    current_date,
    p_user_id,
    p_cost_usd,
    p_tokens_in,
    p_tokens_out,
    p_tokens_in + p_tokens_out,
    1,
    now()
  )
  on conflict (date, user_id)
  do update set
    daily_cost_usd = openai_daily_usage.daily_cost_usd + excluded.daily_cost_usd,
    tokens_in      = openai_daily_usage.tokens_in      + excluded.tokens_in,
    tokens_out     = openai_daily_usage.tokens_out     + excluded.tokens_out,
    tokens_total   = openai_daily_usage.tokens_total   + excluded.tokens_total,
    request_count  = openai_daily_usage.request_count  + 1,
    updated_at     = now();
$$;

-- ── 4. Trigger — auto-update daily summary on every log insert ───────────────

create or replace function trigger_upsert_daily_openai_usage()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only accumulate successful calls with a non-null user
  if NEW.status = 'success' and NEW.user_id is not null then
    perform upsert_daily_openai_usage(
      NEW.user_id,
      NEW.cost_usd,
      NEW.tokens_in,
      NEW.tokens_out
    );
  end if;
  return NEW;
end;
$$;

create trigger on_openai_api_log_insert
  after insert on openai_api_logs
  for each row
  execute function trigger_upsert_daily_openai_usage();

-- ── 5. Running total view ─────────────────────────────────────────────────────
-- Cumulative cost per user, ordered newest-first.

create or replace view openai_usage_with_running_total as
select
  d.date,
  d.user_id,
  p.email,
  d.daily_cost_usd,
  round(
    sum(d.daily_cost_usd) over (
      partition by d.user_id
      order by d.date asc
      rows unbounded preceding
    ),
    8
  ) as running_total_usd,
  d.tokens_in,
  d.tokens_out,
  d.tokens_total,
  d.request_count,
  d.updated_at
from openai_daily_usage d
left join auth.users p on p.id = d.user_id
order by d.date desc, d.daily_cost_usd desc;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
-- Logs are service-role write only. Users can only read their own daily summary.

alter table openai_api_logs   enable row level security;
alter table openai_daily_usage enable row level security;

-- No SELECT policy on openai_api_logs — service role bypasses RLS anyway.
-- Admins/dashboards query via service role.

create policy "Users can read their own daily usage"
  on openai_daily_usage for select
  using (auth.uid() = user_id);

-- ── 7. Test data helpers (run manually to verify, then delete) ───────────────
-- See comments below for manual test queries.
--
-- INSERT INTO openai_api_logs (user_id, model, endpoint, tokens_in, tokens_out, cost_usd, latency_ms)
-- VALUES
--   ('<your-user-id>', 'gpt-4.1',        'chat',        1200, 350, 0.000620, 880),
--   ('<your-user-id>', 'gpt-4.1-nano',   'chat',        800,  120, 0.000011, 120),
--   ('<your-user-id>', 'text-embedding-3-large', 'embeddings', 512, 0, 0.000010, 45);
--
-- Then check:
--   SELECT * FROM openai_daily_usage;
--   SELECT * FROM openai_usage_with_running_total;
