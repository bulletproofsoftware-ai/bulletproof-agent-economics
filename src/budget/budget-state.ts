// =============================================================================
// src/budget/budget-state.ts — Redis-backed budget tracking
// Atomic operations for concurrent budget checks.
// =============================================================================

import { getRedis } from '../redis.js';

export interface BudgetSnapshot {
  spent_cents: number;
  cap_cents: number;
  pct_used: number;
}

/**
 * Get current budget state for a project from Redis.
 */
export async function getProjectBudget(projectId: string): Promise<BudgetSnapshot> {
  const redis = getRedis();
  const [spentRaw, capRaw] = await redis.mget(
    `budget:project:${projectId}:spent_cents`,
    `budget:project:${projectId}:cap_cents`,
  );
  const spent = parseInt(spentRaw ?? '0', 10);
  const cap = parseInt(capRaw ?? '0', 10);
  const pct = cap > 0 ? Math.floor((spent * 100) / cap) : 0;
  return { spent_cents: spent, cap_cents: cap, pct_used: pct };
}

/**
 * Get current budget state for an agent session from Redis.
 */
export async function getAgentSessionBudget(
  agentId: string,
  sessionId: string,
): Promise<BudgetSnapshot> {
  const redis = getRedis();
  const [spentRaw, capRaw] = await redis.mget(
    `budget:agent:${agentId}:session:${sessionId}:spent_cents`,
    `budget:agent:${agentId}:session:${sessionId}:cap_cents`,
  );
  const spent = parseInt(spentRaw ?? '0', 10);
  const cap = parseInt(capRaw ?? '0', 10);
  const pct = cap > 0 ? Math.floor((spent * 100) / cap) : 0;
  return { spent_cents: spent, cap_cents: cap, pct_used: pct };
}

/**
 * Set budget cap for a project in Redis.
 */
export async function setProjectBudgetCap(
  projectId: string,
  capCents: number,
): Promise<void> {
  const redis = getRedis();
  await redis.set(`budget:project:${projectId}:cap_cents`, capCents.toString());
}

/**
 * Set budget cap for an agent session in Redis.
 */
export async function setAgentSessionBudgetCap(
  agentId: string,
  sessionId: string,
  capCents: number,
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `budget:agent:${agentId}:session:${sessionId}:cap_cents`,
    capCents.toString(),
  );
}

/**
 * Reset budget spend for a project (at period boundary).
 */
export async function resetProjectBudgetSpend(projectId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`budget:project:${projectId}:spent_cents`, '0');
}

/**
 * Atomic increment and check via Lua script to prevent race conditions.
 * Returns the new budget snapshot after increment.
 *
 * Note: redis.eval is used here specifically for executing a Lua script
 * on the Redis server — this is standard Redis Lua scripting, not
 * JavaScript code evaluation.
 */
export async function atomicIncrementAndCheck(
  spentKey: string,
  capKey: string,
  incrementCents: number,
): Promise<BudgetSnapshot> {
  const redis = getRedis();

  // Redis Lua script for atomic check-and-increment
  const luaScript = `
    local spent_key = KEYS[1]
    local cap_key = KEYS[2]
    local increment = tonumber(ARGV[1])

    local current_spent = tonumber(redis.call('GET', spent_key) or '0')
    local cap = tonumber(redis.call('GET', cap_key) or '0')

    local new_spent = current_spent + increment
    redis.call('SET', spent_key, tostring(new_spent))

    local pct = 0
    if cap > 0 then
      pct = math.floor((new_spent * 100) / cap)
    end

    return {new_spent, cap, pct}
  `;

  // Redis eval executes a Lua script server-side (not JS eval)
  const result = (await redis.eval(
    luaScript,
    2,
    spentKey,
    capKey,
    incrementCents.toString(),
  )) as number[];

  return {
    spent_cents: result[0],
    cap_cents: result[1],
    pct_used: result[2],
  };
}
