// =============================================================================
// src/index.ts — EconomicsLayer entry point
// Re-exports all public APIs for consumption by conductor plugin or standalone
// =============================================================================

// Types
export type {
  CostEvent,
  CostEventType,
  BudgetDecision,
  BudgetConfig,
  BudgetState,
  ModelTier,
  ModelPricing,
  ComplexitySignals,
  RoutingDecision,
  CacheLayer,
  CacheHit,
  CacheMiss,
  ChargebackReport,
  ChargebackLineItem,
  ROICalculation,
  AnomalyEvent,
  LiveMetrics,
  Alert,
  AlertSeverity,
  AlertChannel,
  InheritanceStrategy,
  EconomicsEventType,
  EconomicsAuditEvent,
  WSMessage,
} from './types.js';

export { MODEL_PRICING, ECONOMICS_EVENT_TYPES } from './types.js';

// Metering
export { MeteringEngine } from './metering/metering-engine.js';
export { computeCostCents, estimateCostCents, computeCacheSavingsCents, getPricing } from './metering/cost-calculator.js';

// Budget
export { BudgetController } from './budget/budget-controller.js';
export { distributebudget } from './budget/inheritance-strategy.js';
export { GracefulDegradation } from './budget/graceful-degradation.js';

// Router
export { ModelRouter } from './router/model-router.js';
export { classifyComplexity, extractSignals } from './router/complexity-classifier.js';
export { makeRoutingDecision } from './router/routing-rules.js';

// Anomaly
export { CostAnomalyDetector } from './anomaly/cost-anomaly-detector.js';

// Optimizer
export { TokenOptimizer } from './optimizer/token-optimizer.js';
export { CacheInvalidator } from './optimizer/cache-invalidation.js';

// Chargeback
export { ChargebackEngine } from './chargeback/chargeback-engine.js';

// Alerts
export { AlertDispatcher } from './alerts/alert-dispatcher.js';

// Audit Bus
export { AuditBusBridge } from './audit/audit-bus-bridge.js';

// API
export { createApp, startServer } from './api/server.js';
