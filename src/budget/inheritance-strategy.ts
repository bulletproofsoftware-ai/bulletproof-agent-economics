// =============================================================================
// src/budget/inheritance-strategy.ts — Budget distribution strategies
// REQ-044: Budget inheritance from project to agent
// EQUAL, WEIGHTED, POOL strategies
// =============================================================================

import type { InheritanceStrategy } from '../types.js';

export interface AgentAllocation {
  agent_id: string;
  cap_cents: number;
}

/**
 * Distribute a project budget to agents based on the inheritance strategy.
 *
 * EQUAL: Each agent gets project_cap / agent_count (remainder goes to first agent)
 * WEIGHTED: Each agent gets project_cap * weight (weights normalized to sum=1)
 * POOL: All agents share the project budget (each gets full cap, first-come-first-served)
 */
export function distributebudget(
  projectCapCents: number,
  agentIds: string[],
  strategy: InheritanceStrategy,
  weights?: Record<string, number>,
): AgentAllocation[] {
  if (agentIds.length === 0) return [];
  if (projectCapCents <= 0) {
    return agentIds.map((id) => ({ agent_id: id, cap_cents: 0 }));
  }

  switch (strategy) {
    case 'EQUAL':
      return distributeEqual(projectCapCents, agentIds);
    case 'WEIGHTED':
      return distributeWeighted(projectCapCents, agentIds, weights ?? {});
    case 'POOL':
      return distributePool(projectCapCents, agentIds);
  }
}

/**
 * EQUAL: Divide evenly. Remainder cents go to first agent.
 * Uses integer division to avoid floating point.
 */
function distributeEqual(
  capCents: number,
  agentIds: string[],
): AgentAllocation[] {
  const count = agentIds.length;
  const perAgent = Math.floor(capCents / count);
  const remainder = capCents - perAgent * count;

  return agentIds.map((id, i) => ({
    agent_id: id,
    cap_cents: perAgent + (i === 0 ? remainder : 0),
  }));
}

/**
 * WEIGHTED: Multiply cap by each agent's weight (normalized to sum=1).
 * Uses BigInt to ensure weights distribute without losing cents.
 * Any rounding remainder goes to the agent with highest weight.
 */
function distributeWeighted(
  capCents: number,
  agentIds: string[],
  weights: Record<string, number>,
): AgentAllocation[] {
  // Assign default equal weight to agents missing from weights
  const effectiveWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const id of agentIds) {
    const w = weights[id] ?? 1;
    effectiveWeights[id] = w;
    totalWeight += w;
  }

  // Normalize: convert weights to integer basis points (10000 = 100%)
  // to avoid floating point in financial calculations
  const basisPoints: Record<string, number> = {};
  let totalBp = 0;
  let maxBpAgent = agentIds[0];
  let maxBp = 0;

  for (const id of agentIds) {
    const bp = Math.floor((effectiveWeights[id] / totalWeight) * 10000);
    basisPoints[id] = bp;
    totalBp += bp;
    if (bp > maxBp) {
      maxBp = bp;
      maxBpAgent = id;
    }
  }

  // Distribute remainder basis points to highest-weight agent
  const bpRemainder = 10000 - totalBp;
  basisPoints[maxBpAgent] += bpRemainder;

  // Convert basis points to cents using BigInt
  const allocations: AgentAllocation[] = [];
  let allocated = 0;

  for (const id of agentIds) {
    const cents = Number(
      (BigInt(capCents) * BigInt(basisPoints[id])) / BigInt(10000),
    );
    allocations.push({ agent_id: id, cap_cents: cents });
    allocated += cents;
  }

  // Final remainder correction (rounding) goes to highest-weight agent
  const finalRemainder = capCents - allocated;
  if (finalRemainder > 0) {
    const idx = allocations.findIndex((a) => a.agent_id === maxBpAgent);
    if (idx >= 0) allocations[idx].cap_cents += finalRemainder;
  }

  return allocations;
}

/**
 * POOL: All agents share the full budget. Each agent's cap = project cap.
 * First-come-first-served — total spend across all agents capped at project level.
 */
function distributePool(
  capCents: number,
  agentIds: string[],
): AgentAllocation[] {
  return agentIds.map((id) => ({ agent_id: id, cap_cents: capCents }));
}
