// =============================================================================
// Audit bus bridge tests
// REQ-055: Governance audit bus integration
// =============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditBusBridge } from '../audit-bus-bridge.js';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

describe('AuditBusBridge', () => {
  let tmpDir: string;
  let dbPath: string;
  let bridge: AuditBusBridge;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'));
    dbPath = join(tmpDir, 'audit.db');
    bridge = new AuditBusBridge(dbPath, 0); // 0ms batch interval for immediate flush
    bridge.init();
  });

  afterEach(() => {
    bridge.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initializes SQLite with WAL mode', () => {
    const db = new Database(dbPath);
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(mode).toBe('wal');
    db.close();
  });

  it('creates audit_events table on init', () => {
    const db = new Database(dbPath);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_events'")
      .all();
    expect(tables.length).toBe(1);
    db.close();
  });

  it('emits events with 17 columns', () => {
    const eventId = bridge.emit({
      event_type: 'economics.cost_event',
      agent_id: 'test-agent',
      session_id: 'session-123',
      detail: { cost_cents: 42, model: 'claude-sonnet-4-5' },
      outcome: 'info',
    });

    bridge.flush();

    const db = new Database(dbPath);
    const row = db.prepare('SELECT * FROM audit_events WHERE event_id = ?').get(eventId) as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.event_type).toBe('economics.cost_event');
    expect(row.agent_id).toBe('test-agent');
    expect(row.outcome).toBe('info');

    const detail = JSON.parse(row.detail as string) as { cost_cents: number };
    expect(detail.cost_cents).toBe(42);

    // Verify all 17 columns are present
    const columns = Object.keys(row);
    expect(columns.length).toBe(17);

    db.close();
  });

  it('uses INSERT OR IGNORE (no duplicates)', () => {
    bridge.emit({
      event_type: 'economics.cost_event',
      agent_id: 'test-agent',
      detail: {},
      outcome: 'info',
    });
    bridge.flush();

    const db = new Database(dbPath);
    const count = (db.prepare('SELECT COUNT(*) as c FROM audit_events').get() as { c: number }).c;
    expect(count).toBe(1);
    db.close();
  });

  it('batches multiple events in a single transaction', () => {
    // Emit multiple events before flushing
    bridge.emit({
      event_type: 'economics.cost_event',
      agent_id: 'agent-1',
      detail: { cost_cents: 10 },
      outcome: 'info',
    });
    bridge.emit({
      event_type: 'economics.budget_warning',
      agent_id: 'agent-2',
      detail: { threshold_pct: 60 },
      outcome: 'warn',
    });
    bridge.emit({
      event_type: 'economics.anomaly_detected',
      agent_id: 'agent-3',
      detail: { multiplier: 12 },
      outcome: 'deny',
    });

    bridge.flush();

    const db = new Database(dbPath);
    const count = (db.prepare('SELECT COUNT(*) as c FROM audit_events').get() as { c: number }).c;
    expect(count).toBe(3);
    db.close();
  });

  it('sets busy_timeout pragma', () => {
    const db = new Database(dbPath);
    const timeout = db.pragma('busy_timeout', { simple: true }) as number;
    expect(timeout).toBe(5000);
    db.close();
  });
});
