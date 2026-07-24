// =============================================================================
// router-emit.integration.test.ts — REQ-TEST-002
// Cross-repo integration: a metered cost.recorded event, POSTed to a RUNNING
// Event Router's synchronous /events/sync endpoint, is routed and its
// correlation_id is preserved in the routing_log row.
//
// DETERMINISTIC by design: /events/sync runs route_event synchronously and
// writes the routing_log row before returning — no polling, no race.
//
// ENV-GATED: this test needs a live Event Router (with the cost taxonomy from
// REQ-CFG-001 and the cost.recorded routing rule from REQ-ER-001 loaded and
// reloaded). If EVENT_ROUTER_URL is unset the whole suite is skipped cleanly.
//
// How to run:
//   # In the event-router repo: uvicorn app.main:app --port 8085
//   # Ensure taxonomy has `cost` and the cost.recorded rule, then reload:
//   curl -X POST http://localhost:8085/reload
//   # Run just this test:
//   EVENT_ROUTER_URL=http://localhost:8085 npm test -- router-emit.integration
//
// NOTE on endpoint choice: the production emitter (REQ-AE-003) fire-and-forgets
// to POST /events (async). For a DETERMINISTIC assertion we POST the identical
// body to /events/sync here; the emitter's body shape is asserted separately in
// REQ-TEST-001 case E.
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const ROUTER = process.env.EVENT_ROUTER_URL;

// Skip the whole suite when no live router is configured.
const suite = ROUTER ? describe : describe.skip;

if (!ROUTER) {
  // Surface a clear reason in the reporter output.
  describe.skip(
    'REQ-TEST-002 integration (skipped: set EVENT_ROUTER_URL to a running Event Router with the cost taxonomy + cost.recorded rule loaded)',
    () => {
      it('skipped', () => {
        /* env-gated skip — see spec REQ-TEST-002 */
      });
    },
  );
}

suite('REQ-TEST-002 — cost.recorded → routing_log carries correlation_id', () => {
  const base = (ROUTER ?? '').replace(/\/$/, '');

  // Precondition: the router must be reachable before we assert anything.
  beforeAll(async () => {
    const res = await fetch(`${base}/events`, { method: 'GET' });
    expect(
      res.ok,
      `Event Router at ${base} must be reachable (GET /events returned ${res.status})`,
    ).toBe(true);
  });

  it('routes a synchronous cost.recorded event and preserves the correlation_id', async () => {
    const cid = randomUUID();

    const body = {
      category: 'cost',
      type: 'recorded',
      source: 'agent-economics',
      correlation_id: cid,
      payload: {
        agent_id: 'itest',
        session_id: 'itest',
        project_id: 'itest',
        cost_cents: 7,
        model: 'itest-model',
        routed_tier: 'itest-tier',
      },
    };

    // 1) Emit synchronously.
    const syncRes = await fetch(`${base}/events/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();

    // 2) The response echoes the correlation_id and reports it as routed.
    expect(syncJson.correlation_id).toBe(cid);
    expect(syncJson.status).toBe('routed');

    // 3) The cost.recorded rule (REQ-ER-001, in the primary routes: list) is
    //    among the matched rules — proving the rule is actually wired.
    expect(Array.isArray(syncJson.matched_rules)).toBe(true);
    expect(syncJson.matched_rules).toContain('cost.recorded');

    // 4) The routing_log row is queryable by correlation_id and preserves it.
    const eventsRes = await fetch(
      `${base}/events?correlation_id=${encodeURIComponent(cid)}`,
      { method: 'GET' },
    );
    expect(eventsRes.status).toBe(200);
    const eventsJson = await eventsRes.json();

    const rows: Array<Record<string, unknown>> = Array.isArray(eventsJson)
      ? eventsJson
      : (eventsJson.events ?? eventsJson.rows ?? []);

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows.find((r) => r.correlation_id === cid) ?? rows[0];
    expect(row.correlation_id).toBe(cid);
    expect(row.category).toBe('cost');
    expect(row.type).toBe('recorded');
  });
});
