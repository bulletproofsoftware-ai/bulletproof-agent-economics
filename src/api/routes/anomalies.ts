// =============================================================================
// Anomaly endpoints
// REQ-052
// =============================================================================

import { Router } from 'express';
import { query } from '../../database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = Router();

// GET /economics/anomalies — Recent anomaly events
router.get('/anomalies', authMiddleware, async (_req, res) => {
  try {
    // Query audit_events table via PostgreSQL (anomalies are also stored in the
    // audit bus, but we query from the cost_events perspective here)
    const result = await query(
      `SELECT ce.*, ce.cost_cents as current_cost_cents
       FROM cost_events ce
       WHERE ce.cost_cents > (
         SELECT COALESCE(AVG(ce2.cost_cents) * 10, 0)
         FROM cost_events ce2
         WHERE ce2.agent_id = ce.agent_id
           AND ce2.created_at >= NOW() - interval '7 days'
           AND ce2.created_at < ce.created_at
       )
       AND ce.created_at >= NOW() - interval '24 hours'
       ORDER BY ce.created_at DESC
       LIMIT 50`,
    );
    res.json({ anomalies: result.rows });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

// POST /economics/anomalies/:id/resolve — Mark anomaly investigated
router.post('/anomalies/:id/resolve', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as { resolution: string };

    if (!body.resolution) {
      res.status(400).json({ error: 'resolution is required' });
      return;
    }

    // Mark the event as resolved (add resolution metadata)
    await query(
      `UPDATE cost_events SET routing_signals = jsonb_set(
        COALESCE(routing_signals, '{}'::jsonb),
        '{anomaly_resolution}',
        $2::jsonb
       ) WHERE event_id = $1`,
      [id, JSON.stringify({ resolved: true, resolution: body.resolution, resolved_at: new Date().toISOString() })],
    );

    res.json({ status: 'resolved', event_id: id });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err as Error).message });
  }
});

export default router;
