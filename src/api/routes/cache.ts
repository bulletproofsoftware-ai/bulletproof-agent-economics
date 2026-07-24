// =============================================================================
// GET /economics/cache/stats — Cache hit rates per layer
// REQ-048
// =============================================================================

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Cache stats are injected at server startup from the TokenOptimizer instance
let getStatsHandler: (() => unknown[]) | null = null;

export function setStatsProvider(handler: () => unknown[]): void {
  getStatsHandler = handler;
}

router.get('/cache/stats', authMiddleware, (_req, res) => {
  if (getStatsHandler) {
    res.json({ layers: getStatsHandler() });
  } else {
    res.json({ layers: [], message: 'Cache stats not available' });
  }
});

export default router;
