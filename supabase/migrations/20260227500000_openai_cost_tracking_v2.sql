-- ── OpenAI Cost Tracking v2 — Detailed Breakdown ────────────────────────────
-- Adds cached token tracking, reasoning tokens, cache savings, and
-- analytics views (per-endpoint and per-model breakdowns).
--
-- OpenAI usage response includes:
--   usage.prompt_tokens_details.cached_tokens  → served from cache (50% price)
--   usage.completion_tokens_details.reasoning_tokens → o-series thinking tokens
--
-- Cache savings = what you would have paid without caching - what you paid.

-- ── 1. Extend openai_api_logs ─────────────────────────────────────────────────

alter table openai_api_logs
  add column if not exists tokens_in_cached   integer      not null default 0,
  add column if not exists tokens_reasoning   integer      not null default 0,
  add column if not exists cost_usd_no_cache  numeric(12,8) not null default 0;

-- Derived columns (auto-calculated)
alter table openai_api_logs
  add column if not exists tokens_in_fresh    integer
    generated always as (tokens_in - tokens_in_cached) stored,
  add column if not exists cache_savings_usd  numeric(12,8)
    generated always as (cost_usd_no_cache - cost_usd) stored;

-- ── 2. Extend openai_daily_usage ─────────────────────────────────────────────

alter table openai_daily_usage
  add column if not exists tokens_cached      integer       not null default 0,
  add column if not exists tokens_reasoning   integer       not null default 0,
  add column if not exists cache_savings_usd  numeric(12,8) not null default 0,
  add column if not exists cost_usd_no_cache  numeric(12,8) not null default 0;

-- ── 3. Updated upsert function (accumulates all new fields) ──────────────────

create or replace function upsert_daily_openai_usage(
  p_user_id         uuid,
  p_cost_usd        numeric,
  p_cost_usd_no_cache numeric,
  p_tokens_in       integer,
  p_tokens_out      integer,
  p_tokens_cached   integer,
  p_tokens_reasoning integer
)
returns void
language sql
security definer
as $$
  insert into openai_daily_usage (
    date, user_id,
    daily_cost_usd,
    cost_usd_no_cache,
    tokens_in, tokens_out, tokens_total,
    tokens_cached,
    tokens_reasoning,
    cache_savings_usd,
    request_count,
    updated_at
  )
  values (
    current_date,
    p_user_id,
    p_cost_usd,
    p_cost_usd_no_cache,
    p_tokens_in,
    p_tokens_out,
    p_tokens_in + p_tokens_out,
    p_tokens_cached,
    p_tokens_reasoning,
    p_cost_usd_no_cache - p_cost_usd,
    1,
    now()
  )
  on conflict (date, user_id)
  do update set
    daily_cost_usd    = openai_daily_usage.daily_cost_usd    + excluded.daily_cost_usd,
    cost_usd_no_cache = openai_daily_usage.cost_usd_no_cache + excluded.cost_usd_no_cache,
    tokens_in         = openai_daily_usage.tokens_in         + excluded.tokens_in,
    tokens_out        = openai_daily_usage.tokens_out        + excluded.tokens_out,
    tokens_total      = openai_daily_usage.tokens_total      + excluded.tokens_total,
    tokens_cached     = openai_daily_usage.tokens_cached     + excluded.tokens_cached,
    tokens_reasoning  = openai_daily_usage.tokens_reasoning  + excluded.tokens_reasoning,
    cache_savings_usd = openai_daily_usage.cache_savings_usd + (excluded.cost_usd_no_cache - excluded.daily_cost_usd),
    request_count     = openai_daily_usage.request_count     + 1,
    updated_at        = now();
$$;

-- ── 4. Updated trigger ───────────────────────────────────────────────────────

create or replace function trigger_upsert_daily_openai_usage()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.status = 'success' and NEW.user_id is not null then
    perform upsert_daily_openai_usage(
      NEW.user_id,
      NEW.cost_usd,
      NEW.cost_usd_no_cache,
      NEW.tokens_in,
      NEW.tokens_out,
      NEW.tokens_in_cached,
      NEW.tokens_reasoning
    );
  end if;
  return NEW;
end;
$$;

-- ── 5. Updated running total view ────────────────────────────────────────────
-- Drop first — CREATE OR REPLACE VIEW cannot change column names or order.

drop view if exists openai_usage_with_running_total;

