// =============================================================================
// src/api/server.ts — Express REST API server (port 8097)
// REQ-053: 16 REST endpoints + WebSocket
// =============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { config } from '../config.js';

// Route imports
import healthRouter from './routes/health.js';
import liveRouter from './routes/live.js';
import projectsRouter from './routes/projects.js';
import agentsRouter from './routes/agents.js';
import trendsRouter from './routes/trends.js';
import chargebackRouter from './routes/chargeback.js';
import routingRouter from './routes/routing.js';
import cacheRouter, { setStatsProvider } from './routes/cache.js';
import anomaliesRouter from './routes/anomalies.js';
import eventsRouter, { setMeteringEngine } from './routes/events.js';
import routeRouter from './routes/route.js';

// Auth middleware
import { authMiddleware } from './middleware/auth.js';

// WebSocket
import { WebSocketManager } from './websocket.js';

// Core systems
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';
import { TokenOptimizer } from '../optimizer/token-optimizer.js';
import { CostAnomalyDetector } from '../anomaly/cost-anomaly-detector.js';
import { BudgetController } from '../budget/budget-controller.js';
import { MeteringEngine } from '../metering/metering-engine.js';

export function createApp() {
  const app = express();

  // Security headers. The previous `contentSecurityPolicy: false` disabled the
  // header outright; this service returns JSON and never HTML, so the correct
  // policy is one that permits nothing at all rather than none at all.
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
  }));

  // Rate limiting. Every /economics route reaches Postgres and several run
  // aggregate queries, so an unthrottled caller can exhaust the pool. Applied
  // before the routers so it covers the unauthenticated health route too.
  app.use('/economics', rateLimit({
    windowMs: 60_000,
    limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate limit exceeded' },
  }));

  // CORS
  app.use(cors({
    origin: [
      `http://localhost:${config.dashboardPort}`,
      'http://localhost:3000',
    ],
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint — unauthenticated
  app.use('/economics', healthRouter);

  // All other routes — require authentication
  app.use('/economics', authMiddleware);
  app.use('/economics', liveRouter);
  app.use('/economics', projectsRouter);
  app.use('/economics', agentsRouter);
  app.use('/economics', trendsRouter);
  app.use('/economics', chargebackRouter);
  app.use('/economics', routingRouter);
  app.use('/economics', cacheRouter);
  app.use('/economics', anomaliesRouter);
  app.use('/economics', eventsRouter);
  app.use('/economics', routeRouter);

  return app;
}

export async function startServer(): Promise<void> {
  const app = createApp();
  const server = createServer(app);

  // Initialize audit bus bridge
  const auditBridge = new AuditBusBridge();
  auditBridge.init();

  // Initialize token optimizer and wire up cache stats
  const tokenOptimizer = new TokenOptimizer(auditBridge);
  setStatsProvider(() => tokenOptimizer.getStats());

  // Attach WebSocket
  const wsManager = new WebSocketManager();
  wsManager.attach(server);

  // Wire up real-time events to WebSocket
  tokenOptimizer.onSavings((data) => {
    wsManager.broadcast({
      type: 'cache_savings',
      data: {
        layer: data.layer,
        savings_cents: data.savings_cents,
        cumulative_savings_cents: data.cumulative,
      },
    });
  });

  // REQ-057: wire anomaly detection + budget enforcement into the live
  // /economics/events ingest path — previously instantiated nowhere, so the
  // dashboard's Alert Feed (budget_update/anomaly_alert) was structurally
  // always empty despite both detectors having working logic + tests.
  const anomalyDetector = new CostAnomalyDetector(auditBridge);
  anomalyDetector.onAnomalyDetected((event) => {
    wsManager.broadcast({ type: 'anomaly_alert', data: event });
  });

  const budgetController = new BudgetController(auditBridge);
  budgetController.onEvent((decision) => {
    wsManager.broadcast({
      type: 'budget_update',
      data: {
        project_id: decision.project_id,
        spent_cents: decision.spent_cents,
        cap_cents: decision.cap_cents,
        pct_used: decision.threshold_pct,
        threshold_action: decision.action !== 'ALLOW' ? decision.action : null,
      },
    });
  });

  setMeteringEngine(new MeteringEngine(auditBridge, anomalyDetector, budgetController));

  // Graceful shutdown
  const shutdown = () => {
    console.log('[server] Shutting down...');
    wsManager.close();
    auditBridge.close();
    server.close(() => {
      console.log('[server] Closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start listening
  server.listen(config.port, () => {
    console.log(`[server] Agent Economics API listening on port ${config.port}`);
    console.log(`[server] WebSocket at ws://localhost:${config.port}/economics/stream`);
    console.log(`[server] Health check: http://localhost:${config.port}/economics/health`);
  });
}

// Auto-start if run directly
const isMainModule = process.argv[1]?.includes('server');
if (isMainModule) {
  startServer().catch((err) => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
}
