// =============================================================================
// Model router + routing rules tests
// REQ-046, REQ-047
// =============================================================================

import { describe, it, expect } from 'vitest';
import { makeRoutingDecision } from '../routing-rules.js';
import type { ComplexitySignals } from '../../types.js';

function makeSignals(overrides: Partial<ComplexitySignals> = {}): ComplexitySignals {
  return {
    estimated_tokens: 10_000,
    file_count: 5,
    tool_call_count: 3,
    code_diff_lines: 100,
    requires_reasoning: false,
    task_classification: 'implementation',
    ...overrides,
  };
}

describe('makeRoutingDecision', () => {
  it('returns a complete RoutingDecision object', () => {
    const decision = makeRoutingDecision(makeSignals());
    expect(decision.model_tier).toBeDefined();
    expect(decision.model_id).toBeDefined();
    expect(decision.rationale).toBeDefined();
    expect(decision.estimated_cost_cents).toBeGreaterThanOrEqual(0);
    expect(decision.signals_used).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it('routes simple tasks to haiku', () => {
    const decision = makeRoutingDecision(
      makeSignals({
        estimated_tokens: 2000,
        file_count: 1,
        task_classification: 'formatting',
      }),
    );
    expect(decision.model_tier).toBe('haiku');
    expect(decision.model_id).toContain('haiku');
  });

  it('routes complex reasoning to opus', () => {
    const decision = makeRoutingDecision(
      makeSignals({ requires_reasoning: true }),
    );
    expect(decision.model_tier).toBe('opus');
    expect(decision.model_id).toContain('opus');
  });

  it('routes standard tasks to sonnet', () => {
    const decision = makeRoutingDecision(makeSignals());
    expect(decision.model_tier).toBe('sonnet');
  });

  it('includes cost estimate', () => {
    const decision = makeRoutingDecision(
      makeSignals({ estimated_tokens: 50000, requires_reasoning: true }),
    );
    // Opus with 50k tokens should have non-trivial cost
    expect(decision.estimated_cost_cents).toBeGreaterThan(0);
  });

  it('includes rationale', () => {
    const decision = makeRoutingDecision(
      makeSignals({ requires_reasoning: true }),
    );
    expect(decision.rationale).toContain('opus');
    expect(decision.rationale.length).toBeGreaterThan(10);
  });
});