create view openai_usage_with_running_total as
select
  d.date,
  d.user_id,
  u.email,
  d.daily_cost_usd,
  d.cost_usd_no_cache,
  d.cache_savings_usd,
  round(
    case
      when d.cost_usd_no_cache > 0
      then (d.cache_savings_usd / d.cost_usd_no_cache) * 100
      else 0
    end,
    1
  ) as cache_hit_pct,
  round(
    sum(d.daily_cost_usd) over (
      partition by d.user_id
      order by d.date asc
      rows unbounded preceding
    ),
    8
  ) as running_total_usd,
  round(
    sum(d.cache_savings_usd) over (
      partition by d.user_id
      order by d.date asc
      rows unbounded preceding
    ),
    8
  ) as running_savings_usd,
  d.tokens_in,
  d.tokens_out,
  d.tokens_total,
  d.tokens_cached,
  d.tokens_reasoning,
  d.request_count,
  d.updated_at
from openai_daily_usage d
left join auth.users u on u.id = d.user_id
order by d.date desc, d.daily_cost_usd desc;

-- ── 6. Per-endpoint analytics view ───────────────────────────────────────────
-- Answers: "Which endpoint costs the most?"

create or replace view openai_usage_by_endpoint as
select
  date_trunc('day', created_at at time zone 'utc') as date,
  user_id,
  endpoint,
  model,
  count(*)                                          as request_count,
  sum(tokens_in)                                    as tokens_in,
  sum(tokens_out)                                   as tokens_out,
  sum(tokens_in_cached)                             as tokens_cached,
  sum(tokens_reasoning)                             as tokens_reasoning,
  round(sum(cost_usd)::numeric, 8)                  as cost_usd,
  round(sum(cost_usd_no_cache)::numeric, 8)         as cost_usd_no_cache,
  round(sum(cache_savings_usd)::numeric, 8)         as cache_savings_usd,
  round(avg(latency_ms))                            as avg_latency_ms,
  round(
    case
      when sum(tokens_in) > 0
      then (sum(tokens_in_cached)::numeric / sum(tokens_in)) * 100
      else 0
    end,
    1
  )                                                 as cache_hit_pct
from openai_api_logs
where status = 'success'
group by 1, 2, 3, 4
order by 1 desc, cost_usd desc;

-- ── 7. Per-model analytics view ───────────────────────────────────────────────
-- Answers: "Which model costs the most?"

create or replace view openai_usage_by_model as
select
  date_trunc('day', created_at at time zone 'utc') as date,
  user_id,
  model,
  count(*)                                          as request_count,
  sum(tokens_in)                                    as tokens_in,
  sum(tokens_out)                                   as tokens_out,
  sum(tokens_in_cached)                             as tokens_cached,
  sum(tokens_reasoning)                             as tokens_reasoning,
  round(sum(cost_usd)::numeric, 8)                  as cost_usd,
  round(sum(cost_usd_no_cache)::numeric, 8)         as cost_usd_no_cache,
  round(sum(cache_savings_usd)::numeric, 8)         as cache_savings_usd,
  round(avg(latency_ms))                            as avg_latency_ms,
  round(
    case
      when sum(tokens_in) > 0
      then (sum(tokens_in_cached)::numeric / sum(tokens_in)) * 100
      else 0
    end,
    1
  )                                                 as cache_hit_pct
from openai_api_logs
where status = 'success'
group by 1, 2, 3
order by 1 desc, cost_usd desc;

-- ── 8. All-time summary view (per user) ──────────────────────────────────────
-- Top-level "how much have I spent total?" dashboard card

create or replace view openai_usage_summary as
select
  d.user_id,
  u.email,
  sum(d.daily_cost_usd)    as total_cost_usd,
  sum(d.cost_usd_no_cache) as total_cost_no_cache_usd,
  sum(d.cache_savings_usd) as total_cache_savings_usd,
  round(
    case
      when sum(d.cost_usd_no_cache) > 0
        then (sum(d.cache_savings_usd) / sum(d.cost_usd_no_cache)) * 100
      else 0
    end,
    1
  )                        as overall_cache_hit_pct,
  sum(d.request_count)     as total_requests,
  sum(d.tokens_total)      as total_tokens,
  sum(d.tokens_cached)     as total_tokens_cached,
  sum(d.tokens_reasoning)  as total_tokens_reasoning,
  min(d.date)              as first_call_date,
  max(d.date)              as last_call_date
from openai_daily_usage d
left join auth.users u on u.id = d.user_id
group by d.user_id, u.email;
