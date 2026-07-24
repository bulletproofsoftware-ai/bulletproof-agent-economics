// =============================================================================
// src/budget/graceful-degradation.ts — Checkpoint + queue on exhaustion
// REQ-045: Graceful degradation on budget exhaustion
// Complete in-flight calls, checkpoint state, queue remaining tasks.
// =============================================================================

import { getRedis } from '../redis.js';
import { ECONOMICS_EVENT_TYPES } from '../types.js';
import { AuditBusBridge } from '../audit/audit-bus-bridge.js';

export interface CheckpointData {
  project_id: string;
  agent_id: string;
  session_id: string;
  current_task_id: string | null;
  queued_tasks: QueuedTask[];
  checkpoint_time: string;
  spent_cents: number;
  cap_cents: number;
}

export interface QueuedTask {
  task_id: string;
  description: string;
  priority: number;
  context_snapshot: string;
}

export class GracefulDegradation {
  private auditBridge: AuditBusBridge | null = null;

  constructor(auditBridge?: AuditBusBridge) {
    this.auditBridge = auditBridge ?? null;
  }

  /**
   * Handle budget exhaustion gracefully:
   * 1. Save checkpoint state to Redis
   * 2. Queue remaining tasks
   * 3. Emit resumption event to audit bus
   */
  async handleExhaustion(
    projectId: string,
    agentId: string,
    sessionId: string,
    currentTaskId: string | null,
    pendingTasks: QueuedTask[],
    spentCents: number,
    capCents: number,
  ): Promise<CheckpointData> {
    const checkpoint: CheckpointData = {
      project_id: projectId,
      agent_id: agentId,
      session_id: sessionId,
      current_task_id: currentTaskId,
      queued_tasks: pendingTasks,
      checkpoint_time: new Date().toISOString(),
      spent_cents: spentCents,
      cap_cents: capCents,
    };

    const redis = getRedis();
    const key = `checkpoint:${projectId}:${agentId}:${sessionId}`;
    await redis.set(key, JSON.stringify(checkpoint), 'EX', 86400);

    // Queue remaining tasks
    if (pendingTasks.length > 0) {
      const queueKey = `task_queue:${projectId}`;
      const pipeline = redis.pipeline();
      for (const task of pendingTasks) {
        pipeline.rpush(queueKey, JSON.stringify(task));
      }
      pipeline.expire(queueKey, 86400);
      await pipeline.exec();
    }

    // Emit to audit bus
    if (this.auditBridge) {
      this.auditBridge.emit({
        event_type: ECONOMICS_EVENT_TYPES.BUDGET_ENFORCEMENT,
        agent_id: agentId,
        session_id: sessionId,
        task_id: currentTaskId ?? undefined,
        detail: {
          scope_type: 'project',
          scope_id: projectId,
          threshold_pct: 100,
          spent_cents: spentCents,
          cap_cents: capCents,
          action_taken: 'pause',
          checkpoint_saved: true,
          tasks_queued: pendingTasks.length,
        },
        outcome: 'deny',
      });
    }

    return checkpoint;
  }

  /**
   * Resume from a checkpoint (when budget is replenished).
   */
  async resumeFromCheckpoint(
    projectId: string,
    agentId: string,
    sessionId: string,
  ): Promise<CheckpointData | null> {
    const redis = getRedis();
    const key = `checkpoint:${projectId}:${agentId}:${sessionId}`;
    const raw = await redis.get(key);
    if (!raw) return null;

    const checkpoint = JSON.parse(raw) as CheckpointData;
    await redis.del(key);

    return checkpoint;
  }

  /**
   * Get queued tasks for a project.
   */
  async getQueuedTasks(projectId: string): Promise<QueuedTask[]> {
    const redis = getRedis();
    const queueKey = `task_queue:${projectId}`;
    const raw = await redis.lrange(queueKey, 0, -1);
    return raw.map((r) => JSON.parse(r) as QueuedTask);
  }
}
