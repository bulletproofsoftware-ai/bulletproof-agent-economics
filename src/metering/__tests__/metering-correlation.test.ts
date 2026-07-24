// =============================================================================
// metering-correlation.test.ts — correlation_id persistence + emitter behavior
// REQ-TEST-001 (cases A–F2): proves recordCostEvent persists correlation_id when
// present and NULL when absent; the CLAUDE_CORRELATION_ID env fallback (input
// takes precedence); the cost.recorded emitter body/URL/method on success; that a
// failing/timing-out emitter NEVER throws out of recordCostEvent; and (CISO F-3)
// that a malformed correlation_id from env or input is coerced to null while the
// authoritative INSERT still succeeds.
//
// Hermetic: pg (../../database.js), Redis (../../redis.js), and the audit/anomaly/
// budget collaborators are all mocked; global fetch is stubbed via vi.stubGlobal.
// No real network or Postgres is touched.
// =============================================================================

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

// --- Mock the Postgres layer --------------------------------------------------
// transaction(fn) runs fn with a mock PoolClient. We capture every client.query
// call so tests can inspect the cost_events INSERT and its bound params.
const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

vi.mock('../../database.js', () => ({
  transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => {
    const client = { query: clientQuery };
    return fn(client);
  }),
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

// --- Mock Redis ---------------------------------------------------------------
// getRedis().pipeline() returns a chainable stub whose exec() resolves.
const pipelineStub = {
  incrby: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  publish: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};

vi.mock('../../redis.js', () => ({
  getRedis: vi.fn(() => ({ pipeline: vi.fn(() => pipelineStub) })),
}));

// --- Import under test (after mocks are registered) ---------------------------
import { MeteringEngine, type MeterCallInput } from '../metering-engine.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_ENV = '22222222-2222-2222-2222-222222222222';
const UUID_INPUT = '33333333-3333-3333-3333-333333333333';

// The cost_events INSERT column list (see metering-engine.ts insertCostEvent).
// correlation_id is the 20th column / $20 — the LAST positional param.
const CORRELATION_ID_PARAM_INDEX = 19; // 0-based index of the 20th param

function validInput(overrides: Partial<MeterCallInput> = {}): MeterCallInput {
  return {
    event_type: 'llm_call',
    agent_id: 'agent-1',
    session_id: 'session-1',
    project_id: 'project-1',
    model: 'claude-sonnet',
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_tokens: 0,
    latency_ms: 42,
    routed_tier: 'sonnet',
    ...overrides,
  };
}

/**
 * Find the cost_events INSERT call among all captured client.query calls and
 * return its bound params array. Throws if the INSERT was never issued (which
 * is itself a meaningful assertion — the authoritative write must have run).
 */
function costEventsInsertParams(): unknown[] {
  const call = clientQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO cost_events'),
  );
  if (!call) {
    throw new Error('cost_events INSERT was never issued');
  }
  return call[1] as unknown[];
}

function costEventsInsertSql(): string {
  const call = clientQuery.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO cost_events'),
  );
  if (!call) throw new Error('cost_events INSERT was never issued');
  return call[0] as string;
}

// -----------------------------------------------------------------------------
// Env save/restore — CLAUDE_CORRELATION_ID must not leak between tests.
// -----------------------------------------------------------------------------

let savedCorrelationEnv: string | undefined;

beforeEach(() => {
  savedCorrelationEnv = process.env.CLAUDE_CORRELATION_ID;
  delete process.env.CLAUDE_CORRELATION_ID;

  clientQuery.mockClear();
  clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  pipelineStub.incrby.mockClear();
  pipelineStub.zadd.mockClear();
  pipelineStub.publish.mockClear();
  pipelineStub.exec.mockClear();

  // Default fetch stub: resolve OK so the emitter is a no-op for pg-focused
  // tests. Cases E/F override this per-test.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 202 }),
  );
});

afterEach(() => {
  if (savedCorrelationEnv === undefined) {
    delete process.env.CLAUDE_CORRELATION_ID;
  } else {
    process.env.CLAUDE_CORRELATION_ID = savedCorrelationEnv;
  }
  vi.unstubAllGlobals();
});

