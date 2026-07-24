-- =============================================================================
-- Migration 001: cost_events
-- Core event table — every metered action becomes one row
-- =============================================================================

CREATE TABLE IF NOT EXISTS cost_events (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    event_type      VARCHAR(20) NOT NULL CHECK (event_type IN (
                        'llm_call', 'tool_use', 'external_api', 'cache_hit'
                    )),
    agent_id        VARCHAR(100) NOT NULL,
    session_id      VARCHAR(100) NOT NULL,
    project_id      VARCHAR(100) NOT NULL,
    feature_id      VARCHAR(100),
    department_id   VARCHAR(100),
    organization_id VARCHAR(100),

    -- Token counts (always integers)
    model           VARCHAR(50) NOT NULL,
    input_tokens    INTEGER NOT NULL DEFAULT 0,
    output_tokens   INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,

    -- Cost in integer cents (NEVER float)
    cost_cents      INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),

    -- Performance
    latency_ms      INTEGER NOT NULL DEFAULT 0,

    -- Routing metadata
    routed_tier     VARCHAR(10) CHECK (routed_tier IN ('haiku', 'sonnet', 'opus')),
    routing_signals JSONB,
    manual_override BOOLEAN DEFAULT FALSE,
    override_by     VARCHAR(100),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_events_agent   ON cost_events (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_session ON cost_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_project ON cost_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_feature ON cost_events (feature_id, created_at DESC)
    WHERE feature_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cost_events_created ON cost_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_events_type    ON cost_events (event_type);
