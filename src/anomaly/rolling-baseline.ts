// =============================================================================
// src/anomaly/rolling-baseline.ts — 7-day rolling average computation
// REQ-052: 10x baseline anomaly detection
// =============================================================================

import { getRedis } from '../redis.js';
import { config } from '../config.js';

export interface BaselineData {
  avg_cost_cents: number;
  task_count: number;
  window_days: number;
  data_points: number;
}

/**
 * Compute the 7-day rolling average cost per task for an agent.
 * Uses Redis sorted set (score = timestamp, member = "<costCents>:<uniqueSuffix>").
 *
 * REQ-057 fix: the member MUST be unique per event, or ZADD collapses any two
 * events that happen to share the same cost_cents into a single entry
 * (sorted sets are unique by member, not score+member) — silently corrupting
 * the average and data_points count. Cost is parsed back out of the member's
 * prefix before the first ':'.
 */
export async function getAgentBaseline(agentId: string): Promise<BaselineData> {
  const redis = getRedis();
  const windowMs = config.anomalyBaselineWindowDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  const key = `baseline:agent:${agentId}:costs`;

  // Get all costs within the window
  const entries = await redis.zrangebyscore(key, cutoff.toString(), '+inf');

  if (entries.length === 0) {
    return {
      avg_cost_cents: 0,
      task_count: 0,
      window_days: config.anomalyBaselineWindowDays,
      data_points: 0,
    };
  }

  // Sum all costs (integer arithmetic). Member format: "<costCents>:<suffix>".
  let totalCents = 0;
  for (const entry of entries) {
    const costPart = entry.split(':', 1)[0];
    totalCents += parseInt(costPart, 10);
  }

  const avgCost = Math.floor(totalCents / entries.length);

  return {
    avg_cost_cents: avgCost,
    task_count: entries.length,
    window_days: config.anomalyBaselineWindowDays,
    data_points: entries.length,
  };
}

/**
 * Build a unique baseline sorted-set member for a cost data point.
 * REQ-057: exported so MeteringEngine.updateRedisState can use the same
 * uniqueness scheme when writing via its own pipeline (it can't call
 * addToBaseline directly since that issues its own separate Redis calls
 * outside the atomic pipeline).
 */
export function baselineMember(costCents: number, uniqueSuffix: string): string {
  return `${costCents}:${uniqueSuffix}`;
}

/**
 * Add a cost data point to the agent's baseline.
 * Also prunes entries older than the window.
 */
export async function addToBaseline(
  agentId: string,
  costCents: number,
  uniqueSuffix: string,
): Promise<void> {
  const redis = getRedis();
  const key = `baseline:agent:${agentId}:costs`;
  const now = Date.now();

  // Add new data point (unique member — see baselineMember doc above).
  await redis.zadd(key, now.toString(), baselineMember(costCents, uniqueSuffix));

  // Prune old entries (older than window)
  const cutoff = now - config.anomalyBaselineWindowDays * 24 * 60 * 60 * 1000;
  await redis.zremrangebyscore(key, '-inf', cutoff.toString());
}

/**
 * Update the cached average for quick lookups.
 */
export async function updateCachedAverage(agentId: string): Promise<number> {
  const baseline = await getAgentBaseline(agentId);
  const redis = getRedis();
  await redis.set(
    `baseline:agent:${agentId}:avg_cost_per_task`,
    baseline.avg_cost_cents.toString(),
  );
  await redis.set(
    `baseline:agent:${agentId}:task_count_7d`,
    baseline.task_count.toString(),
  );
  return baseline.avg_cost_cents;
}