// -----------------------------------------------------------------------------
// A. correlation_id present (valid UUID) → persisted as the INSERT param
// -----------------------------------------------------------------------------

describe('recordCostEvent — correlation_id persistence', () => {
  it('A: persists a valid input correlation_id as the last INSERT param', async () => {
    const engine = new MeteringEngine();
    const event = await engine.recordCostEvent(
      validInput({ correlation_id: UUID_A }),
    );

    const params = costEventsInsertParams();
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBe(UUID_A);
    expect(costEventsInsertSql()).toContain('correlation_id');
    // The returned CostEvent also carries it through.
    expect(event.correlation_id).toBe(UUID_A);
  });

  // ---------------------------------------------------------------------------
  // B. absent (env unset) → param is null
  // ---------------------------------------------------------------------------
  it('B: persists NULL when no correlation_id is provided and env is unset', async () => {
    // beforeEach already deleted CLAUDE_CORRELATION_ID.
    const engine = new MeteringEngine();
    await engine.recordCostEvent(validInput());

    const params = costEventsInsertParams();
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBeNull();
    // Explicitly not undefined and not empty string.
    expect(params[CORRELATION_ID_PARAM_INDEX]).not.toBe(undefined);
    expect(params[CORRELATION_ID_PARAM_INDEX]).not.toBe('');
  });

  // ---------------------------------------------------------------------------
  // C. env CLAUDE_CORRELATION_ID fallback works (valid UUID)
  // ---------------------------------------------------------------------------
  it('C: uses CLAUDE_CORRELATION_ID env var as fallback when input omits it', async () => {
    process.env.CLAUDE_CORRELATION_ID = UUID_ENV;
    const engine = new MeteringEngine();
    await engine.recordCostEvent(validInput());

    const params = costEventsInsertParams();
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBe(UUID_ENV);
  });

  // ---------------------------------------------------------------------------
  // D. input precedence over env
  // ---------------------------------------------------------------------------
  it('D: input correlation_id takes precedence over the env var', async () => {
    process.env.CLAUDE_CORRELATION_ID = UUID_ENV;
    const engine = new MeteringEngine();
    await engine.recordCostEvent(
      validInput({ correlation_id: UUID_INPUT }),
    );

    const params = costEventsInsertParams();
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBe(UUID_INPUT);
  });
});

// -----------------------------------------------------------------------------
// E. emitter is called with correct body/URL/method on success
// -----------------------------------------------------------------------------

