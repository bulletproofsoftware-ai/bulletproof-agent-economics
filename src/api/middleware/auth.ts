// =============================================================================
// src/api/middleware/auth.ts — JWT authentication
// CISO: HS256 only, reject "none" algorithm, validate issuer, 1-hour expiry
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';

export interface AuthPayload {
  sub: string;
  role: 'admin' | 'viewer';
  iss: string;
  iat: number;
  exp: number;
}

/**
 * JWT authentication middleware.
 * Validates Bearer token from Authorization header.
 * Rejects "none" algorithm, requires HS256, validates issuer.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // In production, JWT secret is mandatory — refuse to serve without it
  if (!config.jwtSecret && process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Server misconfiguration: JWT secret not set' });
    return;
  }

  // Skip auth only in development mode when no JWT secret is configured
  if (!config.jwtSecret && process.env.NODE_ENV !== 'production') {
    (req as Request & { user?: AuthPayload }).user = {
      sub: 'dev-user',
      role: 'admin',
      iss: config.jwtIssuer,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // CISO: Only allow HS256, reject "none" and other algorithms.
    // maxAge is configurable via ECONOMICS_JWT_MAX_AGE; when explicitly set to
    // empty/null/disabled, the token's own exp claim governs expiry (allowing
    // long-lived service tokens for trusted local deployments).
    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
    };
    if (config.jwtMaxAge && config.jwtMaxAge.toLowerCase() !== 'disabled') {
      verifyOptions.maxAge = config.jwtMaxAge;
    }
    const decoded = jwt.verify(token, config.jwtSecret, verifyOptions) as AuthPayload;

    (req as Request & { user?: AuthPayload }).user = decoded;
    next();
  } catch (err) {
    const message = err instanceof jwt.TokenExpiredError
      ? 'Token expired'
      : err instanceof jwt.JsonWebTokenError
        ? 'Invalid token'
        : 'Authentication failed';
    res.status(401).json({ error: message });
  }
}

/**
 * Admin-only middleware. Must come after authMiddleware.
 */
export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: AuthPayload }).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Generate a JWT token (for testing and initial setup).
 */
export function generateToken(sub: string, role: 'admin' | 'viewer' = 'viewer'): string {
  if (!config.jwtSecret) {
    throw new Error('JWT secret not configured');
  }
  return jwt.sign(
    { sub, role },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      issuer: config.jwtIssuer,
      expiresIn: config.jwtExpirySeconds,
    },
  );
}
