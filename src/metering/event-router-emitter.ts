// =============================================================================
// src/metering/event-router-emitter.ts — best-effort cost.recorded emission
// REQ-AE-003: after each cost_events INSERT, POST a cost.recorded event to the
// Event Router. This POST MUST NEVER throw into the caller or affect the
// authoritative Postgres write. Postgres remains the source of truth.
// =============================================================================

import { config } from '../config.js';

export interface CostRecordedInput {
  correlation_id: string | null;
  agent_id: string;
  session_id: string;
  project_id: string;
  cost_cents: number;
  model: string;
  routed_tier: string;
  input_tokens: number;
  output_tokens: number;
}

/**
 * Fire-and-forget emission of cost.recorded to the Event Router POST /events.
 *
 * NOTE on the event shape: the Event Router's IncomingEvent validator REJECTS
 * any `category` containing a dot, so category is "cost" and type "recorded" —
 * NOT a dotted "cost.recorded" category.
 *
 * ALL errors (network down, DNS, timeout/abort, non-2xx) are swallowed. A
 * bounded AbortController timeout guarantees this never blocks the caller for
 * longer than config.eventRouterEmitTimeoutMs.
 */
export async function emitCostRecorded(input: CostRecordedInput): Promise<void> {
  const body = {
    category: 'cost',
    type: 'recorded',
    source: 'agent-economics',
    correlation_id: input.correlation_id, // may be null; router generates one if null
    payload: {
      agent_id: input.agent_id,
      session_id: input.session_id,
      project_id: input.project_id,
      cost_cents: input.cost_cents,
      model: input.model,
      routed_tier: input.routed_tier,
      input_tokens: input.input_tokens,
      output_tokens: input.output_tokens,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.eventRouterEmitTimeoutMs);
    try {
      await fetch(`${config.eventRouterUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // Response status is intentionally ignored — best-effort only.
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Swallow ALL errors. Postgres is authoritative; a failed emission must
    // never surface into recordCostEvent or roll back the cost write.
  }
}
