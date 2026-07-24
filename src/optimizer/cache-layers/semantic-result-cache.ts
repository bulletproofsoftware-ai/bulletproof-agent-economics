// =============================================================================
// L3: Semantic Result Cache — Embedding similarity (24h TTL)
// REQ-048: >= 20% hit rate target
// Uses Qdrant for vector storage, Ollama for embeddings.
// =============================================================================

import { config } from '../../config.js';
import { createHash } from 'node:crypto';
import type { CacheHit, CacheMiss } from '../../types.js';

const COLLECTION_NAME = 'semantic_cache';

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    task_hash: string;
    result_summary: string;
    full_result: string;
    cost_saved_cents: number;
    created_at: string;
    expires_at: string;
    git_sha: string;
    tokens_saved: number;
  };
}

/**
 * L3 Semantic Result Cache: Caches task results based on embedding similarity.
 * Hit threshold: cosine similarity >= 0.95
 * TTL: 24 hours (configurable via CACHE_TTL_SEMANTIC_HOURS)
 */
export class SemanticResultCache {
  private similarityThreshold: number;
  private ttlMs: number;

  constructor() {
    this.similarityThreshold = config.cacheSemanticSimilarityThreshold;
    this.ttlMs = config.cacheTtlSemanticHours * 60 * 60 * 1000;
  }

  /**
   * Look up a semantically similar cached result.
   */
  async lookup(taskDescription: string, gitSha: string): Promise<CacheHit | CacheMiss> {
    try {
      const embedding = await this.getEmbedding(taskDescription);
      const results = await this.searchQdrant(embedding, gitSha);

      if (results.length > 0 && results[0].score >= this.similarityThreshold) {
        const hit = results[0];
        // Check TTL
        const expiresAt = new Date(hit.payload.expires_at).getTime();
        if (Date.now() > expiresAt) {
          return { layer: 'semantic_result', key: hit.payload.task_hash, reason: 'expired' };
        }

        return {
          layer: 'semantic_result',
          key: hit.payload.task_hash,
          savings_cents: hit.payload.cost_saved_cents,
          tokens_saved: hit.payload.tokens_saved,
        };
      }

      return {
        layer: 'semantic_result',
        key: createHash('sha256').update(taskDescription).digest('hex').slice(0, 16),
        reason: results.length > 0 ? 'below_threshold' : 'not_found',
      };
    } catch {
      // Graceful degradation — cache miss on infrastructure failure
      return {
        layer: 'semantic_result',
        key: 'error',
        reason: 'not_found',
      };
    }
  }

  /**
   * Store a task result in the semantic cache.
   */
  async store(
    taskDescription: string,
    result: string,
    gitSha: string,
    tokensSaved: number,
    savingsCents: number,
  ): Promise<void> {
    try {
      const embedding = await this.getEmbedding(taskDescription);
      const taskHash = createHash('sha256').update(taskDescription).digest('hex').slice(0, 32);
      const now = Date.now();

      await this.upsertQdrant({
        id: taskHash,
        vector: embedding,
        payload: {
          task_hash: taskHash,
          result_summary: result.slice(0, 500),
          full_result: result,
          cost_saved_cents: savingsCents,
          created_at: new Date(now).toISOString(),
          expires_at: new Date(now + this.ttlMs).toISOString(),
          git_sha: gitSha,
          tokens_saved: tokensSaved,
        },
      });
    } catch (err) {
      console.error('[semantic-cache] Failed to store:', (err as Error).message);
    }
  }

  /**
   * Get embedding from Ollama nomic-embed-text model.
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.status}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  /**
   * Search Qdrant for similar vectors.
   */
  private async searchQdrant(
    vector: number[],
    gitSha: string,
  ): Promise<Array<{ score: number; payload: QdrantPoint['payload'] }>> {
    const response = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit: 1,
        with_payload: true,
        filter: {
          must: [{ key: 'git_sha', match: { value: gitSha } }],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant search failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      result: Array<{ score: number; payload: QdrantPoint['payload'] }>;
    };
    return data.result;
  }

  /**
   * Upsert a point into Qdrant.
   */
  private async upsertQdrant(point: QdrantPoint): Promise<void> {
    const response = await fetch(`${config.qdrantUrl}/collections/${COLLECTION_NAME}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [point],
      }),
    });

    if (!response.ok) {
      throw new Error(`Qdrant upsert failed: ${response.status}`);
    }
  }
}
