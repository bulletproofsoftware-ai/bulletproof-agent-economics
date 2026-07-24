-- =============================================================================
-- Migration 003: budget_configs
-- Administrative budget configuration
-- =============================================================================

CREATE TABLE IF NOT EXISTS budget_configs (
    id                  SERIAL PRIMARY KEY,
    scope_type          VARCHAR(20) NOT NULL CHECK (scope_type IN (
                            'project', 'agent', 'department', 'organization'
                        )),
    scope_id            VARCHAR(100) NOT NULL,

    -- Budget (integer cents)
    cap_cents           BIGINT NOT NULL CHECK (cap_cents > 0),
    period_type         VARCHAR(10) NOT NULL DEFAULT 'monthly'
                        CHECK (period_type IN ('daily', 'weekly', 'monthly', 'session')),

    -- Threshold overrides (defaults: 60/80/90/100)
    threshold_monitor_pct   SMALLINT NOT NULL DEFAULT 60,
    threshold_warn_pct      SMALLINT NOT NULL DEFAULT 80,
    threshold_throttle_pct  SMALLINT NOT NULL DEFAULT 90,
    threshold_pause_pct     SMALLINT NOT NULL DEFAULT 100,

    -- Inheritance strategy
    inheritance_strategy VARCHAR(10) DEFAULT 'POOL'
                        CHECK (inheritance_strategy IN ('EQUAL', 'WEIGHTED', 'POOL')),
    agent_weights       JSONB,

    -- Alert configuration
    alert_channels      JSONB NOT NULL DEFAULT '["slack"]',
    slack_webhook_url   TEXT,
    email_recipients    TEXT[],
    webhook_url         TEXT,
    webhook_secret      TEXT,

    -- Admin
    created_by          VARCHAR(100) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(scope_type, scope_id)
);
