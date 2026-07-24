// =============================================================================
// src/router/model-router.ts — Model routing orchestrator
// REQ-046: Automatic model routing based on task complexity
// REQ-047: Routing decisions logged with manual override audit trail
// =============================================================================

import type { ComplexitySignals, ModelTier, RoutingDecision } from '../types.js';
import { ECONOMICS_EVENT_TYPES, MODEL_PRICING } from '../types.js';
import { extractSignals } from './complexity-classifier.js';
import { makeRoutingDecision } from './routing-rules.js';
import { estimateCostCents } from '../metering/cost-calculator.js';
import { query } from '../database.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export interface RouteTaskInput {
  taskDescription: string;
  agentId: string;
  estimatedTokens?: number;
  fileCount?: number;
  toolCallCount?: number;
  codeDiffLines?: number;
}

export interface OverrideInput {
  agentId: string;
  taskDescription: string;
  overrideTier: ModelTier;
  overrideBy: string;
  rationale: string;
}

export class ModelRouter {
  private auditBridge: AuditBusBridge | null = null;
  private onRoutingDecision: ((decision: RoutingDecision & { agent_id: string }) => void) | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Register a callback for routing decisions (used by WebSocket publisher).
   */
  onDecision(handler: (decision: RoutingDecision & { agent_id: string }) => void): void {
    this.onRoutingDecision = handler;
  }

  /**
   * Route a task to the appropriate model tier.
   * Extracts complexity signals, classifies, logs decision, and emits to audit bus.
   */
  async routeTask(input: RouteTaskInput): Promise<RoutingDecision> {
    const signals = extractSignals({
      taskDescription: input.taskDescription,
      estimatedTokens: input.estimatedTokens,
      fileCount: input.fileCount,
      toolCallCount: input.toolCallCount,
      codeDiffLines: input.codeDiffLines,
    });

    const decision = makeRoutingDecision(signals);

    // Log the decision. REQ-057: a DB failure here must NOT fail the routing
    // recommendation — the /economics/route endpoint (advisory-only) still
    // returns a decision even if the preview row can't be written.
    try {
      await this.logRoutingDecision(input.agentId, decision, false);
    } catch (err) {
      console.error('[model-router] Failed to log routing decision (non-fatal):', (err as Error).message);
    }

    // Emit to audit bus
    this.emitRoutingEvent(input.agentId, decision, false);

    // Notify WebSocket subscribers
    if (this.onRoutingDecision) {
      this.onRoutingDecision({ ...decision, agent_id: input.agentId });
    }

    return decision;
  }

  /**
   * Manually override the model tier for a task.
   * Creates a full audit trail of the override.
   */
  async overrideRoute(input: OverrideInput): Promise<RoutingDecision> {
    const signals = extractSignals({
      taskDescription: input.taskDescription,
    });

    const pricing = MODEL_PRICING[input.overrideTier];
    const estimatedCost = estimateCostCents(
      signals.estimated_tokens,
      Math.ceil(signals.estimated_tokens * 0.3),
      input.overrideTier,
    );

    const decision: RoutingDecision = {
      model_tier: input.overrideTier,
      model_id: pricing.model_id,
      rationale: `Manual override by ${input.overrideBy}: ${input.rationale}`,
      estimated_cost_cents: estimatedCost,
      signals_used: signals,
      confidence: 1.0, // Manual override = full confidence
    };

    // Log with override flag. REQ-057: same non-fatal treatment as routeTask.
    try {
      await this.logRoutingDecision(
        input.agentId,
        decision,
        true,
        input.overrideBy,
        input.rationale,
      );
    } catch (err) {
      console.error('[model-router] Failed to log override decision (non-fatal):', (err as Error).message);
    }

    // Emit to audit bus
    this.emitRoutingEvent(
      input.agentId,
      decision,
      true,
      input.overrideBy,
      input.rationale,
    );

    return decision;
  }

  /**
   * Get routing decision history from the database.
   */
  async getHistory(limit: number = 50): Promise<Array<{
    agent_id: string;
    model: string;
    routed_tier: string;
    routing_signals: ComplexitySignals | null;
    manual_override: boolean;
    override_by: string | null;
    created_at: string;
  }>> {
    const result = await query<{
      agent_id: string;
      model: string;
      routed_tier: string;
      routing_signals: string | null;
      manual_override: boolean;
      override_by: string | null;
      created_at: string;
    }>(
      `SELECT agent_id, model, routed_tier, routing_signals,
              manual_override, override_by, created_at
       FROM cost_events
       WHERE routing_signals IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      ...row,
      routing_signals: row.routing_signals
        ? (JSON.parse(row.routing_signals) as ComplexitySignals)
        : null,
    }));
  }

  /**
   * Log routing decision to the cost_events table.
   */
  private async logRoutingDecision(
    agentId: string,
    decision: RoutingDecision,
    isOverride: boolean,
    overrideBy?: string,
    _overrideRationale?: string,
  ): Promise<void> {
    // Routing decisions are logged as part of the cost event when the actual
    // LLM call is made. This pre-logs the routing signals for audit purposes.
    await query(
      `INSERT INTO cost_events (
        event_id, event_type, agent_id, session_id, project_id,
        model, input_tokens, output_tokens, cache_read_tokens,
        cost_cents, latency_ms, routed_tier, routing_signals,
        manual_override, override_by, created_at
      ) VALUES (
        gen_random_uuid(), 'llm_call', $1, 'routing-preview', 'routing-preview',
        $2, 0, 0, 0, 0, 0, $3, $4, $5, $6, NOW()
      )`,
      [
        agentId,
        decision.model_id,
        decision.model_tier,
        JSON.stringify(decision.signals_used),
        isOverride,
        overrideBy ?? null,
      ],
    );
  }

  /**
   * Emit routing decision to the audit bus.
   */
  private emitRoutingEvent(
    agentId: string,
    decision: RoutingDecision,
    isOverride: boolean,
    overrideBy?: string,
    overrideRationale?: string,
  ): void {
    if (!this.auditBridge) return;

    this.auditBridge.emit({
      event_type: ECONOMICS_EVENT_TYPES.MODEL_ROUTED,
      agent_id: agentId,
      detail: {
        task_type: decision.signals_used.task_classification,
        complexity_signals: {
          estimated_tokens: decision.signals_used.estimated_tokens,
          file_count: decision.signals_used.file_count,
          tool_call_count: decision.signals_used.tool_call_count,
          requires_reasoning: decision.signals_used.requires_reasoning,
          task_classification: decision.signals_used.task_classification,
        },
        selected_tier: decision.model_tier,
        selected_model: decision.model_id,
        estimated_cost_cents: decision.estimated_cost_cents,
        manual_override: isOverride,
        ...(overrideBy ? { override_by: overrideBy } : {}),
        ...(overrideRationale ? { override_rationale: overrideRationale } : {}),
      },
      outcome: 'info',
    });
  }
}
