// =============================================================================
// src/metering/metering-engine.ts — Cost event recording and aggregation
// REQ-040: Per-agent cost ledger with <100ms overhead
// REQ-041: Per-session and per-project cost aggregation
// =============================================================================

import { randomUUID } from 'node:crypto';
import type { CostEvent, CostEventType, ModelTier, ComplexitySignals } from '../types.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { query, transaction } from '../database.js';
import { getRedis } from '../redis.js';
import { computeCostCents, getPricing } from './cost-calculator.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';
import { CostAnomalyDetector } from '../anomaly/cost-anomaly-detector.js';
import { BudgetController } from '../budget/budget-controller.js';
import { baselineMember } from '../anomaly/rolling-baseline.js';
import { emitCostRecorded } from './event-router-emitter.js';
import type pg from 'pg';

// hook-dispatch.py's presence heartbeat (fired on every Claude Code hook, up
// to ~1500/min) uses this sentinel model name to mark a session active
// without representing a real LLM call. It must never become a cost_events
// row — that table backs the dashboard's "Recent Routing Decisions" feed and
// the anomaly/budget baselines, and a firehose of zero-cost noise events
// drowns out real activity within seconds.
const PRESENCE_HEARTBEAT_MODEL = 'claude-code-hook-presence';

// REQ-AE-002 (CISO finding F-3): cost_events.correlation_id is a Postgres UUID
// column and CLAUDE_CORRELATION_ID is an UNTRUSTED env var. A malformed non-UUID
// value bound to the uuid column throws `invalid input syntax for type uuid` at
// INSERT time — and that INSERT is the authoritative cost write that MUST NEVER
// break. Validate against this regex and coerce anything non-matching to null
// BEFORE building the CostEvent.
const CORRELATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MeterCallInput {
  event_type: CostEventType;
  agent_id: string;
  session_id: string;
  project_id: string;
  feature_id?: string;
  department_id?: string;
  organization_id?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  latency_ms: number;
  routed_tier: ModelTier;
  routing_signals?: ComplexitySignals;
  manual_override?: boolean;
  override_by?: string;
  correlation_id?: string | null;
}

export class MeteringEngine {
  private auditBridge: AuditBusBridge | null = null;
  private anomalyDetector: CostAnomalyDetector | null = null;
  private budgetController: BudgetController | null = null;

  constructor(
    auditBridge?: AuditBusBridge,
    anomalyDetector?: CostAnomalyDetector,
    budgetController?: BudgetController,
  ) {
    this.auditBridge = auditBridge ?? null;
    this.anomalyDetector = anomalyDetector ?? null;
    this.budgetController = budgetController ?? null;
  }

