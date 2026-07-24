// =============================================================================
// src/types.ts — Shared interfaces for the Agent Economics system
// =============================================================================

// ---------------------------------------------------------------------------
// Model Pricing (integer cents per 1M tokens)
// ---------------------------------------------------------------------------
export interface ModelPricing {
  model_id: string;
  tier: ModelTier;
  input_cents_per_million: number;
  output_cents_per_million: number;
  cache_read_cents_per_million: number;
}

// Tier covers all model providers an agent can use. Non-Claude tiers map their
// natural unit onto the tokens schema:
//   gemini-flash/pro: input/output tokens (Google billing in tokens too)
//   nano-banana-pro:  1 image = 1024 "tokens" (Google Imagen 4 / NBP per-image pricing)
//   elevenlabs:       1 character = 1 "token" (per-char billing)
// REQ-057: Router extension — Fable, local Ollama, external CLIs (Codex/Gemini-agy),
// Veo (video), Edge TTS (local/free narration).
export type ModelTier =
  | 'haiku' | 'sonnet' | 'opus' | 'fable'
  | 'ollama-local' | 'codex' | 'agy'
  | 'gemini-flash' | 'gemini-pro'
  | 'nano-banana-pro' | 'veo'
  | 'elevenlabs' | 'edge-tts';

