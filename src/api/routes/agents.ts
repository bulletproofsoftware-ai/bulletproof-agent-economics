// =============================================================================
// Agent cost endpoints
// REQ-040
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /economics/agents/:id/session — Current session cost for agent
router.get('/agents/:id/session', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sessionId = (req.query.session_id as string) ?? null;

    let sql = `SELECT
        COALESCE(SUM(cost_cents), 0) as total_cost_cents,
        COUNT(*) as total_events,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        MAX(created_at) as last_event_at
       FROM cost_events
       WHERE agent_id = $1`;
    const params: unknown[] = [id];

    if (sessionId) {
      sql += ' AND session_id = $2';
      params.push(sessionId);
    } else {
      // Get most recent session
      sql += ` AND session_id = (
        SELECT session_id FROM cost_events WHERE agent_id = $1
        ORDER BY created_at DESC LIMIT 1
      )`;
    }

    const result = await query(sql, params);
    res.json({
      agent_id: id,
      session_id: sessionId,
      ...result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// GET /economics/agents/:id/ledger — Full cost ledger for agent
router.get('/agents/:id/ledger', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM cost_ledger
       WHERE scope_type = 'agent' AND scope_id = $1
       ORDER BY period_start DESC
       LIMIT 12`,
      [id],
    );
    res.json({ agent_id: id, ledger: result.rows });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

export default router;
