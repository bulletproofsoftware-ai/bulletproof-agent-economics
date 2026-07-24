-- =============================================================================
-- Migration 008: add nullable correlation_id join key to cost_events
-- =============================================================================
-- REQ-AE-001 wires Agent Economics into the shared correlation_id pipeline.
-- correlation_id is the join key that links a cost_events row back to the
-- conductor dispatch / Event Router event that produced it.
--
-- The column is nullable, has NO CHECK constraint, NO DEFAULT, and is NOT
-- backfilled — existing rows keep NULL. Exact-match join when present.
-- Idempotent on re-run via IF NOT EXISTS guards.
-- =============================================================================

ALTER TABLE cost_events
    ADD COLUMN IF NOT EXISTS correlation_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_cost_events_correlation_id
    ON cost_events (correlation_id);