  /**
   * Record a cost event. Primary metering entry point.
   * Computes cost, persists to DB, updates Redis, emits to audit bus.
   * Target: <100ms total overhead.
   */
  async recordCostEvent(input: MeterCallInput): Promise<CostEvent> {
    const startTime = performance.now();

    const pricing = getPricing(input.routed_tier);
    const costCents = computeCostCents(
      input.input_tokens,
      input.output_tokens,
      input.cache_read_tokens ?? 0,
      pricing,
    );

    // REQ-AE-002: resolve correlation_id — explicit input wins over the ambient
    // env var; a missing/malformed/non-UUID value (incl. empty string) becomes
    // null so it can never abort the authoritative INSERT below (CISO F-3).
    const rawCorrelationId =
      (input.correlation_id ?? process.env.CLAUDE_CORRELATION_ID) || null;
    const correlationId =
      rawCorrelationId && CORRELATION_ID_RE.test(rawCorrelationId)
        ? rawCorrelationId
        : null;

    const event: CostEvent = {
      event_id: randomUUID(),
      event_type: input.event_type,
      agent_id: input.agent_id,
      session_id: input.session_id,
      project_id: input.project_id,
      feature_id: input.feature_id ?? null,
      department_id: input.department_id ?? null,
      organization_id: input.organization_id ?? null,
      model: input.model,
      input_tokens: input.input_tokens,
      output_tokens: input.output_tokens,
      cache_read_tokens: input.cache_read_tokens ?? 0,
      cost_cents: costCents,
      latency_ms: input.latency_ms,
      routed_tier: input.routed_tier,
      routing_signals: input.routing_signals ?? null,
      manual_override: input.manual_override ?? false,
      override_by: input.override_by ?? null,
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    };

    if (event.model === PRESENCE_HEARTBEAT_MODEL) {
      await this.markPresenceOnly(event);
      return event;
    }

    // REQ-057: anomaly check MUST run before updateRedisState writes this
    // event's own cost into the baseline sorted set — otherwise the check
    // compares the event against a baseline that already includes itself,
    // diluting the multiplier and masking real anomalies. Best-effort: a
    // failure here must never block the actual cost-event write below.
    await this.checkAnomaly(event);

    // Parallel: DB insert + Redis update + Audit bus emit
    await Promise.all([
      this.insertCostEvent(event),
      this.updateRedisState(event),
      this.emitToAuditBus(event),
    ]);

    // REQ-AE-003: best-effort, TRULY fire-and-forget emission of cost.recorded
    // to the Event Router, AFTER the authoritative insertCostEvent has resolved
    // and OUTSIDE its DB transaction. This MUST NOT be awaited: emitCostRecorded
    // is bounded by its own AbortController timeout (config.eventRouterEmitTimeoutMs),
    // so awaiting it would add up to that timeout of latency to EVERY metered
    // call — violating the fire-and-forget contract and the <100ms overhead
    // target. `void ... .catch()` dispatches without blocking recordCostEvent's
    // return path; the emitter already swallows its own errors, and this .catch
    // is defense-in-depth against any unhandled rejection.
    void emitCostRecorded({
      correlation_id: event.correlation_id ?? null,
      agent_id: event.agent_id,
      session_id: event.session_id,
      project_id: event.project_id,
      cost_cents: event.cost_cents,
      model: event.model,
      routed_tier: event.routed_tier,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
    }).catch(() => {
      // Never let emission escape into recordCostEvent (emitter already swallows
      // its own errors; this is a defensive double-guard).
    });

    // REQ-057: budget check runs AFTER spend is recorded — pct_used should
    // reflect spend INCLUDING this event, so the event that actually crosses
    // a threshold is the one that triggers the alert, not the next one.
    // (Opposite ordering from the anomaly check above, deliberately.)
    await this.checkBudget(event);

    const elapsed = performance.now() - startTime;
    if (elapsed > 100) {
      console.warn(
        `[metering] Overhead exceeded 100ms target: ${elapsed.toFixed(1)}ms for event ${event.event_id}`,
      );
    }

    return event;
  }

  /**
   * REQ-057: check this event against the agent's cost baseline. Populates
   * the dashboard's Alert Feed (WSAnomalyAlert) via CostAnomalyDetector's
   * onAnomalyDetected callback, wired by server.ts.
   */
  private async checkAnomaly(event: CostEvent): Promise<void> {
    if (!this.anomalyDetector) return;
    try {
      await this.anomalyDetector.checkForAnomaly(
        event.agent_id,
        event.session_id,
        event.event_id,
        event.cost_cents,
      );
    } catch (err) {
      console.error('[metering] Anomaly check failed (non-fatal):', (err as Error).message);
    }
  }

  /**
   * REQ-057: check this event against the project's budget thresholds.
   * Populates the dashboard's Alert Feed (WSBudgetUpdate) via
   * BudgetController's onEvent callback, wired by server.ts.
   */
  private async checkBudget(event: CostEvent): Promise<void> {
    if (!this.budgetController) return;
    try {
      await this.budgetController.checkBudget(
        event.project_id,
        event.agent_id,
        event.session_id,
        event.routed_tier,
      );
    } catch (err) {
      console.error('[metering] Budget check failed (non-fatal):', (err as Error).message);
    }
  }

