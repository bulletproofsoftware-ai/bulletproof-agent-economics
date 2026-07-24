// =============================================================================
// src/audit/audit-bus-bridge.ts — SQLite WAL integration
// REQ-055: Governance audit bus integration for all cost events
//
// Writes to the existing audit_events table using the exact 17-column INSERT
// from SHARED-audit-bus-schema.md. Compatible with the Python AuditBus.
// =============================================================================

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import type { EconomicsAuditEvent } from '../types.js';

interface BufferedEvent {
  event: EconomicsAuditEvent;
  event_id: string;
  timestamp: string;
}

export class AuditBusBridge {
  private db: Database.Database | null = null;
  private insertStmt: Database.Statement | null = null;
  private buffer: BufferedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackDir: string;
  private sessionId: string;

  constructor(
    private dbPath: string = config.auditDbPath,
    private batchIntervalMs: number = config.auditWriteBatchMs,
  ) {
    this.fallbackDir = join(dirname(dbPath), 'fallback-events');
    this.sessionId = randomUUID();
  }

  /**
   * Initialize the SQLite connection with WAL mode and busy timeout.
   */
  init(): void {
    try {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);

      // CISO requirement: busy_timeout = 5000
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma(`busy_timeout = ${config.sqliteBusyTimeoutMs}`);

      // Ensure the audit_events table exists (idempotent)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS audit_events (
          event_id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          audit_session_id TEXT,
          event_type TEXT NOT NULL,
          agent_id TEXT,
          manifest_id TEXT,
          manifest_version TEXT,
          manifest_hash TEXT,
          trust_level INTEGER,
          data_classification TEXT,
          autonomy_depth_remaining INTEGER,
          tool_name TEXT,
          task_id TEXT,
          target_agent_id TEXT,
          context_hash TEXT,
          detail TEXT,
          outcome TEXT
        )
      `);

      // Exact 17-column INSERT from the shared schema
      this.insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO audit_events (
          event_id, timestamp, audit_session_id, event_type,
          agent_id, manifest_id, manifest_version, manifest_hash,
          trust_level, data_classification, autonomy_depth_remaining,
          tool_name, task_id, target_agent_id, context_hash,
          detail, outcome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
    } catch (err) {
      console.error(
        '[audit-bus-bridge] Failed to initialize SQLite:',
        (err as Error).message,
      );
      this.db = null;
      this.insertStmt = null;
    }
  }

  /**
   * Emit an economics event to the governance audit bus.
   * Events are buffered for up to batchIntervalMs before flushing.
   */
  emit(event: EconomicsAuditEvent): string {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    this.buffer.push({ event, event_id: eventId, timestamp });

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.batchIntervalMs);
    }

    return eventId;
  }

  /**
   * Immediately flush all buffered events to SQLite.
   * On failure, writes to fallback JSON file for later replay.
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    if (this.db && this.insertStmt) {
      try {
        const stmt = this.insertStmt;
        const sid = this.sessionId;
        const insertMany = this.db.transaction((items: BufferedEvent[]) => {
          for (const item of items) {
            stmt.run(
              item.event_id,                           // event_id
              item.timestamp,                          // timestamp
              sid,                                     // audit_session_id
              item.event.event_type,                   // event_type
              item.event.agent_id,                     // agent_id
              null,                                    // manifest_id
              null,                                    // manifest_version
              null,                                    // manifest_hash
              null,                                    // trust_level
              null,                                    // data_classification
              null,                                    // autonomy_depth_remaining
              item.event.tool_name ?? null,            // tool_name
              item.event.task_id ?? null,              // task_id
              item.event.target_agent_id ?? null,      // target_agent_id
              null,                                    // context_hash
              JSON.stringify(item.event.detail),       // detail
              item.event.outcome,                      // outcome
            );
          }
        });

        insertMany(events);
      } catch (batchErr) {
        console.error(
          '[audit-bus-bridge] Batch write failed, attempting individual inserts:',
          (batchErr as Error).message,
        );

        // Fall back to individual inserts to isolate poison pills
        const failedEvents: BufferedEvent[] = [];
        const stmt = this.insertStmt;
        const sid = this.sessionId;

        for (const item of events) {
          try {
            stmt.run(
              item.event_id,
              item.timestamp,
              sid,
              item.event.event_type,
              item.event.agent_id,
              null, null, null, null, null, null,
              item.event.tool_name ?? null,
              item.event.task_id ?? null,
              item.event.target_agent_id ?? null,
              null,
              JSON.stringify(item.event.detail),
              item.event.outcome,
            );
          } catch (individualErr) {
            console.error(
              `[audit-bus-bridge] Individual insert failed for event ${item.event_id}:`,
              (individualErr as Error).message,
            );
            failedEvents.push(item);
          }
        }

        // Only write genuinely failed events to fallback
        if (failedEvents.length > 0) {
          console.error(
            `[audit-bus-bridge] ${failedEvents.length}/${events.length} events failed, writing to JSON fallback`,
          );
          this.writeFallback(failedEvents);
        }
      }
    } else {
      this.writeFallback(events);
    }
  }

  /**
   * Write events to a fallback JSON file when SQLite is unavailable.
   */
  private writeFallback(events: BufferedEvent[]): void {
    try {
      if (!existsSync(this.fallbackDir)) {
        mkdirSync(this.fallbackDir, { recursive: true });
      }
      const filename = join(
        this.fallbackDir,
        `fallback-${Date.now()}.jsonl`,
      );
      const lines = events
        .map((e) =>
          JSON.stringify({
            ...e.event,
            event_id: e.event_id,
            timestamp: e.timestamp,
          }),
        )
        .join('\n');
      appendFileSync(filename, lines + '\n');
    } catch (fallbackErr) {
      console.error(
        '[audit-bus-bridge] Fallback write also failed:',
        (fallbackErr as Error).message,
      );
    }
  }

  /**
   * Close the database connection and flush any remaining events.
   */
  close(): void {
    this.flush();
    if (this.db) {
      this.db.close();
      this.db = null;
      this.insertStmt = null;
    }
  }
}
