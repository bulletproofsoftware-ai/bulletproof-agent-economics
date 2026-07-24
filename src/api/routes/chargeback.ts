// =============================================================================
// Chargeback and ROI endpoints
// REQ-050, REQ-051
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /economics/chargeback — Chargeback report for period
router.get('/chargeback', authMiddleware, async (req, res) => {
  try {
    const startDate = (req.query.start as string) ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const endDate = (req.query.end as string) ?? new Date().toISOString().split('T')[0];
    const scopeType = (req.query.scope as string) ?? 'project';

    const start = performance.now();

    const sql = `
      SELECT
        ${scopeType === 'project' ? 'project_id' : scopeType === 'agent' ? 'agent_id' : scopeType === 'department' ? 'department_id' : 'organization_id'} as scope_id,
        SUM(cost_cents) as total_cost_cents,
        COUNT(*) as total_events,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        jsonb_object_agg(DISTINCT model, cost_per_model) as model_breakdown
      FROM (
        SELECT *,
          SUM(cost_cents) OVER (PARTITION BY model, ${scopeType === 'project' ? 'project_id' : scopeType === 'agent' ? 'agent_id' : scopeType === 'department' ? 'department_id' : 'organization_id'}) as cost_per_model
        FROM cost_events
        WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
      ) sub
      GROUP BY 1
      ORDER BY total_cost_cents DESC`;

    const result = await query(sql, [startDate, endDate]);

    const generationMs = Math.round(performance.now() - start);

    const lineItems = result.rows.map((r) => ({
      scope_type: scopeType,
      scope_id: r.scope_id,
      scope_name: r.scope_id,
      total_cost_cents: parseInt(r.total_cost_cents, 10),
      total_events: parseInt(r.total_events, 10),
      total_input_tokens: parseInt(r.total_input_tokens, 10),
      total_output_tokens: parseInt(r.total_output_tokens, 10),
      model_breakdown: r.model_breakdown ?? {},
    }));

    const summary = {
      total_cost_cents: lineItems.reduce((s, i) => s + i.total_cost_cents, 0),
      total_events: lineItems.reduce((s, i) => s + i.total_events, 0),
      total_savings_cents: 0,
    };

    res.json({
      period_start: startDate,
      period_end: endDate,
      scope_type: scopeType,
      line_items: lineItems,
      summary,
      generation_ms: generationMs,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// GET /economics/chargeback/export — CSV/JSON download
router.get('/chargeback/export', authMiddleware, async (req, res) => {
  try {
    const format = (req.query.format as string) ?? 'json';
    const startDate = (req.query.start as string) ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const endDate = (req.query.end as string) ?? new Date().toISOString().split('T')[0];

    const result = await query(
      `SELECT project_id, agent_id, model, SUM(cost_cents) as cost_cents,
              COUNT(*) as events, SUM(input_tokens) as input_tokens,
              SUM(output_tokens) as output_tokens
       FROM cost_events
       WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
       GROUP BY project_id, agent_id, model
       ORDER BY cost_cents DESC`,
      [startDate, endDate],
    );

    if (format === 'csv') {
      const header = 'project_id,agent_id,model,cost_cents,events,input_tokens,output_tokens\n';
      const rows = result.rows
        .map((r) => `${r.project_id},${r.agent_id},${r.model},${r.cost_cents},${r.events},${r.input_tokens},${r.output_tokens}`)
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="chargeback-${startDate}-${endDate}.csv"`);
      res.send(header + rows);
    } else {
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// GET /economics/roi/:feature_id — ROI calculation for feature
router.get('/roi/:feature_id', authMiddleware, async (req, res) => {
  try {
    const { feature_id } = req.params;
    const result = await query(
      `SELECT * FROM roi_calculations WHERE feature_id = $1`,
      [feature_id],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Feature not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

export default router;
