-- =============================================================================
-- Migration 005: roi_calculations
-- Per-feature ROI tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS roi_calculations (
    id              SERIAL PRIMARY KEY,
    feature_id      VARCHAR(100) NOT NULL,
    project_id      VARCHAR(100) NOT NULL,

    -- AI cost (integer cents)
    ai_cost_cents           BIGINT NOT NULL DEFAULT 0,
    ai_sessions_count       INTEGER NOT NULL DEFAULT 0,

    -- Manual baseline
    estimated_story_points  NUMERIC(6,1),
    hours_per_story_point   NUMERIC(6,2) NOT NULL DEFAULT 4.0,
    hourly_rate_cents       INTEGER NOT NULL DEFAULT 15000,

    -- Computed (stored for query performance)
    estimated_manual_hours  NUMERIC(10,2),
    estimated_manual_cents  BIGINT,
    roi_ratio               NUMERIC(8,4),

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(feature_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_roi_project ON roi_calculations (project_id);
CREATE INDEX IF NOT EXISTS idx_roi_ratio   ON roi_calculations (roi_ratio DESC NULLS LAST);
