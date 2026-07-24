-- =============================================================================
-- Migration 006: Daily cost aggregation materialized view
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS daily_cost_summary AS
SELECT
    date_trunc('day', created_at) AS day,
    project_id,
    agent_id,
    model,
    event_type,
    COUNT(*)                  AS event_count,
    SUM(cost_cents)           AS total_cost_cents,
    SUM(input_tokens)         AS total_input_tokens,
    SUM(output_tokens)        AS total_output_tokens,
    SUM(cache_read_tokens)    AS total_cache_read_tokens,
    AVG(latency_ms)           AS avg_latency_ms
FROM cost_events
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_summary_pk ON daily_cost_summary (
    day, project_id, agent_id, model, event_type
);
