// =============================================================================
// src/api/middleware/rate-limit.ts — Rate limiting for write endpoints
// =============================================================================

import type { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiter for write endpoints.
 * Default: 100 requests per minute per IP.
 */
export function rateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        retry_after_ms: entry.resetAt - now,
      });
      return;
    }

    res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
    next();
  };
}
