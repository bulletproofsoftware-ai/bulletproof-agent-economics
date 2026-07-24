# Administrator guide — bulletproof-agent-economics

## Configuration

Everything is env-driven. Full reference: [`.env.example`](../.env.example) and
[`src/config.ts`](../src/config.ts) (which holds the safe defaults). Highlights:

### Core

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5437/postgres` | Authoritative cost ledger. |
| `REDIS_URL` | `redis://localhost:6379` | Live counters + pub/sub. |
| `ECONOMICS_PORT` | `8097` | API + WebSocket port. |
| `DASHBOARD_PORT` | `8098` | Referenced for CORS origin. |
| `AUDIT_DB_PATH` | `~/.claude/plugins/local/governance/state/audit.db` | Governance audit-bus SQLite file. |

### Authentication

| Var | Default | Purpose |
|-----|---------|---------|
| `ECONOMICS_JWT_SECRET` | *(empty)* | **Required in production.** HS256 signing secret. |
| `ECONOMICS_JWT_ISSUER` | `agent-economics` | Expected `iss` claim. |
| `ECONOMICS_JWT_MAX_AGE` | `1h` | Token max age. Set to `disabled` to honor the token's own `exp` (long-lived service tokens). |

Auth model ([`src/api/middleware/auth.ts`](../src/api/middleware/auth.ts)):

- **HS256 only.** The `none` algorithm and all others are rejected. Issuer is
  validated.
- Tokens carry `sub` and `role` (`admin` | `viewer`). Admin-only routes:
  `PUT /projects/:id/budget`, `POST /routing/override`,
  `POST /anomalies/:id/resolve`, `POST /events`.
- **Production without a JWT secret returns HTTP 500** — the service refuses to
  serve unauthenticated in production.
- **Development bypass:** if `ECONOMICS_JWT_SECRET` is empty and `NODE_ENV` is
  not `production`, requests run as a synthetic dev admin. Do not deploy this way.
- WebSocket upgrades authenticate via the `Authorization` header (not a query
  string).

Mint a token with the exported helper (`generateToken(sub, role)` in
`src/api/middleware/auth.ts`) or any HS256 signer using `ECONOMICS_JWT_SECRET`
and issuer `agent-economics`.

### Budget thresholds (defaults, per-scope overridable)

| Var | Default | Action at/above |
|-----|---------|-----------------|
| `BUDGET_THRESHOLD_MONITOR_PCT` | `60` | monitor |
| `BUDGET_THRESHOLD_WARN_PCT` | `80` | warn |
| `BUDGET_THRESHOLD_THROTTLE_PCT` | `90` | throttle |
| `BUDGET_THRESHOLD_PAUSE_PCT` | `100` | pause / block |

Enforcement actions: `ALLOW`, `WARN`, `DOWNGRADE`, `THROTTLE`, `BLOCK`. When a
soft cap is hit, Claude tiers auto-downgrade along `opus → sonnet → haiku`
(and `gemini-pro → gemini-flash`); other providers do not downgrade — the
caller must choose a model. See
[`src/budget/budget-controller.ts`](../src/budget/budget-controller.ts).

Budget scopes support an **inheritance strategy** (`EQUAL`, `WEIGHTED`, `POOL`;
default `POOL`) and per-period types (`daily`, `weekly`, `monthly`, `session`).

### Anomaly detection

| Var | Default | Purpose |
|-----|---------|---------|
| `ANOMALY_MULTIPLIER_THRESHOLD` | `10` | Flag events ≥ N× the rolling baseline. |
| `ANOMALY_BASELINE_WINDOW_DAYS` | `7` | Baseline window. |

### Model pricing

All 13 tiers have `PRICING_<TIER>_INPUT/OUTPUT/CACHE` env overrides
(integer **cents per 1M tokens**). Defaults are in `src/config.ts` /
`src/types.ts`. Non-token providers use unit conventions:
`nano-banana-pro` (per image ≈ 1024 tokens), `veo` (per second),
`elevenlabs` (per character). `fable` defaults to opus pricing pending
confirmation of real rates — **review before relying on Fable cost figures.**

### Alert channels

`ALERT_SLACK_WEBHOOK_URL`, `ALERT_EMAIL_SMTP_HOST` / `_PORT` / `_FROM` /
`_RECIPIENTS`, `ALERT_WEBHOOK_URL` / `_SECRET`. Email uses nodemailer; the
webhook channel signs payloads with the HMAC secret. All channels are no-ops
if unconfigured.

### Optional integrations (best-effort, non-blocking)

| Var | Default | Purpose |
|-----|---------|---------|
| `EVENT_ROUTER_URL` | `http://localhost:8085` | Fire-and-forget `cost.recorded` emission. |
| `EVENT_ROUTER_EMIT_TIMEOUT_MS` | `500` | Bounds the emit so it never adds latency to the metering write. |
| `QDRANT_URL` | `http://localhost:6334` | Optional. |
| `OLLAMA_URL` | `http://localhost:11434` | Optional. |

## Operations

### Migrations

`npm run migrate` runs `migrations/*.sql` in filename order and is idempotent
(each uses `CREATE TABLE IF NOT EXISTS` / `CREATE ... IF NOT EXISTS`). A
migration-tracking table records applied migrations. In Docker, use the
`migrations` build target.

### Materialized view

`daily_cost_summary` (migration 006) aggregates daily cost per project / agent /
model / event-type. Refresh it on your own schedule
(`REFRESH MATERIALIZED VIEW daily_cost_summary;`) — the service does not refresh
it automatically.

### Reliability characteristics

- The authoritative `cost_events` INSERT is transactional and updates
  `cost_ledger` aggregates for every scope in the same transaction.
- `CLAUDE_CORRELATION_ID` is treated as untrusted: non-UUID values are coerced
  to `null` so they can never abort the cost write.
- A presence-heartbeat sentinel model (`claude-code-hook-presence`) is recorded
  as activity only — it never creates a `cost_events` row, keeping the anomaly
  and budget baselines clean.
- Metering targets < 100 ms overhead; a warning logs if exceeded.
- Rate limits: `PUT /projects/:id/budget` 20/min, `POST /routing/override`
  10/min (in-memory, per client IP).

### Security posture

- `helmet` security headers; CORS restricted to the dashboard origin and
  `localhost:3000`.
- Request body limit 1 MB.
- Error responses hide internal detail when `NODE_ENV=production`.
- Both container images run as **non-root** (`node` for API/migrations,
  `nginx`/UID 101 for the dashboard).
- Latest standard Code Hardener scan: **0 critical / 0 high**, no secrets
  detected. See [scan/scan-report.md](scan/scan-report.md).

## Known items for review

- **Fable pricing** is a placeholder (= opus). Confirm real rates before using
  Fable chargeback figures.
- The `daily_cost_summary` materialized view requires an external refresh
  schedule.
- `express-unvalidated-params` medium findings correspond to route params that
  are consumed via **parameterized SQL** (`$1`/`$2`) — not string interpolation.
  See [scan/scan-report.md](scan/scan-report.md) for the residual-findings
  rationale.

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
