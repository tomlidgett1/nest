-- ── openai_api_logs: description column ──────────────────────────────────────
-- Adds a human-readable label to every log row explaining what the call
-- was actually doing, e.g.:
--   "Agent called: get_calendar_events, send_email (round 2)"
--   "Agent final response"
--   "Casual conversation"
--   "Quick acknowledgment"
--   "Rolling memory summary"
--   "RAG query planning"

alter table openai_api_logs
  add column if not exists description text;

-- Index so the dashboard can filter/group by description efficiently
create index if not exists openai_api_logs_description
  on openai_api_logs (user_id, description, created_at desc);
