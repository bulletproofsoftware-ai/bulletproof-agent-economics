// =============================================================================
// src/router/routing-rules.ts — Heuristic decision engine
// REQ-046: Model selection rules
// =============================================================================

import type { ComplexitySignals, ModelTier, RoutingDecision } from '../types.js';
import { MODEL_PRICING } from '../types.js';
import { classifyComplexity } from './complexity-classifier.js';
import { estimateCostCents } from '../metering/cost-calculator.js';

/**
 * Make a routing decision based on complexity signals.
 * Returns the selected model tier, rationale, and estimated cost.
 */
export function makeRoutingDecision(signals: ComplexitySignals): RoutingDecision {
  const tier = classifyComplexity(signals);
  const pricing = MODEL_PRICING[tier];
  const estimatedCost = estimateCostCents(
    signals.estimated_tokens,
    Math.ceil(signals.estimated_tokens * 0.3), // Estimate output as 30% of input
    tier,
  );

  const rationale = buildRationale(signals, tier);
  const confidence = computeConfidence(signals, tier);

  return {
    model_tier: tier,
    model_id: pricing.model_id,
    rationale,
    estimated_cost_cents: estimatedCost,
    signals_used: signals,
    confidence,
  };
}

/**
 * Build a human-readable rationale for the routing decision.
 */
function buildRationale(signals: ComplexitySignals, tier: ModelTier): string {
  const reasons: string[] = [];

  if (tier === 'opus') {
    if (signals.requires_reasoning) reasons.push('task requires deep reasoning');
    if (signals.estimated_tokens > 32_000) reasons.push(`high token estimate (${signals.estimated_tokens})`);
    if (signals.file_count > 20) reasons.push(`large file scope (${signals.file_count} files)`);
    if (['architecture', 'security_review', 'complex_debugging'].includes(signals.task_classification)) {
      reasons.push(`task type: ${signals.task_classification}`);
    }
  } else if (tier === 'haiku') {
    if (signals.estimated_tokens < 4_000) reasons.push(`low token estimate (${signals.estimated_tokens})`);
    if (signals.file_count <= 1) reasons.push('single file scope');
    if (['formatting', 'linting', 'docstring', 'boilerplate'].includes(signals.task_classification)) {
      reasons.push(`simple task type: ${signals.task_classification}`);
    }
  } else {
    reasons.push('moderate complexity, standard task');
    if (signals.estimated_tokens >= 4_000) reasons.push(`token estimate: ${signals.estimated_tokens}`);
  }

  return `Selected ${tier}: ${reasons.join(', ')}`;
}

/**
 * Compute confidence in the routing decision (0-1).
 * Higher confidence when signals clearly point to one tier.
 */
function computeConfidence(signals: ComplexitySignals, tier: ModelTier): number {
  let confidence = 0.7; // Base confidence

  // Strong signals increase confidence
  if (tier === 'opus' && signals.requires_reasoning) confidence += 0.2;
  if (tier === 'opus' && signals.estimated_tokens > 50_000) confidence += 0.1;
  if (tier === 'haiku' && signals.estimated_tokens < 2_000) confidence += 0.2;
  if (tier === 'haiku' && signals.file_count === 0) confidence += 0.1;

  // Ambiguous signals decrease confidence
  if (tier === 'sonnet') {
    // Sonnet is the default — lower confidence since it's less decisive
    confidence -= 0.1;
  }

  return Math.min(1.0, Math.max(0.0, confidence));
}
