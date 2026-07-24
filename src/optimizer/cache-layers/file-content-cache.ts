// =============================================================================
// L2: File Content Cache — Git SHA-keyed (until commit)
// REQ-048: >= 60% hit rate target
// REQ-049: Cache invalidation by code changes (git SHA)
// =============================================================================

import { getRedis } from '../../redis.js';
import { createHash } from 'node:crypto';
import type { CacheHit, CacheMiss } from '../../types.js';

const CACHE_PREFIX = 'cache:file:';

/**
 * L2 File Content Cache: Caches file content keyed by git SHA + file path.
 * Automatically invalidated when git SHA changes (new commit).
 * No TTL — valid until the file changes in git.
 */
export class FileContentCache {
  /**
   * Look up a file's cached content hash.
   */
  async lookup(gitSha: string, filePath: string): Promise<CacheHit | CacheMiss> {
    const key = this.makeKey(gitSha, filePath);
    const redis = getRedis();
    const cached = await redis.get(`${CACHE_PREFIX}${key}`);

    if (cached) {
      const data = JSON.parse(cached) as {
        tokens: number;
        savings_cents: number;
        content_hash: string;
      };
      return {
        layer: 'file_content',
        key,
        savings_cents: data.savings_cents,
        tokens_saved: data.tokens,
      };
    }

    return {
      layer: 'file_content',
      key,
      reason: 'not_found',
    };
  }

  /**
   * Store file content in the cache.
   */
  async store(
    gitSha: string,
    filePath: string,
    contentHash: string,
    tokens: number,
    savingsCents: number,
  ): Promise<void> {
    const key = this.makeKey(gitSha, filePath);
    const redis = getRedis();
    await redis.set(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({
        content_hash: contentHash,
        tokens,
        savings_cents: savingsCents,
      }),
    );
  }

  /**
   * Invalidate all cached files for a given git SHA.
   * Called when a new commit is made.
   */
  async invalidateByGitSha(oldGitSha: string): Promise<number> {
    const redis = getRedis();
    let cursor = '0';
    let deleted = 0;

    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${CACHE_PREFIX}${oldGitSha}:*`,
        'COUNT',
        100,
      );
      cursor = newCursor;
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.del(key);
        }
        await pipeline.exec();
        deleted += keys.length;
      }
    } while (cursor !== '0');

    return deleted;
  }

  private makeKey(gitSha: string, filePath: string): string {
    const pathHash = createHash('sha256')
      .update(filePath)
      .digest('hex')
      .slice(0, 16);
    return `${gitSha}:${pathHash}`;
  }
}
