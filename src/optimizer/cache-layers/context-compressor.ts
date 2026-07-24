// =============================================================================
// L5: Context Compressor — History summarization at 75% window
// REQ-048: Triggers at 75% context window usage
// =============================================================================

import type { CacheHit, CacheMiss } from '../../types.js';

/**
 * L5 Context Compressor: Not a traditional cache layer.
 * Triggers compression of conversation history when context window
 * usage reaches 75%. Replaces older messages with summaries to
 * free context budget while preserving key information.
 *
 * This layer operates differently from L1-L4:
 * - No lookup/store pattern
 * - Instead, monitors context usage and produces compressed output
 * - Savings come from reducing token count of historical messages
 */
export class ContextCompressor {
  private compressionThreshold: number;

  constructor(compressionThreshold: number = 0.75) {
    this.compressionThreshold = compressionThreshold;
  }

  /**
   * Check if compression should be triggered based on context window usage.
   */
  shouldCompress(
    currentTokens: number,
    maxTokens: number,
  ): boolean {
    if (maxTokens === 0) return false;
    return currentTokens / maxTokens >= this.compressionThreshold;
  }

  /**
   * Compress conversation history by summarizing older messages.
   * Returns the compressed messages and token savings.
   *
   * Strategy:
   * 1. Keep the most recent N messages intact
   * 2. Summarize older messages into a condensed form
   * 3. Preserve key decisions, code changes, and error resolutions
   */
  async compress(
    messages: Array<{ role: string; content: string; tokens: number }>,
    _targetReduction: number = 0.5, // Reduce by 50%
  ): Promise<{
    compressed: Array<{ role: string; content: string; tokens: number }>;
    tokens_saved: number;
    savings_cents: number;
  }> {
    const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0);

    // Keep recent messages (last 20% of messages, target reduction applied via summary)
    const keepCount = Math.max(3, Math.ceil(messages.length * 0.2));
    const recentMessages = messages.slice(-keepCount);
    const olderMessages = messages.slice(0, -keepCount);

    if (olderMessages.length === 0) {
      return { compressed: messages, tokens_saved: 0, savings_cents: 0 };
    }

    // Create summary of older messages
    const summary = this.summarizeMessages(olderMessages);
    const summaryTokens = Math.ceil(summary.length / 4); // Rough estimate

    const compressed = [
      { role: 'system', content: `[Compressed history summary]\n${summary}`, tokens: summaryTokens },
      ...recentMessages,
    ];

    const compressedTokens = compressed.reduce((sum, m) => sum + m.tokens, 0);
    const tokensSaved = Math.max(0, totalTokens - compressedTokens);

    return {
      compressed,
      tokens_saved: tokensSaved,
      savings_cents: 0, // Savings computed by caller based on model pricing
    };
  }

  /**
   * Check if compression would help (used as cache-like interface).
   */
  async lookup(
    currentTokens: number,
    maxTokens: number,
  ): Promise<CacheHit | CacheMiss> {
    if (this.shouldCompress(currentTokens, maxTokens)) {
      return {
        layer: 'context_compression',
        key: 'trigger',
        savings_cents: 0,
        tokens_saved: Math.floor(currentTokens * 0.3), // Estimate
      };
    }
    return {
      layer: 'context_compression',
      key: 'no-trigger',
      reason: 'below_threshold' as const,
    };
  }

  /**
   * Simple message summarizer. In production, this would use an LLM call.
   * Here we implement a heuristic-based extraction.
   */
  private summarizeMessages(
    messages: Array<{ role: string; content: string; tokens: number }>,
  ): string {
    const keyPoints: string[] = [];

    for (const msg of messages) {
      const content = msg.content;

      // Extract key patterns: decisions, errors, file changes
      if (content.includes('decision:') || content.includes('decided to')) {
        keyPoints.push(`Decision: ${content.slice(0, 200)}`);
      } else if (content.includes('error') || content.includes('Error')) {
        keyPoints.push(`Error noted: ${content.slice(0, 150)}`);
      } else if (content.includes('created') || content.includes('modified') || content.includes('deleted')) {
        keyPoints.push(`File change: ${content.slice(0, 150)}`);
      }
    }

    if (keyPoints.length === 0) {
      return `${messages.length} earlier messages summarized. Key topics discussed but no specific decisions or errors recorded.`;
    }

    return keyPoints.join('\n');
  }
}