  /**
   * Insert cost event and update ledger aggregates in one transaction.
   */
  private async insertCostEvent(event: CostEvent): Promise<void> {
    await transaction(async (client: pg.PoolClient) => {
      await client.query(
        `INSERT INTO cost_events (
          event_id, event_type, agent_id, session_id, project_id,
          feature_id, department_id, organization_id,
          model, input_tokens, output_tokens, cache_read_tokens,
          cost_cents, latency_ms, routed_tier, routing_signals,
          manual_override, override_by, created_at, correlation_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          event.event_id,
          event.event_type,
          event.agent_id,
          event.session_id,
          event.project_id,
          event.feature_id,
          event.department_id,
          event.organization_id,
          event.model,
          event.input_tokens,
          event.output_tokens,
          event.cache_read_tokens,
          event.cost_cents,
          event.latency_ms,
          event.routed_tier,
          event.routing_signals ? JSON.stringify(event.routing_signals) : null,
          event.manual_override,
          event.override_by,
          event.timestamp,
          event.correlation_id ?? null,
        ],
      );

      // Update ledger for each scope
      const scopes: Array<{ type: string; id: string; parent?: string }> = [
        { type: 'agent', id: event.agent_id, parent: event.project_id },
        { type: 'session', id: event.session_id, parent: event.agent_id },
        { type: 'project', id: event.project_id },
      ];

      if (event.feature_id) {
        scopes.push({
          type: 'feature',
          id: event.feature_id,
          parent: event.project_id,
        });
      }
      if (event.department_id) {
        scopes.push({
          type: 'department',
          id: event.department_id,
          parent: event.organization_id ?? undefined,
        });
      }
      if (event.organization_id) {
        scopes.push({ type: 'organization', id: event.organization_id });
      }

      for (const scope of scopes) {
        await client.query(
          `INSERT INTO cost_ledger (
            scope_type, scope_id, parent_scope_id,
            total_cost_cents, total_input_tokens, total_output_tokens,
            total_cache_read_tokens, total_events, budget_spent_cents,
            period_start, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $4, date_trunc('month', NOW()), NOW())
          ON CONFLICT (scope_type, scope_id, period_start)
          DO UPDATE SET
            total_cost_cents = cost_ledger.total_cost_cents + $4,
            total_input_tokens = cost_ledger.total_input_tokens + $5,
            total_output_tokens = cost_ledger.total_output_tokens + $6,
            total_cache_read_tokens = cost_ledger.total_cache_read_tokens + $7,
            total_events = cost_ledger.total_events + 1,
            budget_spent_cents = cost_ledger.budget_spent_cents + $4,
            updated_at = NOW()`,
          [
            scope.type,
            scope.id,
            scope.parent ?? null,
            event.cost_cents,
            event.input_tokens,
            event.output_tokens,
            event.cache_read_tokens,
          ],
        );
      }
    });
  }

  /**
   * Presence-only heartbeat: mark the agent active and bump the hook-activity
   * counter, WITHOUT touching cost_events, budget/anomaly baselines, the
   * audit bus, or the Event Router cost.recorded emitter — none of those are
   * meaningful for a zero-cost hook ping.
   */
  private async markPresenceOnly(event: CostEvent): Promise<void> {
    const redis = getRedis();
    const pipeline = redis.pipeline();
    pipeline.incrby('metrics:live:events_per_minute', 1);
    pipeline.zadd('metrics:live:active_agents', Date.now().toString(), event.agent_id);
    await pipeline.exec();
  }

  /**
   * Update Redis budget state and publish event for real-time dashboard.
   */
  private async updateRedisState(event: CostEvent): Promise<void> {
    const redis = getRedis();
    const pipeline = redis.pipeline();

    // Atomic budget spend updates
    pipeline.incrby(`budget:project:${event.project_id}:spent_cents`, event.cost_cents);
    pipeline.incrby(
      `budget:agent:${event.agent_id}:session:${event.session_id}:spent_cents`,
      event.cost_cents,
    );

    // Anomaly baseline sorted set. REQ-057: member must be unique per event
    // (baselineMember embeds event_id) — using cost_cents alone as the member
    // let ZADD collapse same-cost events into one entry, corrupting the
    // rolling average. See rolling-baseline.ts for the full explanation.
    pipeline.zadd(
      `baseline:agent:${event.agent_id}:costs`,
      Date.now().toString(),
      baselineMember(event.cost_cents, event.event_id),
    );

    // Live metrics
    pipeline.incrby('metrics:live:events_per_minute', 1);
    // REQ-057: sorted set keyed by last-seen timestamp (score), not a plain
    // SET, so /economics/live can filter to a recent activity window instead
    // of accumulating every agent_id ever seen. ZADD on an existing member
    // updates its score, so re-adding the same agent_id just refreshes it.
    pipeline.zadd('metrics:live:active_agents', Date.now().toString(), event.agent_id);

    // Publish for WebSocket subscribers
    pipeline.publish('events', JSON.stringify(event));

    await pipeline.exec();
  }

  /**
   * Emit cost event to the governance audit bus.
   */
  private emitToAuditBus(event: CostEvent): void {
    if (!this.auditBridge) return;

    this.auditBridge.emit({
      event_type: ECONOMICS_EVENT_TYPES.COST_EVENT,
      agent_id: event.agent_id,
      session_id: event.session_id,
      detail: {
        event_type: event.event_type,
        model: event.model,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        cache_read_tokens: event.cache_read_tokens,
        cost_cents: event.cost_cents,
        latency_ms: event.latency_ms,
        project_id: event.project_id,
        feature_id: event.feature_id,
        routed_tier: event.routed_tier,
      },
      outcome: 'info',
    });
  }

  /**
   * Query cost data for an agent in the current session.
   */
  async getAgentSessionCost(
    agentId: string,
    sessionId: string,
  ): Promise<{ total_cost_cents: number; total_events: number }> {
    const result = await query<{
      total_cost_cents: string;
      total_events: string;
    }>(
      `SELECT COALESCE(SUM(cost_cents), 0) as total_cost_cents,
              COUNT(*) as total_events
       FROM cost_events
       WHERE agent_id = $1 AND session_id = $2`,
      [agentId, sessionId],
    );
    return {
      total_cost_cents: parseInt(result.rows[0].total_cost_cents, 10),
      total_events: parseInt(result.rows[0].total_events, 10),
    };
  }

  /**
   * Query cost data for a project in the current period.
   */
  async getProjectCost(
    projectId: string,
  ): Promise<{
    total_cost_cents: number;
    total_events: number;
    total_input_tokens: number;
    total_output_tokens: number;
  }> {
    const result = await query<{
      total_cost_cents: string;
      total_events: string;
      total_input_tokens: string;
      total_output_tokens: string;
    }>(
      `SELECT
        COALESCE(total_cost_cents, 0) as total_cost_cents,
        COALESCE(total_events, 0) as total_events,
        COALESCE(total_input_tokens, 0) as total_input_tokens,
        COALESCE(total_output_tokens, 0) as total_output_tokens
       FROM cost_ledger
       WHERE scope_type = 'project' AND scope_id = $1
         AND period_start = date_trunc('month', NOW())`,
      [projectId],
    );
    if (result.rows.length === 0) {
      return {
        total_cost_cents: 0,
        total_events: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      };
    }
    return {
      total_cost_cents: parseInt(result.rows[0].total_cost_cents, 10),
      total_events: parseInt(result.rows[0].total_events, 10),
      total_input_tokens: parseInt(result.rows[0].total_input_tokens, 10),
      total_output_tokens: parseInt(result.rows[0].total_output_tokens, 10),
    };
  }
}
