// =============================================================================
// POST /economics/events — Public ingest endpoint for cost events.
// Delegates to MeteringEngine.recordCostEvent() which handles DB + Redis + audit.
// =============================================================================

import { Router } from 'express';
import { MeteringEngine } from '../../metering/metering-engine.js';
import type { MeterCallInput } from '../../metering/metering-engine.js';
import { MODEL_PRICING, type CostEventType, type ModelTier } from '../../types.js';
import { adminOnly } from '../middleware/auth.js';

const router = Router();
let metering = new MeteringEngine();

/**
 * REQ-057: allow server.ts to inject a MeteringEngine wired with the shared
 * AuditBusBridge, CostAnomalyDetector, and BudgetController instances, so
 * /economics/events (the real ingest path used by claude-tracked and the
 * Claude Code hook) actually triggers anomaly/budget checks and WebSocket
 * alerts — not just the module-local instance with no dependencies.
 */
export function setMeteringEngine(engine: MeteringEngine): void {
  metering = engine;
}

const VALID_TYPES = new Set<CostEventType>([
  'llm_call', 'tool_use', 'external_api', 'cache_hit',
]);
const VALID_TIERS = new Set<ModelTier>(Object.keys(MODEL_PRICING) as ModelTier[]);

router.post('/events', adminOnly, async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const required = ['agent_id', 'session_id', 'project_id', 'model', 'routed_tier'];
    for (const k of required) {
      if (!body[k] || typeof body[k] !== 'string') {
        res.status(400).json({ error: `Missing or invalid field: ${k}` });
        return;
      }
    }
    const routedTier = body.routed_tier as ModelTier;
    if (!VALID_TIERS.has(routedTier)) {
      res.status(400).json({ error: `Invalid routed_tier; must be one of: ${[...VALID_TIERS].join(', ')}` });
      return;
    }
    const eventType = (body.event_type ?? 'tool_use') as CostEventType;
    if (!VALID_TYPES.has(eventType)) {
      res.status(400).json({ error: `Invalid event_type; must be one of: ${[...VALID_TYPES].join(', ')}` });
      return;
    }

    const input: MeterCallInput = {
      event_type: eventType,
      agent_id: body.agent_id as string,
      session_id: body.session_id as string,
      project_id: body.project_id as string,
      feature_id: typeof body.feature_id === 'string' ? body.feature_id : undefined,
      department_id: typeof body.department_id === 'string' ? body.department_id : undefined,
      organization_id: typeof body.organization_id === 'string' ? body.organization_id : undefined,
      model: body.model as string,
      input_tokens: Number(body.input_tokens ?? 0),
      output_tokens: Number(body.output_tokens ?? 0),
      cache_read_tokens: Number(body.cache_read_tokens ?? 0),
      latency_ms: Number(body.latency_ms ?? 0),
      routed_tier: routedTier,
      manual_override: !!body.manual_override,
      override_by: typeof body.override_by === 'string' ? body.override_by : undefined,
    };
    const event = await metering.recordCostEvent(input);
    res.status(201).json({ recorded: true, event_id: event.event_id, cost_cents: event.cost_cents });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to record event',
      ...(process.env.NODE_ENV !== 'production' && { detail: (err as Error).message }),
    });
  }
});

export default router;
