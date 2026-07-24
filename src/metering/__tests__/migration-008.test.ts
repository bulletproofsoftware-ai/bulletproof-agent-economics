// =============================================================================
// migration-008.test.ts — REQ-TEST-001 case G: migration 008 validation
//
// Two-tier approach (CI has no live Postgres):
//   1. Static assertion (always runs): read migrations/008_correlation_id.sql
//      and assert it adds a NULLABLE correlation_id UUID column + an index, with
//      NO CHECK constraint on correlation_id and NO backfill (no UPDATE).
//   2. Live-PG idempotency (guarded): only when TEST_DATABASE_URL is set, apply
//      the migration twice against a real DB and assert information_schema shows
//      correlation_id / uuid / is_nullable = YES. Skipped cleanly otherwise.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// src/metering/__tests__ -> repo root is three levels up.
const MIGRATION_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'migrations',
  '008_correlation_id.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf-8');
// Normalize whitespace so multi-line statements match regardless of formatting.
const normalized = sql.replace(/\s+/g, ' ').trim();

describe('migration 008_correlation_id.sql — static validation', () => {
  it('adds a nullable correlation_id UUID column via IF NOT EXISTS', () => {
    expect(normalized).toMatch(
      /ALTER TABLE cost_events\s+ADD COLUMN IF NOT EXISTS correlation_id UUID/i,
    );
  });

  it('does NOT declare correlation_id NOT NULL (column must be nullable)', () => {
    // Guard against any "correlation_id UUID NOT NULL" declaration.
    expect(normalized).not.toMatch(/correlation_id UUID\s+NOT NULL/i);
  });

  it('creates an index on cost_events (correlation_id) via IF NOT EXISTS', () => {
    expect(normalized).toMatch(
      /CREATE INDEX IF NOT EXISTS \S+ ON cost_events \(correlation_id\)/i,
    );
  });

  it('adds NO CHECK constraint referencing correlation_id', () => {
    // No CHECK (...correlation_id...) anywhere.
    expect(/CHECK\s*\([^)]*correlation_id/i.test(normalized)).toBe(false);
  });

  it('performs NO backfill (no UPDATE statement)', () => {
    expect(/\bUPDATE\b/i.test(normalized)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Live-PG idempotency — env-gated. Requires TEST_DATABASE_URL pointing at a
// Postgres with the cost_events table (migrations 001–007 applied). Run with:
//   TEST_DATABASE_URL=postgresql://... npm test -- migration-008
// -----------------------------------------------------------------------------

const LIVE_DB = process.env.TEST_DATABASE_URL;

describe('migration 008_correlation_id.sql — live-PG idempotency (env-gated)', () => {
  const maybeIt = LIVE_DB ? it : it.skip;

  maybeIt(
    'applies cleanly twice and yields a nullable uuid correlation_id column',
    async () => {
      // Imported lazily so CI without pg env never constructs a Pool.
      const pgModule = await import('pg');
      const { Pool } = pgModule.default;
      const pool = new Pool({ connectionString: LIVE_DB });
      try {
        // Apply twice — the IF NOT EXISTS guards must make this idempotent.
        await pool.query(sql);
        await pool.query(sql);

        const { rows } = await pool.query<{
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT data_type, is_nullable
             FROM information_schema.columns
            WHERE table_name = 'cost_events'
              AND column_name = 'correlation_id'`,
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].data_type).toBe('uuid');
        expect(rows[0].is_nullable).toBe('YES');
      } finally {
        await pool.end();
      }
    },
  );

  if (!LIVE_DB) {
    it.skip(
      'live-PG idempotency check skipped: set TEST_DATABASE_URL to run it',
      () => {
        /* documented env-gated skip — see spec REQ-TEST-001 case G */
      },
    );
  }
});
