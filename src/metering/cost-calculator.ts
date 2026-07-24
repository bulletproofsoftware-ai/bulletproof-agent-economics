// =============================================================================
// src/metering/cost-calculator.ts — Integer-cent pricing logic
// REQ-042: Cost computation in integer cents (no floating point)
//
// All rates are in cents per 1M tokens. We use BigInt multiplication
// before division to prevent intermediate overflow and maintain exact
// integer arithmetic. No floating point in any financial path.
// =============================================================================

import type { ModelPricing, ModelTier } from '../types.js';
import { MODEL_PRICING } from '../types.js';
import { config } from '../config.js';

/**
 * Build a ModelPricing record from config (supports env var overrides).
 */
export function getPricing(tier: ModelTier): ModelPricing {
  const base = MODEL_PRICING[tier];
  const cfgPricing = config.pricing[tier];
  return {
    ...base,
    input_cents_per_million: cfgPricing.input,
    output_cents_per_million: cfgPricing.output,
    cache_read_cents_per_million: cfgPricing.cache,
  };
}

/**
 * Compute cost in integer cents for an LLM call.
 *
 * Formula: cost_cents = floor(
 *   (input_tokens * input_rate / 1_000_000) +
 *   (output_tokens * output_rate / 1_000_000) +
 *   (cache_read_tokens * cache_rate / 1_000_000)
 * )
 *
 * Uses BigInt for exact integer arithmetic. Each component is computed
 * separately then summed before division to maximize precision.
 *
 * Example: Sonnet, 5000 input, 2000 output, 1000 cache
 *   input:  5000 * 300 = 1_500_000
 *   output: 2000 * 1500 = 3_000_000
 *   cache:  1000 * 30 = 30_000
 *   Total micro-cents: 4_530_000
 *   Total cents: 4_530_000 / 1_000_000 = 4 (floor)
 */
export function computeCostCents(
  input_tokens: number,
  output_tokens: number,
  cache_read_tokens: number,
  pricing: ModelPricing,
): number {
  // Validate inputs are non-negative integers
  if (input_tokens < 0 || output_tokens < 0 || cache_read_tokens < 0) {
    throw new Error('Token counts must be non-negative');
  }
  if (
    !Number.isInteger(input_tokens) ||
    !Number.isInteger(output_tokens) ||
    !Number.isInteger(cache_read_tokens)
  ) {
    throw new Error('Token counts must be integers');
  }

  // BigInt arithmetic for exact integer math — no floating point
  const inputCost =
    BigInt(input_tokens) * BigInt(pricing.input_cents_per_million);
  const outputCost =
    BigInt(output_tokens) * BigInt(pricing.output_cents_per_million);
  const cacheCost =
    BigInt(cache_read_tokens) * BigInt(pricing.cache_read_cents_per_million);

  const totalMicroCents = inputCost + outputCost + cacheCost;
  const totalCents = totalMicroCents / BigInt(1_000_000);

  // Safe conversion: max ~$90T in cents fits in Number.MAX_SAFE_INTEGER
  const result = Number(totalCents);
  if (!Number.isSafeInteger(result)) {
    throw new Error(
      `Cost overflow: ${totalCents} cents exceeds safe integer range`,
    );
  }
  return result;
}

/**
 * Estimate cost for a planned call (before execution).
 * Uses the same integer-cent arithmetic as computeCostCents.
 */
export function estimateCostCents(
  estimated_input_tokens: number,
  estimated_output_tokens: number,
  tier: ModelTier,
): number {
  const pricing = getPricing(tier);
  return computeCostCents(estimated_input_tokens, estimated_output_tokens, 0, pricing);
}

/**
 * Compute cache savings in integer cents.
 * Savings = what it would have cost at the given tier minus zero (cache hit).
 */
export function computeCacheSavingsCents(
  tokens_saved: number,
  tier: ModelTier,
  tokenType: 'input' | 'output' = 'input',
): number {
  if (tokens_saved < 0) {
    throw new Error('tokens_saved must be non-negative');
  }
  if (!Number.isInteger(tokens_saved)) {
    throw new Error('tokens_saved must be an integer');
  }

  const pricing = getPricing(tier);
  const rate =
    tokenType === 'input'
      ? pricing.input_cents_per_million
      : pricing.output_cents_per_million;

  const savingsMicroCents = BigInt(tokens_saved) * BigInt(rate);
  const result = Number(savingsMicroCents / BigInt(1_000_000));

  if (!Number.isSafeInteger(result)) {
    throw new Error(
      `Cache savings overflow: ${savingsMicroCents / BigInt(1_000_000)} cents exceeds safe integer range`,
    );
  }
  return result;
}
