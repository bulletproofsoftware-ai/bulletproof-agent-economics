-- =============================================================================
-- Migration 002: cost_ledger (materialized aggregates)
-- Pre-computed running totals per scope
-- =============================================================================

CREATE TABLE IF NOT EXISTS cost_ledger (
    id              BIGSERIAL PRIMARY KEY,
    scope_type      VARCHAR(20) NOT NULL CHECK (scope_type IN (
                        'agent', 'session', 'project', 'feature',
                        'department', 'organization'
                    )),
    scope_id        VARCHAR(100) NOT NULL,
    parent_scope_id VARCHAR(100),

    -- Running totals (integer cents)
    total_cost_cents        BIGINT NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
    total_input_tokens      BIGINT NOT NULL DEFAULT 0,
    total_output_tokens     BIGINT NOT NULL DEFAULT 0,
    total_cache_read_tokens BIGINT NOT NULL DEFAULT 0,
    total_events            INTEGER NOT NULL DEFAULT 0,

    -- Cache savings (integer cents)
    total_savings_cents     BIGINT NOT NULL DEFAULT 0,

    -- Budget tracking
    budget_cap_cents        BIGINT,
    budget_spent_cents      BIGINT NOT NULL DEFAULT 0,

    -- Period
    period_start    TIMESTAMPTZ NOT NULL,
    period_end      TIMESTAMPTZ,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(scope_type, scope_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_ledger_scope  ON cost_ledger (scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_ledger_parent ON cost_ledger (parent_scope_id)
    WHERE parent_scope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_period ON cost_ledger (period_start DESC);
