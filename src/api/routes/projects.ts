// =============================================================================
// Project cost and budget endpoints
// REQ-041, REQ-043
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { setProjectBudgetCap, getProjectBudget } from '../../budget/budget-state.js';

const router = Router();

// GET /economics/projects/:id — Project cost breakdown
router.get('/projects/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const ledgerResult = await query(
      `SELECT * FROM cost_ledger
       WHERE scope_type = 'project' AND scope_id = $1
         AND period_start = date_trunc('month', NOW())`,
      [id],
    );

    const agentsResult = await query(
      `SELECT agent_id, SUM(cost_cents) as total_cost_cents, COUNT(*) as total_events
       FROM cost_events
       WHERE project_id = $1 AND created_at >= date_trunc('month', NOW())
       GROUP BY agent_id
       ORDER BY total_cost_cents DESC`,
      [id],
    );

    const budget = await getProjectBudget(id);

    res.json({
      project_id: id,
      ledger: ledgerResult.rows[0] ?? null,
      agent_breakdown: agentsResult.rows,
      budget,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// GET /economics/projects/:id/budget — Budget config + current spend
router.get('/projects/:id/budget', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    // Columns are listed explicitly rather than SELECT *: budget_configs
    // holds webhook_secret and slack_webhook_url, and this endpoint is
    // readable by any authenticated caller including viewers, so a wildcard
    // select handed out the alerting credentials with the budget.
    const configResult = await query(
      `SELECT id, scope_type, scope_id, cap_cents, period_type,
              threshold_monitor_pct, threshold_warn_pct,
              threshold_throttle_pct, threshold_pause_pct,
              inheritance_strategy, agent_weights, alert_channels,
              email_recipients, created_by, created_at, updated_at
         FROM budget_configs
        WHERE scope_type = 'project' AND scope_id = $1`,
      [id],
    );
    const budget = await getProjectBudget(id);

    res.json({
      config: configResult.rows[0] ?? null,
      current: budget,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// PUT /economics/projects/:id/budget — Update budget configuration
router.put('/projects/:id/budget', authMiddleware, adminOnly, rateLimit(20, 60000), async (req, res) => {
  try {
    const id = req.params.id as string;
    const body = req.body as {
      cap_cents: number;
      period_type?: string;
      inheritance_strategy?: string;
      agent_weights?: Record<string, number>;
      threshold_monitor_pct?: number;
      threshold_warn_pct?: number;
      threshold_throttle_pct?: number;
      threshold_pause_pct?: number;
      alert_channels?: string[];
      slack_webhook_url?: string;
      email_recipients?: string[];
      webhook_url?: string;
      webhook_secret?: string;
    };

    if (!body.cap_cents || typeof body.cap_cents !== 'number' || body.cap_cents <= 0) {
      res.status(400).json({ error: 'cap_cents must be a positive integer' });
      return;
    }

    // Upsert budget config
    await query(
      `INSERT INTO budget_configs (
        scope_type, scope_id, cap_cents, period_type,
        inheritance_strategy, agent_weights,
        threshold_monitor_pct, threshold_warn_pct,
        threshold_throttle_pct, threshold_pause_pct,
        alert_channels, slack_webhook_url, email_recipients,
        webhook_url, webhook_secret, created_by, updated_at
      ) VALUES ('project', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (scope_type, scope_id)
      DO UPDATE SET
        cap_cents = $2, period_type = $3,
        inheritance_strategy = $4, agent_weights = $5,
        threshold_monitor_pct = $6, threshold_warn_pct = $7,
        threshold_throttle_pct = $8, threshold_pause_pct = $9,
        alert_channels = $10, slack_webhook_url = $11,
        email_recipients = $12, webhook_url = $13,
        webhook_secret = $14, updated_at = NOW()`,
      [
        id,
        body.cap_cents,
        body.period_type ?? 'monthly',
        body.inheritance_strategy ?? 'POOL',
        body.agent_weights ? JSON.stringify(body.agent_weights) : null,
        body.threshold_monitor_pct ?? 60,
        body.threshold_warn_pct ?? 80,
        body.threshold_throttle_pct ?? 90,
        body.threshold_pause_pct ?? 100,
        JSON.stringify(body.alert_channels ?? ['slack']),
        body.slack_webhook_url ?? null,
        body.email_recipients ?? null,
        body.webhook_url ?? null,
        body.webhook_secret ?? null,
        'api-user',
      ],
    );

    // Update Redis budget cap
    await setProjectBudgetCap(id, body.cap_cents);

    res.json({ status: 'ok', project_id: id, cap_cents: body.cap_cents });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

export default router;
