// =============================================================================
// src/optimizer/token-optimizer.ts — Orchestrates all 5 cache layers
// REQ-048: Semantic caching with configurable TTL per layer
// REQ-049: Cache invalidation by code changes
// =============================================================================

import type { CacheHit, CacheMiss, CacheLayer, ModelTier } from '../types.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { PromptCache } from './cache-layers/prompt-cache.js';
import { FileContentCache } from './cache-layers/file-content-cache.js';
import { SemanticResultCache } from './cache-layers/semantic-result-cache.js';
import { ToolResponseCache } from './cache-layers/tool-response-cache.js';
import { ContextCompressor } from './cache-layers/context-compressor.js';
import { computeCacheSavingsCents } from '../metering/cost-calculator.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export interface CacheStats {
  layer: CacheLayer;
  hits: number;
  misses: number;
  hit_rate: number;
  total_savings_cents: number;
}

/**
 * Token Optimizer: Orchestrates all 5 cache layers in priority order.
 * Each layer is checked sequentially. First hit wins.
 *
 * Priority order:
 * 1. Prompt cache (fastest, highest hit rate target)
 * 2. File content cache (git SHA-keyed)
 * 3. Tool response cache (deterministic results)
 * 4. Semantic result cache (embedding similarity)
 * 5. Context compression (last resort, triggers on 75% window)
 */
export class TokenOptimizer {
  private promptCache: PromptCache;
  private fileCache: FileContentCache;
  private semanticCache: SemanticResultCache;
  private toolCache: ToolResponseCache;
  private contextCompressor: ContextCompressor;
  private auditBridge: AuditBusBridge | null = null;

  // Statistics tracking
  private stats: Record<CacheLayer, { hits: number; misses: number; savings_cents: number }>;
  private onCacheSavings: ((data: { layer: CacheLayer; savings_cents: number; cumulative: number }) => void) | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.promptCache = new PromptCache();
    this.fileCache = new FileContentCache();
    this.semanticCache = new SemanticResultCache();
    this.toolCache = new ToolResponseCache();
    this.contextCompressor = new ContextCompressor();
    this.auditBridge = auditBridge ?? null;

    this.stats = {
      prompt: { hits: 0, misses: 0, savings_cents: 0 },
      file_content: { hits: 0, misses: 0, savings_cents: 0 },
      semantic_result: { hits: 0, misses: 0, savings_cents: 0 },
      tool_response: { hits: 0, misses: 0, savings_cents: 0 },
      context_compression: { hits: 0, misses: 0, savings_cents: 0 },
    };
  }

  /**
   * Register a callback for cache savings events (WebSocket).
   */
  onSavings(handler: (data: { layer: CacheLayer; savings_cents: number; cumulative: number }) => void): void {
    this.onCacheSavings = handler;
  }

  /**
   * Check prompt cache (L1).
   */
  async checkPromptCache(
    promptContent: string,
    tier: ModelTier,
  ): Promise<CacheHit | CacheMiss> {
    const result = await this.promptCache.lookup(promptContent);
    this.recordResult('prompt', result, tier);
    return result;
  }

  /**
   * Store in prompt cache (L1).
   */
  async storePromptCache(
    promptContent: string,
    tokens: number,
    tier: ModelTier,
  ): Promise<void> {
    const savings = computeCacheSavingsCents(tokens, tier, 'input');
    await this.promptCache.store(promptContent, tokens, savings);
  }

  /**
   * Check file content cache (L2).
   */
  async checkFileCache(
    gitSha: string,
    filePath: string,
    tier: ModelTier,
  ): Promise<CacheHit | CacheMiss> {
    const result = await this.fileCache.lookup(gitSha, filePath);
    this.recordResult('file_content', result, tier);
    return result;
  }

  /**
   * Check tool response cache (L4).
   */
  async checkToolCache(
    toolName: string,
    args: Record<string, unknown>,
    tier: ModelTier,
  ): Promise<CacheHit | CacheMiss> {
    const result = await this.toolCache.lookup(toolName, args);
    this.recordResult('tool_response', result, tier);
    return result;
  }

  /**
   * Store in tool response cache (L4).
   */
  async storeToolCache(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    tokensSaved: number,
    tier: ModelTier,
    ttlSeconds?: number,
  ): Promise<void> {
    const savings = computeCacheSavingsCents(tokensSaved, tier, 'input');
    await this.toolCache.store(toolName, args, result, tokensSaved, savings, ttlSeconds);
  }

  /**
   * Check semantic result cache (L3).
   */
  async checkSemanticCache(
    taskDescription: string,
    gitSha: string,
    tier: ModelTier,
  ): Promise<CacheHit | CacheMiss> {
    const result = await this.semanticCache.lookup(taskDescription, gitSha);
    this.recordResult('semantic_result', result, tier);
    return result;
  }

  /**
   * Check if context compression should trigger (L5).
   */
  async checkContextCompression(
    currentTokens: number,
    maxTokens: number,
    tier: ModelTier,
  ): Promise<CacheHit | CacheMiss> {
    const result = await this.contextCompressor.lookup(currentTokens, maxTokens);
    this.recordResult('context_compression', result, tier);
    return result;
  }

  /**
   * Get cache statistics for all layers.
   */
  getStats(): CacheStats[] {
    return Object.entries(this.stats).map(([layer, data]) => ({
      layer: layer as CacheLayer,
      hits: data.hits,
      misses: data.misses,
      hit_rate: data.hits + data.misses > 0
        ? data.hits / (data.hits + data.misses)
        : 0,
      total_savings_cents: data.savings_cents,
    }));
  }

  /**
   * Get cumulative savings across all layers.
   */
  getCumulativeSavingsCents(): number {
    return Object.values(this.stats).reduce(
      (sum, s) => sum + s.savings_cents,
      0,
    );
  }

  /**
   * Record a cache lookup result for statistics.
   */
  private recordResult(
    layer: CacheLayer,
    result: CacheHit | CacheMiss,
    _tier: ModelTier,
  ): void {
    if ('savings_cents' in result) {
      // Cache hit
      this.stats[layer].hits++;
      this.stats[layer].savings_cents += result.savings_cents;

      // Emit to audit bus
      if (this.auditBridge) {
        this.auditBridge.emit({
          event_type: ECONOMICS_EVENT_TYPES.CACHE_SAVINGS,
          agent_id: 'token-optimizer',
          detail: {
            layer,
            key: result.key,
            savings_cents: result.savings_cents,
            tokens_saved: result.tokens_saved,
            cumulative_savings_cents: this.getCumulativeSavingsCents(),
          },
          outcome: 'info',
        });
      }

      // Notify WebSocket subscribers
      if (this.onCacheSavings) {
        this.onCacheSavings({
          layer,
          savings_cents: result.savings_cents,
          cumulative: this.getCumulativeSavingsCents(),
        });
      }
    } else {
      // Cache miss
      this.stats[layer].misses++;
    }
  }
}
