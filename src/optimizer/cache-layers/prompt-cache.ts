// =============================================================================
// L1: Prompt Cache — Native API prompt caching (5-min TTL)
// REQ-048: >= 70% hit rate target
// =============================================================================

import { getRedis } from '../../redis.js';
import { config } from '../../config.js';
import { createHash } from 'node:crypto';
import type { CacheHit, CacheMiss } from '../../types.js';

const CACHE_PREFIX = 'cache:prompt:';

/**
 * L1 Prompt Cache: Caches system prompt + static message prefix
 * combinations. Uses SHA-256 hash of the prompt content as key.
 * TTL: 5 minutes (configurable via CACHE_TTL_PROMPT_MINUTES).
 */
export class PromptCache {
  private ttlSeconds: number;

  constructor() {
    this.ttlSeconds = config.cacheTtlPromptMinutes * 60;
  }

  /**
   * Check if a prompt is cached. Returns the cached token count if hit.
   */
  async lookup(promptContent: string): Promise<CacheHit | CacheMiss> {
    const key = this.makeKey(promptContent);
    const redis = getRedis();
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);

    if (cached) {
      const data = JSON.parse(cached) as { tokens: number; savings_cents: number };
      return {
        layer: 'prompt',
        key,
        savings_cents: data.savings_cents,
        tokens_saved: data.tokens,
      };
    }

    return {
      layer: 'prompt',
      key,
      reason: 'not_found',
    };
  }

  /**
   * Store a prompt in the cache after first use.
   */
  async store(
    promptContent: string,
    tokens: number,
    savingsCents: number,
  ): Promise<void> {
    const key = this.makeKey(promptContent);
    const redis = getRedis();
    await redis.set(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ tokens, savings_cents: savingsCents }),
      'EX',
      this.ttlSeconds,
    );
  }

  /**
   * Invalidate a specific prompt from the cache.
   */
  async invalidate(promptContent: string): Promise<void> {
    const key = this.makeKey(promptContent);
    const redis = getRedis();
    await redis.del(`${CACHE_PREFIX}${key}`);
  }

  private makeKey(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 32);
  }
}
