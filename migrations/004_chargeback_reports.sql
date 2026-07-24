-- =============================================================================
-- Migration 004: chargeback_reports
-- Generated chargeback reports
-- =============================================================================

CREATE TABLE IF NOT EXISTS chargeback_reports (
    id              SERIAL PRIMARY KEY,
    report_id       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    scope_type      VARCHAR(20) NOT NULL,
    scope_id        VARCHAR(100) NOT NULL,

    -- Report data (JSONB for flexibility)
    line_items      JSONB NOT NULL,
    summary         JSONB NOT NULL,

    -- Generation metadata
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    VARCHAR(100) NOT NULL,
    generation_ms   INTEGER,
    format          VARCHAR(10) NOT NULL CHECK (format IN ('json', 'csv'))
);

CREATE INDEX IF NOT EXISTS idx_chargeback_period ON chargeback_reports (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_chargeback_scope  ON chargeback_reports (scope_type, scope_id);
