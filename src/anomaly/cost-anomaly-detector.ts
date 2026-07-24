// =============================================================================
// src/anomaly/cost-anomaly-detector.ts — 10x baseline detection + auto-pause
// REQ-052: Agents consuming >10x their 7-day average are immediately paused
// =============================================================================

import type { AnomalyEvent } from '../types.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { config } from '../config.js';
import { getAgentBaseline } from './rolling-baseline.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export interface AnomalyCheckResult {
  is_anomaly: boolean;
  multiplier: number;
  baseline_avg_cents: number;
  current_cost_cents: number;
  action: 'none' | 'auto_pause';
}

export class CostAnomalyDetector {
  private auditBridge: AuditBusBridge | null = null;
  private onAnomaly: ((event: AnomalyEvent) => void) | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Register a callback for anomaly events (used by WebSocket publisher).
   */
  onAnomalyDetected(handler: (event: AnomalyEvent) => void): void {
    this.onAnomaly = handler;
  }

  /**
   * Check if a cost event is anomalous relative to the agent's baseline.
   *
   * Anomaly condition: cost > (baseline_avg * anomaly_multiplier_threshold)
   * Default threshold: 10x
   *
   * If the agent has no baseline (fewer than 3 data points),
   * anomaly detection is skipped to avoid false positives during ramp-up.
   */
  async checkForAnomaly(
    agentId: string,
    sessionId: string,
    taskId: string,
    currentCostCents: number,
  ): Promise<AnomalyCheckResult> {
    const baseline = await getAgentBaseline(agentId);

    // Skip anomaly detection if insufficient baseline data
    if (baseline.data_points < 3) {
      return {
        is_anomaly: false,
        multiplier: 0,
        baseline_avg_cents: baseline.avg_cost_cents,
        current_cost_cents: currentCostCents,
        action: 'none',
      };
    }

    // Skip if baseline average is zero (avoid division by zero)
    if (baseline.avg_cost_cents === 0) {
      return {
        is_anomaly: false,
        multiplier: 0,
        baseline_avg_cents: 0,
        current_cost_cents: currentCostCents,
        action: 'none',
      };
    }

    // Integer arithmetic for multiplier calculation
    // multiplier = current_cost / baseline_avg (as a whole number multiple)
    const multiplier = currentCostCents / baseline.avg_cost_cents;

    if (multiplier >= config.anomalyMultiplierThreshold) {
      const anomalyEvent: AnomalyEvent = {
        agent_id: agentId,
        session_id: sessionId,
        task_id: taskId,
        current_cost_cents: currentCostCents,
        baseline_avg_cents: baseline.avg_cost_cents,
        multiplier,
        action: 'auto_pause',
        timestamp: new Date().toISOString(),
      };

      // Emit to audit bus
      this.emitAnomalyEvent(anomalyEvent);

      // Notify subscribers
      if (this.onAnomaly) {
        this.onAnomaly(anomalyEvent);
      }

      return {
        is_anomaly: true,
        multiplier,
        baseline_avg_cents: baseline.avg_cost_cents,
        current_cost_cents: currentCostCents,
        action: 'auto_pause',
      };
    }

    return {
      is_anomaly: false,
      multiplier,
      baseline_avg_cents: baseline.avg_cost_cents,
      current_cost_cents: currentCostCents,
      action: 'none',
    };
  }

  /**
   * Emit anomaly event to the governance audit bus.
   */
  private emitAnomalyEvent(event: AnomalyEvent): void {
    if (!this.auditBridge) return;

    this.auditBridge.emit({
      event_type: ECONOMICS_EVENT_TYPES.ANOMALY_DETECTED,
      agent_id: event.agent_id,
      session_id: event.session_id,
      task_id: event.task_id,
      detail: {
        agent_id: event.agent_id,
        task_id: event.task_id,
        cost_cents: event.current_cost_cents,
        baseline_avg_cents: event.baseline_avg_cents,
        multiplier: event.multiplier,
        action_taken: 'auto_pause',
        requires_investigation: true,
      },
      outcome: 'deny',
    });
  }
}
