-- =============================================================================
-- Migration 007: widen cost_events.routed_tier for the REQ-057 router tiers
-- =============================================================================
-- REQ-057 adds 6 new model/media tiers to ModelTier (fable, ollama-local,
-- codex, agy, veo, edge-tts) on top of the existing 7. The cost_events table's
-- routed_tier CHECK constraint must accept all 14 or inserts of the new tiers
-- (from POST /economics/events, the /economics/route preview rows, and the
-- non-Claude backend cost-posting in ~/bin) are rejected at the DB layer.
--
-- The live database already carries the column as varchar(50) with a 7-tier
-- constraint named cost_events_routed_tier_check (applied out-of-band on
-- 2026-05-18); this migration is written to be safe whether that constraint is
-- the 7-tier form, the original 3-tier form, or absent. It is idempotent.
-- =============================================================================

-- Ensure the column is wide enough for the longest tier name (defensive no-op
-- if the live column is already varchar(50)).
ALTER TABLE cost_events
    ALTER COLUMN routed_tier TYPE VARCHAR(50);

-- Drop whatever routed_tier CHECK constraint currently exists (named form).
ALTER TABLE cost_events
    DROP CONSTRAINT IF EXISTS cost_events_routed_tier_check;

-- Re-add with the full 14-tier allowlist. NULL remains permitted (the column
-- is nullable — routing-preview rows and pre-route events may have no tier).
ALTER TABLE cost_events
    ADD CONSTRAINT cost_events_routed_tier_check
    CHECK (routed_tier IN (
        'haiku', 'sonnet', 'opus', 'fable',
        'ollama-local', 'codex', 'agy',
        'gemini-flash', 'gemini-pro',
        'nano-banana-pro', 'veo',
        'elevenlabs', 'edge-tts'
    ));
