// =============================================================================
// src/budget/budget-controller.ts — 4-tier threshold budget enforcement
// REQ-043: Real-time budget enforcement with configurable caps
// REQ-045: Graceful degradation on budget exhaustion
// =============================================================================

import type {
  BudgetDecision,
  BudgetAction,
  BudgetConfig,
  BudgetState,
  ModelTier,
  EconomicsAuditEvent,
} from '../types.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { config } from '../config.js';
import {
  getProjectBudget,
  getAgentSessionBudget,
  atomicIncrementAndCheck,
  type BudgetSnapshot,
} from './budget-state.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

// Auto-downgrade chain when budget hits soft cap. Only Claude tiers participate;
// other providers (Gemini, image, voice) don't downgrade — caller must pick a model.
const TIER_DOWNGRADE_MAP: Record<ModelTier, ModelTier | null> = {
  opus: 'sonnet',
  sonnet: 'haiku',
  haiku: null,
  'gemini-flash': null,
  'gemini-pro': 'gemini-flash',
  'nano-banana-pro': null,
  elevenlabs: null,
  // REQ-057: new router tiers — no auto-downgrade path. Fable/external-CLI/local/
  // media tiers are explicitly chosen by the caller, not part of the Claude
  // budget-driven downgrade chain. Present here only because the map is
  // exhaustive over ModelTier (compile-time requirement).
  fable: null,
  'ollama-local': null,
  codex: null,
  agy: null,
  veo: null,
  'edge-tts': null,
};

export class BudgetController {
  private auditBridge: AuditBusBridge | null = null;
  private onBudgetEvent: ((event: BudgetDecision & { project_id: string }) => void) | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Register a callback for budget events (used by WebSocket publisher).
   */
  onEvent(handler: (event: BudgetDecision & { project_id: string }) => void): void {
    this.onBudgetEvent = handler;
  }

  /**
   * Check budget before allowing a call. Returns a BudgetDecision
   * indicating whether to proceed and what action to take.
   *
   * State machine:
   *   <60%  → ALLOW (healthy)
   *   60-79% → ALLOW + monitor log
   *   80-89% → WARN + downgrade model tier
   *   90-99% → THROTTLE new dispatches
   *   >=100% → BLOCK (hard pause)
   */
  async checkBudget(
    projectId: string,
    agentId: string,
    sessionId: string,
    currentTier: ModelTier,
    budgetConfig?: Partial<BudgetConfig>,
  ): Promise<BudgetDecision> {
    // Get current budget state
    const projectBudget = await getProjectBudget(projectId);
    const sessionBudget = await getAgentSessionBudget(agentId, sessionId);

    // Use project budget as primary (session budget is secondary)
    const budget = projectBudget.cap_cents > 0 ? projectBudget : sessionBudget;

    // No budget cap set — allow everything
    if (budget.cap_cents === 0) {
      return {
        action: 'ALLOW',
        threshold_pct: 0,
        spent_cents: budget.spent_cents,
        cap_cents: budget.cap_cents,
        remaining_cents: 0,
        anomaly: false,
      };
    }

    const thresholds = {
      monitor: budgetConfig?.threshold_monitor_pct ?? config.budgetThresholdMonitorPct,
      warn: budgetConfig?.threshold_warn_pct ?? config.budgetThresholdWarnPct,
      throttle: budgetConfig?.threshold_throttle_pct ?? config.budgetThresholdThrottlePct,
      pause: budgetConfig?.threshold_pause_pct ?? config.budgetThresholdPausePct,
    };

    const pct = budget.pct_used;
    const remaining = Math.max(0, budget.cap_cents - budget.spent_cents);

    let action: BudgetAction;
    let downgrade: ModelTier | undefined;

    if (pct >= thresholds.pause) {
      action = 'BLOCK';
      this.emitBudgetEvent(projectId, pct, budget, 'pause');
    } else if (pct >= thresholds.throttle) {
      action = 'THROTTLE';
      this.emitBudgetEvent(projectId, pct, budget, 'throttle');
    } else if (pct >= thresholds.warn) {
      action = 'DOWNGRADE';
      downgrade = TIER_DOWNGRADE_MAP[currentTier] ?? currentTier;
      this.emitBudgetEvent(projectId, pct, budget, 'warn', currentTier, downgrade);
    } else if (pct >= thresholds.monitor) {
      action = 'ALLOW';
      this.emitBudgetEvent(projectId, pct, budget, 'monitor');
    } else {
      action = 'ALLOW';
    }

    const decision: BudgetDecision = {
      action,
      threshold_pct: pct,
      spent_cents: budget.spent_cents,
      cap_cents: budget.cap_cents,
      remaining_cents: remaining,
      anomaly: false,
      ...(downgrade ? { downgrade_to: downgrade } : {}),
    };

    if (this.onBudgetEvent) {
      this.onBudgetEvent({ ...decision, project_id: projectId });
    }

    return decision;
  }

  /**
   * Perform atomic budget increment after a cost event.
   * Returns updated budget state.
   */
  async recordSpend(
    projectId: string,
    _agentId: string,
    _sessionId: string,
    costCents: number,
  ): Promise<BudgetSnapshot> {
    return atomicIncrementAndCheck(
      `budget:project:${projectId}:spent_cents`,
      `budget:project:${projectId}:cap_cents`,
      costCents,
    );
  }

  /**
   * Determine the current budget state for display purposes.
   */
  determineBudgetState(pct: number): BudgetState {
    if (pct >= config.budgetThresholdPausePct) return 'PAUSED';
    if (pct >= config.budgetThresholdThrottlePct) return 'THROTTLE';
    if (pct >= config.budgetThresholdWarnPct) return 'WARN';
    if (pct >= config.budgetThresholdMonitorPct) return 'MONITOR';
    return 'HEALTHY';
  }

  /**
   * Emit budget events to the audit bus.
   */
  private emitBudgetEvent(
    projectId: string,
    pct: number,
    budget: BudgetSnapshot,
    actionTaken: string,
    downgradedFrom?: ModelTier,
    downgradedTo?: ModelTier,
  ): void {
    if (!this.auditBridge) return;

    let eventType: string;
    let outcome: EconomicsAuditEvent['outcome'];

    if (actionTaken === 'monitor') {
      eventType = ECONOMICS_EVENT_TYPES.BUDGET_WARNING;
      outcome = 'warn';
    } else if (actionTaken === 'pause') {
      eventType = ECONOMICS_EVENT_TYPES.BUDGET_ENFORCEMENT;
      outcome = 'deny';
    } else {
      eventType = ECONOMICS_EVENT_TYPES.BUDGET_BREACH;
      outcome = 'warn';
    }

    this.auditBridge.emit({
      event_type: eventType as EconomicsAuditEvent['event_type'],
      agent_id: 'budget-controller',
      detail: {
        scope_type: 'project',
        scope_id: projectId,
        threshold_pct: pct,
        spent_cents: budget.spent_cents,
        cap_cents: budget.cap_cents,
        action_taken: actionTaken,
        ...(downgradedFrom ? { downgraded_from: downgradedFrom } : {}),
        ...(downgradedTo ? { downgraded_to: downgradedTo } : {}),
      },
      outcome,
    });
  }
}
