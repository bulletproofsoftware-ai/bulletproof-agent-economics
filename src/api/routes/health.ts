// =============================================================================
// GET /economics/health — Health check + version
// =============================================================================

import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'agent-economics',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
