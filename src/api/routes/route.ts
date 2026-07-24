// =============================================================================
// POST /economics/route — Live model/media routing endpoint
// REQ-057: exposes the existing ModelRouter.routeTask() over HTTP so external
// callers (e.g. the Claude Code UserPromptSubmit hook) can get a routing
// recommendation without importing agent-economics as a library.
// =============================================================================

import { Router } from 'express';
import { ModelRouter } from '../../router/model-router.js';
import { classifyMediaIntent } from '../../router/complexity-classifier.js';

const router = Router();

// Matches the events.ts pattern: module-level instance, no auditBridge
// (routing recommendations from this endpoint are advisory-only lookups,
// not actual LLM calls — the real cost event is recorded separately via
// POST /economics/events when the call actually happens).
const modelRouter = new ModelRouter();

router.post('/route', async (req, res) => {
  try {
    const body = req.body as {
      taskDescription?: unknown;
      agentId?: unknown;
      estimatedTokens?: unknown;
      fileCount?: unknown;
      toolCallCount?: unknown;
      codeDiffLines?: unknown;
    };

    if (!body.taskDescription || typeof body.taskDescription !== 'string') {
      res.status(400).json({ error: 'taskDescription is required and must be a string' });
      return;
    }
    if (!body.agentId || typeof body.agentId !== 'string') {
      res.status(400).json({ error: 'agentId is required and must be a string' });
      return;
    }

    const decision = await modelRouter.routeTask({
      taskDescription: body.taskDescription,
      agentId: body.agentId,
      estimatedTokens: typeof body.estimatedTokens === 'number' ? body.estimatedTokens : undefined,
      fileCount: typeof body.fileCount === 'number' ? body.fileCount : undefined,
      toolCallCount: typeof body.toolCallCount === 'number' ? body.toolCallCount : undefined,
      codeDiffLines: typeof body.codeDiffLines === 'number' ? body.codeDiffLines : undefined,
    });

    const media = classifyMediaIntent(body.taskDescription);

    res.json({ ...decision, media });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to compute routing decision',
      ...(process.env.NODE_ENV !== 'production' && { detail: (err as Error).message }),
    });
  }
});

export default router;
