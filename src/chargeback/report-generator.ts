// =============================================================================
// src/chargeback/report-generator.ts — CSV + JSON export
// REQ-050: Report generation within 60 seconds for 12 months
// =============================================================================

import { query } from '../database.js';
import type { ChargebackReport, ChargebackLineItem } from '../types.js';
import { randomUUID } from 'node:crypto';

export type ReportScope = 'organization' | 'department' | 'project' | 'feature' | 'agent';

/**
 * Generate a chargeback report for a given period and scope.
 */
export async function generateReport(
  periodStart: string,
  periodEnd: string,
  scope: ReportScope,
  scopeId?: string,
): Promise<ChargebackReport> {
  const startTime = performance.now();

  const scopeColumn = getScopeColumn(scope);

  let sql = `
    SELECT
      ${scopeColumn} as scope_id,
      SUM(cost_cents) as total_cost_cents,
      COUNT(*) as total_events,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens
    FROM cost_events
    WHERE created_at >= $1::date
      AND created_at < ($2::date + interval '1 day')`;

  const params: unknown[] = [periodStart, periodEnd];

  if (scopeId) {
    sql += ` AND ${scopeColumn} = $3`;
    params.push(scopeId);
  }

  sql += ` GROUP BY ${scopeColumn} ORDER BY total_cost_cents DESC`;

  const result = await query<{
    scope_id: string;
    total_cost_cents: string;
    total_events: string;
    total_input_tokens: string;
    total_output_tokens: string;
  }>(sql, params);

  // Get model breakdown for each scope
  const lineItems: ChargebackLineItem[] = [];
  for (const row of result.rows) {
    const modelResult = await query<{
      model: string;
      model_cost: string;
    }>(
      `SELECT model, SUM(cost_cents) as model_cost
       FROM cost_events
       WHERE ${scopeColumn} = $1
         AND created_at >= $2::date
         AND created_at < ($3::date + interval '1 day')
       GROUP BY model`,
      [row.scope_id, periodStart, periodEnd],
    );

    const modelBreakdown: Record<string, number> = {};
    for (const m of modelResult.rows) {
      modelBreakdown[m.model] = parseInt(m.model_cost, 10);
    }

    lineItems.push({
      scope_type: scope,
      scope_id: row.scope_id,
      scope_name: row.scope_id, // Could be enriched with display names
      total_cost_cents: parseInt(row.total_cost_cents, 10),
      total_events: parseInt(row.total_events, 10),
      total_input_tokens: parseInt(row.total_input_tokens, 10),
      total_output_tokens: parseInt(row.total_output_tokens, 10),
      model_breakdown: modelBreakdown,
    });
  }

  const generationMs = Math.round(performance.now() - startTime);

  const report: ChargebackReport = {
    report_id: randomUUID(),
    period_start: periodStart,
    period_end: periodEnd,
    line_items: lineItems,
    summary: {
      total_cost_cents: lineItems.reduce((s, i) => s + i.total_cost_cents, 0),
      total_events: lineItems.reduce((s, i) => s + i.total_events, 0),
      total_savings_cents: 0, // Populated from cache savings
    },
    generated_at: new Date().toISOString(),
    generation_ms: generationMs,
  };

  // Persist to database
  await query(
    `INSERT INTO chargeback_reports (
      report_id, period_start, period_end, scope_type, scope_id,
      line_items, summary, generated_by, generation_ms, format
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'json')`,
    [
      report.report_id,
      periodStart,
      periodEnd,
      scope,
      scopeId ?? 'all',
      JSON.stringify(lineItems),
      JSON.stringify(report.summary),
      'chargeback-engine',
      generationMs,
    ],
  );

  return report;
}

/**
 * Convert a chargeback report to CSV format.
 */
export function reportToCSV(report: ChargebackReport): string {
  const header = 'scope_type,scope_id,scope_name,total_cost_cents,total_events,total_input_tokens,total_output_tokens';
  const rows = report.line_items
    .map(
      (item) =>
        `${item.scope_type},${item.scope_id},${item.scope_name},${item.total_cost_cents},${item.total_events},${item.total_input_tokens},${item.total_output_tokens}`,
    )
    .join('\n');

  return `${header}\n${rows}\n\nSummary\ntotal_cost_cents,${report.summary.total_cost_cents}\ntotal_events,${report.summary.total_events}\ngeneration_ms,${report.generation_ms}`;
}

function getScopeColumn(scope: ReportScope): string {
  switch (scope) {
    case 'organization':
      return 'organization_id';
    case 'department':
      return 'department_id';
    case 'project':
      return 'project_id';
    case 'feature':
      return 'feature_id';
    case 'agent':
      return 'agent_id';
  }
}
