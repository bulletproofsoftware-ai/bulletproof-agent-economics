// =============================================================================
// src/run-migrations.ts — Run PostgreSQL migrations in order
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = resolve(__dirname, '..', 'migrations');

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: config.databaseUrl });

  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const { rows: applied } = await pool.query<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY name',
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Get migration files sorted
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] SKIP ${file} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      console.log(`[migrate] APPLY ${file}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        console.log(`[migrate] OK ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAIL ${file}:`, (err as Error).message);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log('[migrate] All migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
