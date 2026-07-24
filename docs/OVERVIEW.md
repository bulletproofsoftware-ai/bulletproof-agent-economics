# Overview — bulletproof-agent-economics

**Cost metering, budget enforcement, model routing, and chargeback for multi-agent systems.**

`bulletproof-agent-economics` is a TypeScript service that tracks what your AI
agents cost, enforces budgets, routes requests to the most cost-effective model
tier, and produces chargeback / ROI reports. It is backed by **PostgreSQL**
(authoritative ledger) and **Redis** (live counters), exposes a **REST API +
WebSocket** on port `8097`, and ships a **Vite/React dashboard**.

## What it does

| Capability | Summary |
|-----------|---------|
| **Metering** | Every metered action (`llm_call`, `tool_use`, `external_api`, `cache_hit`) becomes one row in `cost_events` — tokens × model pricing, always in **integer cents**. Ledger aggregates roll up per agent / session / project / feature / department / organization. |
| **Budget enforcement** | Per-scope budget caps with graduated thresholds (monitor / warn / throttle / pause). Enforcement actions: `ALLOW`, `WARN`, `DOWNGRADE`, `THROTTLE`, `BLOCK`. |
| **Model routing** | Heuristic complexity classifier maps a task to a model tier (haiku / sonnet / opus and others) by estimated tokens, file count, tool-call count, diff size, and reasoning need. Manual overrides are audited. |
| **Chargeback & ROI** | Chargeback reports per project / agent / department / organization for a date range (JSON or CSV), plus per-feature ROI (AI cost vs. estimated manual cost). |
| **Anomaly detection** | Flags cost events that exceed a rolling per-agent baseline by a configurable multiplier (default 10×). |
| **Alerts** | Multi-channel dispatch (Slack / email / webhook) on budget and anomaly events. |
| **Dashboard** | Live spend-vs-budget, cost-rate indicator, trend chart with forecast, routing feed, and alert feed — fed by REST polling + a WebSocket stream. |

## Architecture

```
                 ┌─────────────────────────────────────────────┐
 cost events ──► │  Express API (port 8097)  /economics/*       │
 (POST /events)  │  ┌──────────────┐  ┌─────────────────────┐   │
                 │  │ MeteringEngine│─►│ AnomalyDetector      │  │
                 │  └──────┬───────┘  │ BudgetController      │  │
                 │         │          └─────────┬───────────┘   │
                 │         ▼                    ▼                │
                 │   Postgres (ledger)    WebSocket /stream ────┼──► Dashboard
                 │   Redis (live counters)                      │
                 │         │                                    │
                 │         └──► Event Router (best-effort emit)  │
                 │         └──► Governance Audit Bus (SQLite)    │
                 └─────────────────────────────────────────────┘
```

- **PostgreSQL** is the source of truth: `cost_events` (raw), `cost_ledger`
  (materialized running totals), `budget_configs`, `chargeback_reports`,
  `roi_calculations`, and a `daily_cost_summary` materialized view.
- **Redis** holds live counters used by the dashboard: active-agent sorted set,
  events-per-minute, per-scope spend, and the anomaly baseline sorted set.
- The **Event Router** emission (`cost.recorded`) is truly fire-and-forget and
  bounded by a timeout — a slow or down router never blocks the authoritative
  Postgres write or the sub-100 ms metering overhead target.
- The **Governance Audit Bus** (a local SQLite DB) receives economics events
  (`economics.cost_event`, `economics.model_routed`, etc.).

## Model tiers

The router understands 13 tiers spanning Claude, Google, and local/CLI/media
providers. Pricing is stored in **integer cents per 1M tokens** and is
env-overridable:

`haiku`, `sonnet`, `opus`, `fable`, `ollama-local`, `codex`, `agy`,
`gemini-flash`, `gemini-pro`, `nano-banana-pro` (per-image),
`veo` (per-second video), `elevenlabs` (per-character), `edge-tts`.

Non-token providers map their natural billing unit onto the token schema by
convention (e.g. `nano-banana-pro` = 1024 "tokens" per image; `veo` = seconds).
See [`src/types.ts`](../src/types.ts) `MODEL_PRICING` for exact rates.

> Note: `fable` pricing is a placeholder matched to `opus` pending confirmation
> of real Fable API rates (flagged in-code, not silently guessed).

## Where to go next

- [INSTALL.md](INSTALL.md) — run it locally or via Docker.
- [HOW-TO-USE.md](HOW-TO-USE.md) — the REST/WebSocket API and the dashboard.
- [ADMINISTRATOR.md](ADMINISTRATOR.md) — configuration, auth, budgets, ops.
- [SBOM.md](SBOM.md) — software bill of materials.
- [scan/scan-report.md](scan/scan-report.md) — security scan results.

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