describe('recordCostEvent — cost.recorded emission', () => {
  it('E: POSTs cost.recorded to /events with the correct body on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);

    const engine = new MeteringEngine();
    const input = validInput({ correlation_id: UUID_A });
    const event = await engine.recordCostEvent(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url.endsWith('/events')).toBe(true);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );

    const parsed = JSON.parse(init.body as string);
    expect(parsed).toMatchObject({
      category: 'cost',
      type: 'recorded',
      source: 'agent-economics',
      correlation_id: UUID_A,
      payload: {
        agent_id: input.agent_id,
        session_id: input.session_id,
        project_id: input.project_id,
        cost_cents: event.cost_cents,
        model: input.model,
        routed_tier: input.routed_tier,
      },
    });
  });

  // ---------------------------------------------------------------------------
  // F. emitter failure does NOT throw out of recordCostEvent
  // ---------------------------------------------------------------------------
  it('F: a rejecting fetch (ECONNREFUSED) does not throw; INSERT still ran', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const engine = new MeteringEngine();
    await expect(
      engine.recordCostEvent(validInput({ correlation_id: UUID_A })),
    ).resolves.toBeDefined();

    // The authoritative cost write still happened.
    expect(costEventsInsertParams()[CORRELATION_ID_PARAM_INDEX]).toBe(UUID_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('F: an abort/timeout-style rejection does not throw; INSERT still ran', async () => {
    // Simulate the AbortController timeout path: fetch rejects with AbortError.
    const abortErr = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal('fetch', fetchMock);

    const engine = new MeteringEngine();
    await expect(
      engine.recordCostEvent(validInput()),
    ).resolves.toBeDefined();

    // Cost write completed despite the timed-out emission.
    expect(costEventsInsertSql()).toContain('INSERT INTO cost_events');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// G. emit is fire-and-forget — a slow Event Router does NOT block recordCostEvent
// -----------------------------------------------------------------------------

describe('recordCostEvent — fire-and-forget emission (no return-path latency)', () => {
  it('G: recordCostEvent resolves before a slow-but-reachable emitter fetch settles', async () => {
    // Stub fetch to resolve only on a later macrotask, and flag when it settles.
    // If recordCostEvent AWAITED the emit, it could not resolve until this flag
    // flipped. Proving the caller resolves with the flag still false demonstrates
    // the emit is genuinely fire-and-forget and adds no latency to the return path.
    let fetchSettled = false;
    let resolveFetch!: () => void;
    const fetchGate = new Promise<{ ok: boolean; status: number }>((resolve) => {
      resolveFetch = () => {
        fetchSettled = true;
        resolve({ ok: true, status: 202 });
      };
    });
    const fetchMock = vi.fn().mockReturnValue(fetchGate);
    vi.stubGlobal('fetch', fetchMock);

    const engine = new MeteringEngine();
    const event = await engine.recordCostEvent(validInput({ correlation_id: UUID_A }));

    // The caller returned WITHOUT waiting on the still-pending emitter fetch.
    expect(fetchSettled).toBe(false);
    // The emitter WAS dispatched (fire-and-forget), just not awaited.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The authoritative cost write completed synchronously in the return path.
    expect(costEventsInsertParams()[CORRELATION_ID_PARAM_INDEX]).toBe(UUID_A);
    expect(event.correlation_id).toBe(UUID_A);

    // Now release the in-flight fetch and let the fire-and-forget .catch/.then
    // settle so no unhandled promise leaks into afterEach.
    resolveFetch();
    await fetchGate;
    await Promise.resolve();
  });
});

// -----------------------------------------------------------------------------
// F2. malformed correlation_id coerced to NULL (CISO F-3 security guard)
// -----------------------------------------------------------------------------

describe('recordCostEvent — CISO F-3 malformed correlation_id coercion', () => {
  const MALICIOUS = "not-a-uuid'; DROP TABLE cost_events;--";

  it('F2: malformed CLAUDE_CORRELATION_ID is coerced to null; INSERT still runs', async () => {
    process.env.CLAUDE_CORRELATION_ID = MALICIOUS;
    const engine = new MeteringEngine();

    await expect(engine.recordCostEvent(validInput())).resolves.toBeDefined();

    const params = costEventsInsertParams();
    // The untrusted, non-UUID env value was rejected by the regex → null.
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBeNull();
    // The authoritative write still succeeded.
    expect(costEventsInsertSql()).toContain('INSERT INTO cost_events');
  });

  it('F2: malformed input.correlation_id is coerced to null; INSERT still runs', async () => {
    const engine = new MeteringEngine();

    await expect(
      engine.recordCostEvent(
        validInput({ correlation_id: MALICIOUS }),
      ),
    ).resolves.toBeDefined();

    const params = costEventsInsertParams();
    expect(params[CORRELATION_ID_PARAM_INDEX]).toBeNull();
    expect(costEventsInsertSql()).toContain('INSERT INTO cost_events');
  });

  it('F2: a malformed input value is not rescued by a valid env value (input wins → null)', async () => {
    // Input is present but malformed; env is a valid UUID. Because explicit
    // input wins over env, the malformed input resolves to null (it is NOT
    // silently replaced by the env UUID).
    process.env.CLAUDE_CORRELATION_ID = UUID_ENV;
    const engine = new MeteringEngine();

    await engine.recordCostEvent(
      validInput({ correlation_id: MALICIOUS }),
    );

    expect(costEventsInsertParams()[CORRELATION_ID_PARAM_INDEX]).toBeNull();
  });
});
