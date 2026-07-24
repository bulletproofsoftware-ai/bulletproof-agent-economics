// =============================================================================
// GET /economics/live — Real-time cost rate, active agents, spend vs budget
// REQ-053
// =============================================================================

import { Router } from 'express';
import { getRedis } from '../../redis.js';
import { query } from '../../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../../config.js';

const router = Router();

router.get('/live', authMiddleware, async (_req, res) => {
  try {
    const redis = getRedis();

    // REQ-057: "active" = an event within the last activeAgentWindowMinutes.
    // metrics:live:active_agents is a sorted set (score = last-seen ms epoch,
    // written by MeteringEngine via ZADD) rather than a plain SET, so stale
    // agents naturally age out of the window instead of accumulating forever.
    const windowCutoffMs = Date.now() - config.activeAgentWindowMinutes * 60_000;

    // REQ-057 follow-up: cost_rate_cents_per_hour used to be a Redis value
    // that nothing ever wrote or expired, so it stuck at whatever it was
    // last manually set to. Compute it live from real spend in a trailing
    // window instead — no cache to go stale.
    const rateWindowMinutes = config.costRateWindowMinutes;
    const rateWindowStart = new Date(Date.now() - rateWindowMinutes * 60_000).toISOString();

    const [costRateResult, activeAgents, eventsPerMinRaw] = await Promise.all([
      query<{ window_cost_cents: string | null }>(
        `SELECT COALESCE(SUM(cost_cents), 0) as window_cost_cents
         FROM cost_events
         WHERE created_at >= $1`,
        [rateWindowStart],
      ),
      redis.zrangebyscore('metrics:live:active_agents', windowCutoffMs, '+inf'),
      redis.get('metrics:live:events_per_minute'),
    ]);
    const windowCostCents = parseInt(costRateResult.rows[0]?.window_cost_cents ?? '0', 10);
    const costRateCentsPerHour = Math.round(windowCostCents * (60 / rateWindowMinutes));

    // Opportunistically prune members older than the window so the sorted
    // set doesn't grow unbounded either — best-effort, doesn't block the
    // response if it fails.
    redis.zremrangebyscore('metrics:live:active_agents', '-inf', windowCutoffMs).catch(() => {});

    // Get project budget statuses
    const projectsResult = await query<{
      project_id: string;
      total_cost_cents: string;
      budget_cap_cents: string | null;
    }>(
      `SELECT
        cl.scope_id as project_id,
        cl.budget_spent_cents as total_cost_cents,
        bc.cap_cents as budget_cap_cents
       FROM cost_ledger cl
       LEFT JOIN budget_configs bc ON bc.scope_type = 'project' AND bc.scope_id = cl.scope_id
       WHERE cl.scope_type = 'project'
         AND cl.period_start = date_trunc('month', NOW())
       ORDER BY cl.budget_spent_cents DESC
       LIMIT 20`,
    );

    const projects = projectsResult.rows.map((r) => {
      const spent = parseInt(r.total_cost_cents, 10);
      const cap = r.budget_cap_cents ? parseInt(r.budget_cap_cents, 10) : null;
      return {
        project_id: r.project_id,
        spent_cents: spent,
        cap_cents: cap,
        pct_used: cap ? Math.floor((spent * 100) / cap) : 0,
      };
    });

    // Get recent events
    const recentResult = await query(
      `SELECT * FROM cost_events ORDER BY created_at DESC LIMIT 10`,
    );

    res.json({
      cost_rate_cents_per_hour: costRateCentsPerHour,
      active_agents: activeAgents,
      events_per_minute: parseInt(eventsPerMinRaw ?? '0', 10),
      projects,
      recent_events: recentResult.rows,
      cache_hit_rate: 0, // Will be populated by token optimizer
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live metrics', ...(process.env.NODE_ENV !== 'production' && { detail: (err as Error).message }) });
  }
});

export default router;
