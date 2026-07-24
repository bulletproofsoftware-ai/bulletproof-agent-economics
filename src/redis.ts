// =============================================================================
// src/redis.ts — Redis connection with econ: key prefix
// =============================================================================

import { Redis } from 'ioredis';
import { config } from './config.js';

let redis: Redis | null = null;
let subscriber: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      keyPrefix: config.redisKeyPrefix,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on('error', (err: Error) => {
      console.error('[redis] Connection error:', err.message);
    });
  }
  return redis;
}

/**
 * Get a separate Redis instance for pub/sub subscriber.
 * ioredis requires a dedicated connection for subscriptions.
 */
export function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(config.redisUrl, {
      keyPrefix: config.redisKeyPrefix,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    subscriber.on('error', (err: Error) => {
      console.error('[redis:subscriber] Connection error:', err.message);
    });
  }
  return subscriber;
}

/**
 * Atomic increment budget spend and return new total.
 * Uses a Lua script for atomic check-and-increment to prevent race conditions.
 */
export const BUDGET_CHECK_SCRIPT = `
  local spent_key = KEYS[1]
  local cap_key = KEYS[2]
  local increment = tonumber(ARGV[1])

  local current_spent = tonumber(redis.call('GET', spent_key) or '0')
  local cap = tonumber(redis.call('GET', cap_key) or '0')

  if cap > 0 then
    local new_spent = current_spent + increment
    redis.call('SET', spent_key, tostring(new_spent))
    local pct = math.floor((new_spent * 100) / cap)
    return {new_spent, cap, pct}
  else
    -- No cap set, just track spending
    local new_spent = current_spent + increment
    redis.call('SET', spent_key, tostring(new_spent))
    return {new_spent, 0, 0}
  end
`;

export async function closeRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
}
