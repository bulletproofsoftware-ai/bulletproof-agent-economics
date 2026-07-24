// =============================================================================
// src/audit/event-types.ts — 8 economics event type definitions
// Canonical from SHARED-audit-bus-schema.md
// =============================================================================

import type {
  EconomicsEventType,
  CostEvent,
} from '../types.js';

import { ECONOMICS_EVENT_TYPES } from '../types.js';

// Re-export for convenience
export { ECONOMICS_EVENT_TYPES };

/**
 * Detail schemas for each economics event type.
 * These go into the `detail` JSON column of the audit_events table.
 */

export interface CostEventDetail {
  event_type: CostEvent['event_type'];
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_cents: number;
  latency_ms: number;
  project_id: string;
  feature_id: string | null;
  routed_tier: string;
}

export interface BudgetWarningDetail {
  scope_type: 'project' | 'agent';
  scope_id: string;
  threshold_pct: number;
  spent_cents: number;
  cap_cents: number;
  action_taken: 'monitor';
}

export interface BudgetBreachDetail {
  scope_type: 'project' | 'agent';
  scope_id: string;
  threshold_pct: number;
  spent_cents: number;
  cap_cents: number;
  action_taken: 'warn' | 'downgrade' | 'throttle';
  downgraded_from?: string;
  downgraded_to?: string;
}

export interface BudgetEnforcementDetail {
  scope_type: 'project' | 'agent';
  scope_id: string;
  threshold_pct: number;
  spent_cents: number;
  cap_cents: number;
  action_taken: 'pause';
  checkpoint_saved: boolean;
  tasks_queued: number;
}

export interface AnomalyDetail {
  agent_id: string;
  task_id: string;
  cost_cents: number;
  baseline_avg_cents: number;
  multiplier: number;
  action_taken: 'auto_pause';
  requires_investigation: true;
}

export interface ModelRoutedDetail {
  task_type: string;
  complexity_signals: {
    estimated_tokens: number;
    file_count: number;
    tool_call_count: number;
    requires_reasoning: boolean;
    task_classification: string;
  };
  selected_tier: 'haiku' | 'sonnet' | 'opus';
  selected_model: string;
  estimated_cost_cents: number;
  manual_override: boolean;
  override_by?: string;
  override_rationale?: string;
}

export interface CacheSavingsDetail {
  layer: string;
  key: string;
  savings_cents: number;
  tokens_saved: number;
  cumulative_savings_cents: number;
}

export interface ChargebackGeneratedDetail {
  report_id: string;
  period_start: string;
  period_end: string;
  scope_type: string;
  scope_id: string;
  total_cost_cents: number;
  generation_ms: number;
}

export type EconomicsDetail =
  | CostEventDetail
  | BudgetWarningDetail
  | BudgetBreachDetail
  | BudgetEnforcementDetail
  | AnomalyDetail
  | ModelRoutedDetail
  | CacheSavingsDetail
  | ChargebackGeneratedDetail;

/**
 * Map an economics event type to the appropriate outcome value
 * for the audit_events table.
 */
export function eventTypeToOutcome(
  eventType: EconomicsEventType,
): 'allow' | 'deny' | 'warn' | 'error' | 'info' {
  switch (eventType) {
    case ECONOMICS_EVENT_TYPES.COST_EVENT:
      return 'info';
    case ECONOMICS_EVENT_TYPES.BUDGET_WARNING:
      return 'warn';
    case ECONOMICS_EVENT_TYPES.BUDGET_BREACH:
      return 'warn';
    case ECONOMICS_EVENT_TYPES.BUDGET_ENFORCEMENT:
      return 'deny';
    case ECONOMICS_EVENT_TYPES.ANOMALY_DETECTED:
      return 'deny';
    case ECONOMICS_EVENT_TYPES.MODEL_ROUTED:
      return 'info';
    case ECONOMICS_EVENT_TYPES.CACHE_SAVINGS:
      return 'info';
    case ECONOMICS_EVENT_TYPES.CHARGEBACK_GENERATED:
      return 'info';
    default:
      return 'info';
  }
}
