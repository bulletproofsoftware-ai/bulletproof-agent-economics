// =============================================================================
// POST /economics/route tests
// REQ-057
// =============================================================================

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import routeRouter from '../route.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  // Bypass auth for this unit test — mount without authMiddleware.
  app.use('/economics', routeRouter);
  return app;
}

describe('POST /economics/route', () => {
  const app = buildApp();

  it('returns a routing decision for a valid request', async () => {
    const res = await request(app)
      .post('/economics/route')
      .send({ taskDescription: 'fix a typo in the README', agentId: 'test-agent' });
    expect(res.status).toBe(200);
    expect(res.body.model_tier).toBeDefined();
    expect(res.body.model_id).toBeDefined();
    expect(res.body.media).toBeNull();
  });

  it('includes media intent when present in the task description', async () => {
    const res = await request(app)
      .post('/economics/route')
      .send({ taskDescription: 'generate an image of a sunset', agentId: 'test-agent' });
    expect(res.status).toBe(200);
    expect(res.body.media).toEqual({ modality: 'image', tier: 'nano-banana-pro' });
  });

  it('honors explicit signal for tier selection', async () => {
    const res = await request(app)
      .post('/economics/route')
      .send({ taskDescription: 'summarize this +fable', agentId: 'test-agent' });
    expect(res.status).toBe(200);
    expect(res.body.model_tier).toBe('fable');
  });

  it('returns 400 when taskDescription is missing', async () => {
    const res = await request(app)
      .post('/economics/route')
      .send({ agentId: 'test-agent' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when agentId is missing', async () => {
    const res = await request(app)
      .post('/economics/route')
      .send({ taskDescription: 'do something' });
    expect(res.status).toBe(400);
  });
});
