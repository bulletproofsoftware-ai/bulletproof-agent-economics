// =============================================================================
// Cost calculator tests — integer arithmetic correctness
// REQ-042: All cost values stored and computed as integer cents
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeCostCents,
  estimateCostCents,
  computeCacheSavingsCents,
  getPricing,
} from '../cost-calculator.js';
import { MODEL_PRICING } from '../../types.js';
import type { ModelTier } from '../../types.js';

describe('computeCostCents', () => {
  it('computes Haiku cost correctly', () => {
    // 10,000 input * 80/1M = 0.8 cents -> 0 (floor)
    // 5,000 output * 400/1M = 2.0 cents -> 2
    // 1,000 cache * 8/1M = 0.008 cents -> 0
    const cost = computeCostCents(10000, 5000, 1000, MODEL_PRICING.haiku);
    expect(cost).toBe(2);
  });

  it('computes Sonnet cost correctly', () => {
    // 5000 input * 300/1M = 1.5 -> contributes 1_500_000 micro-cents
    // 2000 output * 1500/1M = 3.0 -> contributes 3_000_000 micro-cents
    // 1000 cache * 30/1M = 0.03 -> contributes 30_000 micro-cents
    // Total micro-cents: 4_530_000 / 1_000_000 = 4 (BigInt floor)
    const cost = computeCostCents(5000, 2000, 1000, MODEL_PRICING.sonnet);
    expect(cost).toBe(4);
  });

  it('computes Opus cost correctly', () => {
    // 10,000 input * 1500/1M = 15 cents
    // 5,000 output * 7500/1M = 37.5 -> contributes 37_500_000
    // 2,000 cache * 150/1M = 0.3 -> contributes 300_000
    // Total micro-cents: 15_000_000 + 37_500_000 + 300_000 = 52_800_000 / 1M = 52
    const cost = computeCostCents(10000, 5000, 2000, MODEL_PRICING.opus);
    expect(cost).toBe(52);
  });

  it('returns 0 for zero tokens', () => {
    const cost = computeCostCents(0, 0, 0, MODEL_PRICING.opus);
    expect(cost).toBe(0);
  });

  it('handles large token counts without overflow', () => {
    // 1M input tokens on Opus: 1_000_000 * 1500 / 1_000_000 = 1500 cents = $15
    const cost = computeCostCents(1_000_000, 0, 0, MODEL_PRICING.opus);
    expect(cost).toBe(1500);
  });

  it('handles very large token counts (near-max)', () => {
    // 100M input tokens on Opus: 100_000_000 * 1500 / 1_000_000 = 150,000 cents = $1,500
    const cost = computeCostCents(100_000_000, 0, 0, MODEL_PRICING.opus);
    expect(cost).toBe(150000);
  });

  it('floors fractional cents (no rounding up)', () => {
    // 1 input token on Haiku: 1 * 80 / 1_000_000 = 0.00008 cents -> 0
    const cost = computeCostCents(1, 0, 0, MODEL_PRICING.haiku);
    expect(cost).toBe(0);
  });

  it('sums components before dividing for maximum precision', () => {
    // 999 input * 300 = 299,700 micro-cents
    // 999 output * 1500 = 1,498,500 micro-cents
    // 999 cache * 30 = 29,970 micro-cents
    // Total: 1,828,170 / 1,000,000 = 1 (BigInt floor)
    const cost = computeCostCents(999, 999, 999, MODEL_PRICING.sonnet);
    expect(cost).toBe(1);
  });

  it('rejects negative token counts', () => {
    expect(() => computeCostCents(-1, 0, 0, MODEL_PRICING.haiku)).toThrow(
      'Token counts must be non-negative',
    );
  });

  it('rejects non-integer token counts', () => {
    expect(() => computeCostCents(1.5, 0, 0, MODEL_PRICING.haiku)).toThrow(
      'Token counts must be integers',
    );
  });

  it('produces consistent results regardless of call order', () => {
    const a = computeCostCents(5000, 2000, 1000, MODEL_PRICING.sonnet);
    const b = computeCostCents(5000, 2000, 1000, MODEL_PRICING.sonnet);
    const c = computeCostCents(5000, 2000, 1000, MODEL_PRICING.sonnet);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('returns integer (no decimal places)', () => {
    for (const tier of ['haiku', 'sonnet', 'opus'] as const) {
      const cost = computeCostCents(12345, 6789, 1111, MODEL_PRICING[tier]);
      expect(Number.isInteger(cost)).toBe(true);
    }
  });
});

describe('estimateCostCents', () => {
  it('estimates cost for planned call without cache tokens', () => {
    const cost = estimateCostCents(10000, 5000, 'sonnet');
    // 10000 * 300 / 1M = 3, 5000 * 1500 / 1M = 7, cache = 0
    // Total = 10
    expect(cost).toBe(10);
  });

  it('works for all tiers', () => {
    const haiku = estimateCostCents(10000, 5000, 'haiku');
    const sonnet = estimateCostCents(10000, 5000, 'sonnet');
    const opus = estimateCostCents(10000, 5000, 'opus');
    // Haiku should be cheapest, Opus most expensive
    expect(haiku).toBeLessThan(sonnet);
    expect(sonnet).toBeLessThan(opus);
  });
});

describe('computeCacheSavingsCents', () => {
  it('computes input token savings', () => {
    // 10000 tokens saved on Opus input: 10000 * 1500 / 1M = 15 cents
    const savings = computeCacheSavingsCents(10000, 'opus', 'input');
    expect(savings).toBe(15);
  });

  it('computes output token savings', () => {
    // 10000 tokens saved on Opus output: 10000 * 7500 / 1M = 75 cents
    const savings = computeCacheSavingsCents(10000, 'opus', 'output');
    expect(savings).toBe(75);
  });
});

describe('getPricing', () => {
  it('returns pricing for all tiers', () => {
    for (const tier of ['haiku', 'sonnet', 'opus'] as const) {
      const pricing = getPricing(tier);
      expect(pricing.tier).toBe(tier);
      expect(pricing.input_cents_per_million).toBeGreaterThan(0);
      expect(pricing.output_cents_per_million).toBeGreaterThan(0);
      expect(pricing.cache_read_cents_per_million).toBeGreaterThan(0);
    }
  });
});

describe('getPricing — new router tiers (REQ-057)', () => {
  const newTiers: ModelTier[] = ['fable', 'ollama-local', 'codex', 'agy', 'veo', 'edge-tts'];

  it.each(newTiers)('returns a valid ModelPricing for %s', (tier) => {
    const pricing = getPricing(tier);
    expect(pricing.model_id).toBeDefined();
    expect(pricing.tier).toBe(tier);
    expect(pricing.input_cents_per_million).toBeGreaterThanOrEqual(0);
    expect(pricing.output_cents_per_million).toBeGreaterThanOrEqual(0);
  });

  it('ollama-local, codex, agy, edge-tts are zero-cost (external quota / local, not billed per-token)', () => {
    for (const tier of ['ollama-local', 'codex', 'agy', 'edge-tts'] as ModelTier[]) {
      const pricing = getPricing(tier);
      expect(pricing.input_cents_per_million).toBe(0);
      expect(pricing.output_cents_per_million).toBe(0);
    }
  });
});
