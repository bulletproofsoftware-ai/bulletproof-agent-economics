// =============================================================================
// GET /economics/trends — Historical daily costs with forecast
// REQ-054: 90 days historical, forecasting with 7/14/30 day horizons
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/trends', authMiddleware, async (req, res) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) ?? '30', 10), 90);
    const projectId = req.query.project_id as string | undefined;

    let sql = `
      SELECT
        date_trunc('day', created_at)::date as date,
        SUM(cost_cents) as cost_cents,
        COUNT(*) as events
      FROM cost_events
      WHERE created_at >= NOW() - $1::interval`;
    const params: unknown[] = [`${days} days`];

    if (projectId) {
      sql += ` AND project_id = $2`;
      params.push(projectId);
    }

    sql += ` GROUP BY 1 ORDER BY 1`;

    const result = await query<{ date: string; cost_cents: string; events: string }>(sql, params);

    const history = result.rows.map((r) => ({
      date: r.date,
      cost_cents: parseInt(r.cost_cents, 10),
      events: parseInt(r.events, 10),
    }));

    // Simple linear regression forecast
    const forecast = computeForecast(history);

    res.json({ history, forecast });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

function computeForecast(history: Array<{ cost_cents: number }>): {
  horizon_days: number;
  projected_total_cents: number;
  confidence_low_cents: number;
  confidence_high_cents: number;
  burn_rate_cents_per_day: number;
} {
  if (history.length < 3) {
    return {
      horizon_days: 14,
      projected_total_cents: 0,
      confidence_low_cents: 0,
      confidence_high_cents: 0,
      burn_rate_cents_per_day: 0,
    };
  }

  // Calculate daily average and standard deviation
  const costs = history.map((h) => h.cost_cents);
  const sum = costs.reduce((a, b) => a + b, 0);
  const avg = Math.floor(sum / costs.length);

  const variance =
    costs.reduce((acc, c) => acc + (c - avg) ** 2, 0) / costs.length;
  const stddev = Math.floor(Math.sqrt(variance));

  const horizonDays = 14;
  const projected = avg * horizonDays;

  return {
    horizon_days: horizonDays,
    projected_total_cents: projected,
    confidence_low_cents: Math.max(0, projected - stddev * horizonDays),
    confidence_high_cents: projected + stddev * horizonDays,
    burn_rate_cents_per_day: avg,
  };
}

export default router;
