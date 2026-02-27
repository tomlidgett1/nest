-- Fix division-by-zero in openai_usage_with_running_total when
-- cost_usd_no_cache = 0 (rows inserted before v2 migration).

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
