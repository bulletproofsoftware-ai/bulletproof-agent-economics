// =============================================================================
// Budget controller tests — threshold state machine
// REQ-043: Real-time budget enforcement
// =============================================================================

import { describe, it, expect } from 'vitest';
import { distributebudget } from '../inheritance-strategy.js';

describe('distributebudget', () => {
  describe('EQUAL strategy', () => {
    it('distributes evenly among agents', () => {
      const result = distributebudget(10000, ['a', 'b', 'c', 'd'], 'EQUAL');
      expect(result).toHaveLength(4);
      expect(result[0].cap_cents).toBe(2500);
      expect(result[1].cap_cents).toBe(2500);
      expect(result[2].cap_cents).toBe(2500);
      expect(result[3].cap_cents).toBe(2500);
    });

    it('gives remainder to first agent', () => {
      const result = distributebudget(10001, ['a', 'b', 'c'], 'EQUAL');
      // 10001 / 3 = 3333 remainder 2
      expect(result[0].cap_cents).toBe(3335); // 3333 + 2
      expect(result[1].cap_cents).toBe(3333);
      expect(result[2].cap_cents).toBe(3333);
      // Total should equal input
      const total = result.reduce((sum, r) => sum + r.cap_cents, 0);
      expect(total).toBe(10001);
    });

    it('handles single agent', () => {
      const result = distributebudget(5000, ['a'], 'EQUAL');
      expect(result[0].cap_cents).toBe(5000);
    });

    it('handles empty agent list', () => {
      const result = distributebudget(5000, [], 'EQUAL');
      expect(result).toHaveLength(0);
    });

    it('handles zero budget', () => {
      const result = distributebudget(0, ['a', 'b'], 'EQUAL');
      expect(result[0].cap_cents).toBe(0);
      expect(result[1].cap_cents).toBe(0);
    });
  });

  describe('WEIGHTED strategy', () => {
    it('distributes by weight proportions', () => {
      const result = distributebudget(
        10000,
        ['architect', 'coder', 'reviewer'],
        'WEIGHTED',
        { architect: 0.4, coder: 0.35, reviewer: 0.25 },
      );
      // Architect: 40% of 10000 = 4000
      // Coder: 35% of 10000 = 3500
      // Reviewer: 25% of 10000 = 2500
      expect(result[0].cap_cents).toBe(4000);
      expect(result[1].cap_cents).toBe(3500);
      expect(result[2].cap_cents).toBe(2500);
    });

    it('normalizes weights that do not sum to 1', () => {
      const result = distributebudget(
        10000,
        ['a', 'b'],
        'WEIGHTED',
        { a: 2, b: 8 },
      );
      // a: 20%, b: 80%
      expect(result[0].cap_cents).toBe(2000);
      expect(result[1].cap_cents).toBe(8000);
    });

    it('assigns default weight to agents missing from weights map', () => {
      const result = distributebudget(
        10000,
        ['a', 'b', 'c'],
        'WEIGHTED',
        { a: 3 }, // b and c get default weight of 1
      );
      // Total weight = 3 + 1 + 1 = 5
      // a: 3/5 = 60%, b: 1/5 = 20%, c: 1/5 = 20%
      expect(result[0].cap_cents).toBe(6000);
      expect(result[1].cap_cents).toBe(2000);
      expect(result[2].cap_cents).toBe(2000);
    });

    it('preserves total cents (no loss from rounding)', () => {
      const result = distributebudget(
        10001,
        ['a', 'b', 'c'],
        'WEIGHTED',
        { a: 0.33, b: 0.33, c: 0.34 },
      );
      const total = result.reduce((sum, r) => sum + r.cap_cents, 0);
      expect(total).toBe(10001);
    });
  });

  describe('POOL strategy', () => {
    it('gives each agent the full project cap', () => {
      const result = distributebudget(10000, ['a', 'b', 'c'], 'POOL');
      expect(result[0].cap_cents).toBe(10000);
      expect(result[1].cap_cents).toBe(10000);
      expect(result[2].cap_cents).toBe(10000);
    });

    it('works with single agent', () => {
      const result = distributebudget(5000, ['a'], 'POOL');
      expect(result[0].cap_cents).toBe(5000);
    });
  });
});
