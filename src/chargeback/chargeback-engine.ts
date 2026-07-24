// =============================================================================
// src/chargeback/chargeback-engine.ts — Multi-level chargeback reporting
// REQ-050: Org > Dept > Project > Feature > Agent > Session
// =============================================================================

import type { ChargebackReport } from '../types.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { generateReport, reportToCSV, type ReportScope } from './report-generator.js';
import { computeROI, getProjectROI } from './roi-calculator.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export class ChargebackEngine {
  private auditBridge: AuditBusBridge | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Generate a chargeback report at the specified scope level.
   */
  async generateChargebackReport(
    periodStart: string,
    periodEnd: string,
    scope: ReportScope,
    scopeId?: string,
  ): Promise<ChargebackReport> {
    const report = await generateReport(periodStart, periodEnd, scope, scopeId);

    // Emit to audit bus
    if (this.auditBridge) {
      this.auditBridge.emit({
        event_type: ECONOMICS_EVENT_TYPES.CHARGEBACK_GENERATED,
        agent_id: 'chargeback-engine',
        detail: {
          report_id: report.report_id,
          period_start: periodStart,
          period_end: periodEnd,
          scope_type: scope,
          scope_id: scopeId ?? 'all',
          total_cost_cents: report.summary.total_cost_cents,
          generation_ms: report.generation_ms,
        },
        outcome: 'info',
      });
    }

    return report;
  }

  /**
   * Export a chargeback report as CSV.
   */
  exportCSV(report: ChargebackReport): string {
    return reportToCSV(report);
  }

  /**
   * Compute ROI for a specific feature.
   */
  async computeFeatureROI(
    featureId: string,
    projectId: string,
    storyPoints: number,
  ) {
    return computeROI(featureId, projectId, storyPoints);
  }

  /**
   * Get all ROI calculations for a project.
   */
  async getProjectROI(projectId: string) {
    return getProjectROI(projectId);
  }
}
