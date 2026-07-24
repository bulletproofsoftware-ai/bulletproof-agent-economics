// =============================================================================
// src/optimizer/cache-invalidation.ts — Git SHA + TTL invalidation
// REQ-049: Cache invalidation by code changes (git SHA) and time
// =============================================================================

import { FileContentCache } from './cache-layers/file-content-cache.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export class CacheInvalidator {
  private fileCache: FileContentCache;
  private auditBridge: AuditBusBridge | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.fileCache = new FileContentCache();
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Handle a git commit event. Invalidates all file content caches
   * for the old SHA.
   */
  async onGitCommit(oldSha: string, newSha: string): Promise<number> {
    const deleted = await this.fileCache.invalidateByGitSha(oldSha);

    if (deleted > 0 && this.auditBridge) {
      this.auditBridge.emit({
        event_type: ECONOMICS_EVENT_TYPES.CACHE_SAVINGS,
        agent_id: 'cache-invalidator',
        detail: {
          action: 'invalidate',
          reason: 'git_sha_change',
          old_sha: oldSha,
          new_sha: newSha,
          entries_invalidated: deleted,
        },
        outcome: 'info',
      });
    }

    return deleted;
  }
}