export const MODEL_PRICING: Record<ModelTier, ModelPricing> = {
  haiku: {
    model_id: 'claude-haiku-3-5',
    tier: 'haiku',
    input_cents_per_million: 80,
    output_cents_per_million: 400,
    cache_read_cents_per_million: 8,
  },
  sonnet: {
    model_id: 'claude-sonnet-4-5',
    tier: 'sonnet',
    input_cents_per_million: 300,
    output_cents_per_million: 1500,
    cache_read_cents_per_million: 30,
  },
  opus: {
    model_id: 'claude-opus-4-5',
    tier: 'opus',
    input_cents_per_million: 1500,
    output_cents_per_million: 7500,
    cache_read_cents_per_million: 150,
  },
  // Google Gemini — billed per token (in cents per million tokens)
  'gemini-flash': {
    model_id: 'gemini-2.0-flash',
    tier: 'gemini-flash',
    input_cents_per_million: 10,
    output_cents_per_million: 40,
    cache_read_cents_per_million: 2,
  },
  'gemini-pro': {
    model_id: 'gemini-2.5-pro',
    tier: 'gemini-pro',
    input_cents_per_million: 125,
    output_cents_per_million: 1000,
    cache_read_cents_per_million: 31,
  },
  // Google Imagen 4 / Nano Banana Pro — billed per image. Convention: agent sends
  // input_tokens=1024 per image; input_cents_per_million=3906 gives ~$0.04/image
  // (3906 × 1024 / 1_000_000 ≈ 4 cents). output_tokens=0 (single-output).
  'nano-banana-pro': {
    model_id: 'imagen-4-nano-banana-pro',
    tier: 'nano-banana-pro',
    input_cents_per_million: 3906,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // ElevenLabs voice synthesis — billed per character. Convention: agent sends
  // input_tokens=character_count, input_cents_per_million=300 (~$0.30 per 1k chars).
  elevenlabs: {
    model_id: 'elevenlabs-multilingual-v2',
    tier: 'elevenlabs',
    input_cents_per_million: 300,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // REQ-057: Fable — placeholder rate matched to opus until actual Fable API
  // pricing is confirmed. Flagged, not guessed silently (spec §7 open item).
  fable: {
    model_id: 'claude-fable-5',
    tier: 'fable',
    input_cents_per_million: 1500,
    output_cents_per_million: 7500,
    cache_read_cents_per_million: 150,
  },
  // REQ-057: Local Ollama — free, runs on the operator's own hardware.
  'ollama-local': {
    model_id: 'ollama-local',
    tier: 'ollama-local',
    input_cents_per_million: 0,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // REQ-057: Codex CLI — runs on its own external subscription quota, not
  // billed per-token through this system by design.
  codex: {
    model_id: 'codex-cli',
    tier: 'codex',
    input_cents_per_million: 0,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // REQ-057: Gemini via agy CLI — same external-quota convention as codex.
  agy: {
    model_id: 'agy-gemini-cli',
    tier: 'agy',
    input_cents_per_million: 0,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // REQ-057: Veo video generation — billed per second of video. Convention:
  // agent sends input_tokens = seconds_of_video (mirrors nano-banana-pro's
  // per-image convention above). Rate: Veo 3 ~$0.40/sec -> 40 cents/sec ->
  // 40_000_000 cents per million "tokens" (seconds).
  veo: {
    model_id: 'veo-3',
    tier: 'veo',
    input_cents_per_million: 40_000_000,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
  // REQ-057: Edge TTS — free, local Microsoft TTS, no API key.
  'edge-tts': {
    model_id: 'edge-tts-local',
    tier: 'edge-tts',
    input_cents_per_million: 0,
    output_cents_per_million: 0,
    cache_read_cents_per_million: 0,
  },
};

// ---------------------------------------------------------------------------
// Cost Event
// ---------------------------------------------------------------------------
export interface CostEvent {
  event_id: string;
  event_type: CostEventType;
  agent_id: string;
  session_id: string;
  project_id: string;
  feature_id: string | null;
  department_id: string | null;
  organization_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_cents: number; // ALWAYS integer
  latency_ms: number;
  routed_tier: ModelTier;
  routing_signals: ComplexitySignals | null;
  manual_override: boolean;
  override_by: string | null;
  correlation_id?: string | null;
  timestamp: string; // ISO 8601
}

export type CostEventType = 'llm_call' | 'tool_use' | 'external_api' | 'cache_hit';

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------
export type BudgetAction = 'ALLOW' | 'WARN' | 'DOWNGRADE' | 'THROTTLE' | 'BLOCK';

export interface BudgetDecision {
  action: BudgetAction;
  threshold_pct: number;
  spent_cents: number;
  cap_cents: number;
  remaining_cents: number;
  anomaly: boolean;
  downgrade_to?: ModelTier;
}

export type InheritanceStrategy = 'EQUAL' | 'WEIGHTED' | 'POOL';

export interface BudgetConfig {
  scope_type: 'project' | 'agent' | 'department' | 'organization';
  scope_id: string;
  cap_cents: number;
  period_type: 'daily' | 'weekly' | 'monthly' | 'session';
  threshold_monitor_pct: number;
  threshold_warn_pct: number;
  threshold_throttle_pct: number;
  threshold_pause_pct: number;
  inheritance_strategy: InheritanceStrategy;
  agent_weights?: Record<string, number>;
  alert_channels: string[];
  slack_webhook_url?: string;
  email_recipients?: string[];
  webhook_url?: string;
  webhook_secret?: string;
}

export type BudgetState = 'HEALTHY' | 'MONITOR' | 'WARN' | 'THROTTLE' | 'PAUSED' | 'ANOMALY';

// ---------------------------------------------------------------------------
// Model Routing
// ---------------------------------------------------------------------------
export interface ComplexitySignals {
  estimated_tokens: number;
  file_count: number;
  tool_call_count: number;
  code_diff_lines: number;
  requires_reasoning: boolean;
  task_classification: string;
  task_description: string; // REQ-057: needed for explicit-signal detection
}

export interface RoutingDecision {
  model_tier: ModelTier;
  model_id: string;
  rationale: string;
  estimated_cost_cents: number;
  signals_used: ComplexitySignals;
  confidence: number; // 0-1
}

// ---------------------------------------------------------------------------
// Media Intent (REQ-057)
// ---------------------------------------------------------------------------
export type MediaModality = 'image' | 'video' | 'tts';

export interface MediaIntent {
  modality: MediaModality;
  tier: ModelTier;
}

// ---------------------------------------------------------------------------
// Token Optimizer
// ---------------------------------------------------------------------------
export type CacheLayer =
  | 'prompt'
  | 'file_content'
  | 'semantic_result'
  | 'tool_response'
  | 'context_compression';

export interface CacheHit {
  layer: CacheLayer;
  key: string;
  savings_cents: number; // Integer cents saved
  tokens_saved: number;
}

export interface CacheMiss {
  layer: CacheLayer;
  key: string;
  reason: 'expired' | 'not_found' | 'invalidated' | 'below_threshold';
}

// ---------------------------------------------------------------------------
// Chargeback
// ---------------------------------------------------------------------------
export interface ChargebackLineItem {
  scope_type: string;
  scope_id: string;
  scope_name: string;
  total_cost_cents: number;
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_breakdown: Record<string, number>; // model -> cost_cents
}

export interface ChargebackReport {
  report_id: string;
  period_start: string;
  period_end: string;
  line_items: ChargebackLineItem[];
  summary: {
    total_cost_cents: number;
    total_events: number;
    total_savings_cents: number;
  };
  generated_at: string;
  generation_ms: number;
}

export interface ROICalculation {
  feature_id: string;
  project_id: string;
  ai_cost_cents: number;
  ai_sessions_count: number;
  estimated_story_points: number;
  estimated_manual_hours: number;
  estimated_manual_cents: number;
  roi_ratio: number; // manual_cost / ai_cost
}

// ---------------------------------------------------------------------------
// Anomaly
// ---------------------------------------------------------------------------
export interface AnomalyEvent {
  agent_id: string;
  session_id: string;
  task_id: string;
  current_cost_cents: number;
  baseline_avg_cents: number;
  multiplier: number;
  action: 'auto_pause';
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Dashboard (WebSocket)
// ---------------------------------------------------------------------------
export interface LiveMetrics {
  cost_rate_cents_per_hour: number;
  active_agents: string[];
  projects: Array<{
    project_id: string;
    spent_cents: number;
    cap_cents: number | null;
    pct_used: number;
  }>;
  recent_events: CostEvent[];
  cache_hit_rate: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'slack' | 'email' | 'webhook';

export interface Alert {
  alert_id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string; // agent_id or project_id
  channels: AlertChannel[];
  created_at: string;
  delivery_attempts: number;
  delivered: boolean;
}

// ---------------------------------------------------------------------------
// Audit Bus Event Types (canonical from SHARED-audit-bus-schema.md)
// ---------------------------------------------------------------------------
export const ECONOMICS_EVENT_TYPES = {
  COST_EVENT: 'economics.cost_event',
  BUDGET_WARNING: 'economics.budget_warning',
  BUDGET_BREACH: 'economics.budget_breach',
  BUDGET_ENFORCEMENT: 'economics.budget_enforcement',
  ANOMALY_DETECTED: 'economics.anomaly_detected',
  MODEL_ROUTED: 'economics.model_routed',
  CACHE_SAVINGS: 'economics.cache_savings',
  CHARGEBACK_GENERATED: 'economics.chargeback_generated',
} as const;

export type EconomicsEventType =
  (typeof ECONOMICS_EVENT_TYPES)[keyof typeof ECONOMICS_EVENT_TYPES];

// ---------------------------------------------------------------------------
// Audit Bus Bridge Event
// ---------------------------------------------------------------------------
export interface EconomicsAuditEvent {
  event_type: EconomicsEventType;
  agent_id: string;
  session_id?: string;
  task_id?: string;
  target_agent_id?: string;
  tool_name?: string;
  detail: Record<string, unknown>;
  outcome: 'allow' | 'deny' | 'warn' | 'error' | 'info';
}

// ---------------------------------------------------------------------------
// WebSocket Message Types
// ---------------------------------------------------------------------------
export interface WSCostEvent {
  type: 'cost_event';
  data: CostEvent;
}

export interface WSBudgetUpdate {
  type: 'budget_update';
  data: {
    project_id: string;
    spent_cents: number;
    cap_cents: number;
    pct_used: number;
    threshold_action: string | null;
  };
}

export interface WSAnomalyAlert {
  type: 'anomaly_alert';
  data: AnomalyEvent;
}

export interface WSRoutingDecision {
  type: 'routing_decision';
  data: RoutingDecision & { agent_id: string };
}

export interface WSCacheSavings {
  type: 'cache_savings';
  data: {
    layer: CacheLayer;
    savings_cents: number;
    cumulative_savings_cents: number;
  };
}

export type WSMessage =
  | WSCostEvent
  | WSBudgetUpdate
  | WSAnomalyAlert
  | WSRoutingDecision
  | WSCacheSavings;

export interface WSSubscribe {
  type: 'subscribe';
  projects?: string[];
  agents?: string[];
}
