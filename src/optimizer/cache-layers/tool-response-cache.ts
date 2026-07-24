// =============================================================================
// L4: Tool Response Cache — Deterministic tool result cache (Redis)
// REQ-048: >= 40% hit rate target
// =============================================================================

import { getRedis } from '../../redis.js';
import { config } from '../../config.js';
import { createHash } from 'node:crypto';
import type { CacheHit, CacheMiss } from '../../types.js';

const CACHE_PREFIX = 'cache:tool:';

/**
 * L4 Tool Response Cache: Caches deterministic tool results.
 * Key: hash of (tool_name + sorted args).
 * TTL: configurable per tool (default 60 minutes).
 */
export class ToolResponseCache {
  private defaultTtlSeconds: number;

  constructor() {
    this.defaultTtlSeconds = config.cacheTtlToolResponseMinutes * 60;
  }

  /**
   * Look up a cached tool response.
   */
  async lookup(toolName: string, args: Record<string, unknown>): Promise<CacheHit | CacheMiss> {
    const key = this.makeKey(toolName, args);
    const redis = getRedis();
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);

    if (cached) {
      const data = JSON.parse(cached) as {
        result: unknown;
        tokens_saved: number;
        savings_cents: number;
      };
      return {
        layer: 'tool_response',
        key,
        savings_cents: data.savings_cents,
        tokens_saved: data.tokens_saved,
      };
    }

    return {
      layer: 'tool_response',
      key,
      reason: 'not_found',
    };
  }

  /**
   * Retrieve the actual cached result (not just the hit/miss).
   */
  async getResult(toolName: string, args: Record<string, unknown>): Promise<unknown | null> {
    const key = this.makeKey(toolName, args);
    const redis = getRedis();
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);

    if (cached) {
      const data = JSON.parse(cached) as { result: unknown };
      return data.result;
    }
    return null;
  }

  /**
   * Store a tool response in the cache.
   */
  async store(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    tokensSaved: number,
    savingsCents: number,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = this.makeKey(toolName, args);
    const redis = getRedis();
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;

    await redis.set(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ result, tokens_saved: tokensSaved, savings_cents: savingsCents }),
      'EX',
      ttl,
    );
  }

  /**
   * Invalidate a specific tool response.
   */
  async invalidate(toolName: string, args: Record<string, unknown>): Promise<void> {
    const key = this.makeKey(toolName, args);
    const redis = getRedis();
    await redis.del(`${CACHE_PREFIX}${key}`);
  }

  /**
   * Create a deterministic key from tool name and sorted arguments.
   */
  private makeKey(toolName: string, args: Record<string, unknown>): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args).sort());
    const argsHash = createHash('sha256').update(sortedArgs).digest('hex').slice(0, 16);
    return `${toolName}:${argsHash}`;
  }
}
