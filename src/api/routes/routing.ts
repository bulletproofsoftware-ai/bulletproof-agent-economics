// =============================================================================
// Routing decision endpoints
// REQ-047
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { MODEL_PRICING, type ModelTier } from '../../types.js';

const router = Router();

// GET /economics/routing/history — Routing decision log
router.get('/routing/history', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const result = await query(
      `SELECT agent_id, model, routed_tier, routing_signals,
              manual_override, override_by, created_at
       FROM cost_events
       WHERE routing_signals IS NOT NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json({ decisions: result.rows });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// POST /economics/routing/override — Manual model tier override
router.post('/routing/override', authMiddleware, adminOnly, rateLimit(10, 60000), async (req, res) => {
  try {
    const body = req.body as {
      agent_id: string;
      override_tier: ModelTier;
      rationale: string;
    };

    if (!body.agent_id || !body.override_tier || !body.rationale) {
      res.status(400).json({ error: 'agent_id, override_tier, and rationale are required' });
      return;
    }

    if (!Object.keys(MODEL_PRICING).includes(body.override_tier)) {
      res.status(400).json({
        error: `override_tier must be one of: ${Object.keys(MODEL_PRICING).join(', ')}`,
      });
      return;
    }

    // Store override in database for audit trail
    const userReq = req as typeof req & { user?: { sub: string } };
    await query(
      `INSERT INTO cost_events (
        event_id, event_type, agent_id, session_id, project_id,
        model, input_tokens, output_tokens, cache_read_tokens,
        cost_cents, latency_ms, routed_tier, routing_signals,
        manual_override, override_by, created_at
      ) VALUES (
        gen_random_uuid(), 'llm_call', $1, 'manual-override', 'manual-override',
        $2, 0, 0, 0, 0, 0, $3, $4, true, $5, NOW()
      )`,
      [
        body.agent_id,
        `claude-${body.override_tier}`,
        body.override_tier,
        JSON.stringify({ rationale: body.rationale }),
        userReq.user?.sub ?? 'admin',
      ],
    );

    res.json({
      status: 'ok',
      agent_id: body.agent_id,
      override_tier: body.override_tier,
      override_by: userReq.user?.sub ?? 'admin',
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

export default router;
