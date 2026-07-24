// =============================================================================
// src/config.ts — Environment configuration with safe defaults
// =============================================================================

import { resolve } from 'node:path';
import { homedir } from 'node:os';

function env(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) throw new Error(`Invalid number for ${key}: ${raw}`);
  return parsed;
}

function resolveHome(p: string): string {
  if (p.startsWith('~')) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export const config = {
  // PostgreSQL
  databaseUrl: env(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/postgres',
  ),

  // Redis
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  redisKeyPrefix: 'econ:',

  // Governance Audit Bus
  auditDbPath: resolveHome(env('AUDIT_DB_PATH', './data/audit.db')),

  // Qdrant
  qdrantUrl: env('QDRANT_URL', 'http://localhost:6334'),

  // REQ-AE-003: Event Router — best-effort cost.recorded emission target.
  // A down/slow/erroring Event Router must never block the authoritative
  // Postgres cost write; the timeout bounds the fire-and-forget POST.
  eventRouterUrl: env('EVENT_ROUTER_URL', 'http://localhost:8085'),
  eventRouterEmitTimeoutMs: envInt('EVENT_ROUTER_EMIT_TIMEOUT_MS', 500),

  // Ollama
  ollamaUrl: env('OLLAMA_URL', 'http://localhost:11434'),

  // Server
  port: envInt('ECONOMICS_PORT', 8097),
  jwtSecret: env('ECONOMICS_JWT_SECRET', ''),
  jwtIssuer: env('ECONOMICS_JWT_ISSUER', 'agent-economics'),
  jwtExpirySeconds: 3600, // 1 hour (used when minting tokens via API)
  // jwt.verify maxAge enforcement window — set to "disabled" to honor token's
  // own exp claim (or accept tokens with no exp). Default keeps 1-hour CISO posture.
  jwtMaxAge: env('ECONOMICS_JWT_MAX_AGE', '1h'),

  // Dashboard
  dashboardPort: envInt('DASHBOARD_PORT', 8098),

  // Budget thresholds (percentage)
  budgetThresholdMonitorPct: envInt('BUDGET_THRESHOLD_MONITOR_PCT', 60),
  budgetThresholdWarnPct: envInt('BUDGET_THRESHOLD_WARN_PCT', 80),
  budgetThresholdThrottlePct: envInt('BUDGET_THRESHOLD_THROTTLE_PCT', 90),
  budgetThresholdPausePct: envInt('BUDGET_THRESHOLD_PAUSE_PCT', 100),

  // Anomaly detection
  anomalyMultiplierThreshold: envInt('ANOMALY_MULTIPLIER_THRESHOLD', 10),
  anomalyBaselineWindowDays: envInt('ANOMALY_BASELINE_WINDOW_DAYS', 7),

  // Cache TTLs
  cacheTtlPromptMinutes: envInt('CACHE_TTL_PROMPT_MINUTES', 5),
  cacheTtlSemanticHours: envInt('CACHE_TTL_SEMANTIC_HOURS', 24),
  cacheTtlToolResponseMinutes: envInt('CACHE_TTL_TOOL_RESPONSE_MINUTES', 60),
  cacheSemanticSimilarityThreshold: envFloat(
    'CACHE_SEMANTIC_SIMILARITY_THRESHOLD',
    0.95,
  ),

  // REQ-057: "active" agents window for /economics/live — agents with a cost
  // event in the last N minutes count as active. Fixes an unbounded-growth
  // bug where metrics:live:active_agents (a plain Redis SET, never pruned)
  // accumulated every agent_id ever seen since the service started (205+).
  activeAgentWindowMinutes: envInt('ACTIVE_AGENT_WINDOW_MINUTES', 15),

  // Trailing window (minutes) used to compute cost_rate_cents_per_hour on
  // /economics/live, extrapolated to an hourly rate. Replaces a Redis value
  // that was never written or expired anywhere in this codebase and stuck
  // permanently at whatever it was last manually set to.
  costRateWindowMinutes: envInt('COST_RATE_WINDOW_MINUTES', 15),

  // Model pricing (cents per 1M tokens) — overridable via env
  pricing: {
    haiku: {
      input: envInt('PRICING_HAIKU_INPUT', 80),
      output: envInt('PRICING_HAIKU_OUTPUT', 400),
      cache: envInt('PRICING_HAIKU_CACHE', 8),
    },
    sonnet: {
      input: envInt('PRICING_SONNET_INPUT', 300),
      output: envInt('PRICING_SONNET_OUTPUT', 1500),
      cache: envInt('PRICING_SONNET_CACHE', 30),
    },
    opus: {
      input: envInt('PRICING_OPUS_INPUT', 1500),
      output: envInt('PRICING_OPUS_OUTPUT', 7500),
      cache: envInt('PRICING_OPUS_CACHE', 150),
    },
    'gemini-flash': {
      input: envInt('PRICING_GEMINI_FLASH_INPUT', 10),
      output: envInt('PRICING_GEMINI_FLASH_OUTPUT', 40),
      cache: envInt('PRICING_GEMINI_FLASH_CACHE', 2),
    },
    'gemini-pro': {
      input: envInt('PRICING_GEMINI_PRO_INPUT', 125),
      output: envInt('PRICING_GEMINI_PRO_OUTPUT', 1000),
      cache: envInt('PRICING_GEMINI_PRO_CACHE', 31),
    },
    'nano-banana-pro': {
      input: envInt('PRICING_NANO_BANANA_PRO_INPUT', 3906),
      output: envInt('PRICING_NANO_BANANA_PRO_OUTPUT', 0),
      cache: envInt('PRICING_NANO_BANANA_PRO_CACHE', 0),
    },
    elevenlabs: {
      input: envInt('PRICING_ELEVENLABS_INPUT', 300),
      output: envInt('PRICING_ELEVENLABS_OUTPUT', 0),
      cache: envInt('PRICING_ELEVENLABS_CACHE', 0),
    },
    // REQ-057: new router tiers
    fable: {
      input: envInt('PRICING_FABLE_INPUT', 1500),
      output: envInt('PRICING_FABLE_OUTPUT', 7500),
      cache: envInt('PRICING_FABLE_CACHE', 150),
    },
    'ollama-local': {
      input: envInt('PRICING_OLLAMA_LOCAL_INPUT', 0),
      output: envInt('PRICING_OLLAMA_LOCAL_OUTPUT', 0),
      cache: envInt('PRICING_OLLAMA_LOCAL_CACHE', 0),
    },
    codex: {
      input: envInt('PRICING_CODEX_INPUT', 0),
      output: envInt('PRICING_CODEX_OUTPUT', 0),
      cache: envInt('PRICING_CODEX_CACHE', 0),
    },
    agy: {
      input: envInt('PRICING_AGY_INPUT', 0),
      output: envInt('PRICING_AGY_OUTPUT', 0),
      cache: envInt('PRICING_AGY_CACHE', 0),
    },
    veo: {
      input: envInt('PRICING_VEO_INPUT', 40_000_000),
      output: envInt('PRICING_VEO_OUTPUT', 0),
      cache: envInt('PRICING_VEO_CACHE', 0),
    },
    'edge-tts': {
      input: envInt('PRICING_EDGE_TTS_INPUT', 0),
      output: envInt('PRICING_EDGE_TTS_OUTPUT', 0),
      cache: envInt('PRICING_EDGE_TTS_CACHE', 0),
    },
  },

  // ROI defaults
  roiDeveloperRateCentsPerHour: envInt('ROI_DEVELOPER_RATE_CENTS_PER_HOUR', 15000),
  roiHoursPerStoryPoint: envInt('ROI_HOURS_PER_STORY_POINT', 4),

  // Alert channels
  alertSlackWebhookUrl: env('ALERT_SLACK_WEBHOOK_URL', ''),
  alertEmailSmtpHost: env('ALERT_EMAIL_SMTP_HOST', ''),
  alertEmailSmtpPort: envInt('ALERT_EMAIL_SMTP_PORT', 587),
  alertEmailFrom: env('ALERT_EMAIL_FROM', 'economics@bulletproofsoftware.tech'),
  alertEmailRecipients: env('ALERT_EMAIL_RECIPIENTS', '')
    .split(',')
    .filter(Boolean),
  alertWebhookUrl: env('ALERT_WEBHOOK_URL', ''),
  alertWebhookSecret: env('ALERT_WEBHOOK_SECRET', ''),

  // SQLite busy timeout (ms) — per CISO requirement
  sqliteBusyTimeoutMs: 5000,

  // Write batching for audit bus (ms)
  auditWriteBatchMs: 100,
} as const;
