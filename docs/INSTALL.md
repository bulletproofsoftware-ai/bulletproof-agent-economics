# Install — bulletproof-agent-economics

## Prerequisites

- **Node.js ≥ 20** (`engines.node` in `package.json`).
- **PostgreSQL** — the authoritative cost ledger.
- **Redis** — live counters and pub/sub for the WebSocket stream.
- A C++ toolchain is only needed if `better-sqlite3` has no prebuilt binary for
  your platform (used by the local governance audit bus). The Docker image
  installs `python3 make g++` for this reason.

Optional integrations (all degrade gracefully if absent): an Event Router
(`EVENT_ROUTER_URL`), Qdrant (`QDRANT_URL`), Ollama (`OLLAMA_URL`).

## Local (from source)

```bash
git clone https://github.com/bulletproofsoftware-ai/bulletproof-agent-economics.git
cd bulletproof-agent-economics
npm install

cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, and (for production) ECONOMICS_JWT_SECRET.

npm run migrate        # apply migrations/*.sql in order (idempotent)
npm run build          # tsc -> dist/
npm start              # node dist/api/server.js — API on ECONOMICS_PORT (default 8097)
```

On start you should see:

```
[server] Agent Economics API listening on port 8097
[server] WebSocket at ws://localhost:8097/economics/stream
[server] Health check: http://localhost:8097/economics/health
```

Verify:

```bash
curl -s http://localhost:8097/economics/health
# {"status":"ok","service":"agent-economics","version":"1.0.0","timestamp":"..."}
```

> `/economics/health` is the only unauthenticated route. See
> [ADMINISTRATOR.md](ADMINISTRATOR.md) for the auth model.

### Development mode

```bash
npm run dev            # tsx watch src/api/server.ts (auto-reload)
npx tsc --noEmit       # typecheck
npx vitest run         # tests
```

> **Test runner note:** in CI this project runs vitest single-fork to avoid a
> tinypool worker crash:
> `npx vitest run --pool=forks --poolOptions.forks.singleFork=true --dangerouslyIgnoreUnhandledErrors`.
> Several DB-integration tests skip automatically when Postgres is unavailable.

## Docker

The root [`Dockerfile`](../Dockerfile) is multi-stage and produces two runtime
targets, both running as the non-root `node` user:

- `migrations` — runs the SQL migrations (`node dist/run-migrations.js`).
- `api` — runs the API server on port `8097` (`node dist/api/server.js`).

```bash
# Build and run migrations once, then start the API.
docker build --target migrations -t agent-economics-migrate .
docker run --rm --env-file .env agent-economics-migrate

docker build --target api -t agent-economics-api .
docker run --rm --env-file .env -p 8097:8097 agent-economics-api
```

### Dashboard image

[`src/dashboard/Dockerfile`](../src/dashboard/Dockerfile) builds the Vite/React
UI and serves it with **nginx-unprivileged** (non-root, UID 101), listening on
**port 8080**. nginx reverse-proxies `/economics` to the API and auto-injects a
`Bearer` token from `ECONOMICS_DASHBOARD_TOKEN`:

```bash
cd src/dashboard
docker build -t agent-economics-dashboard .
docker run --rm -e ECONOMICS_DASHBOARD_TOKEN=<jwt> -p 8080:8080 agent-economics-dashboard
# open http://localhost:8080
```

> The dashboard container listens on **8080** (nginx-unprivileged default), not
> 80. Map your host port accordingly. The nginx config uses Docker's embedded
> DNS resolver so it survives an `economics-api` container recreation without a
> restart.

## Base images

| Image | Base | Runtime user |
|-------|------|--------------|
| API / migrations | `node:20-alpine` | `node` (non-root) |
| Dashboard | `nginxinc/nginx-unprivileged:alpine` | `nginx` / UID 101 |

## Database schema

Migrations live in [`migrations/`](../migrations) and are applied in filename
order by `npm run migrate`:

| File | Creates |
|------|---------|
| `001_cost_events.sql` | `cost_events` — raw metered actions |
| `002_cost_ledger.sql` | `cost_ledger` — running totals per scope |
| `003_budget_configs.sql` | `budget_configs` — budget caps + thresholds |
| `004_chargeback_reports.sql` | `chargeback_reports` |
| `005_roi_calculations.sql` | `roi_calculations` |
| `006_daily_summary_view.sql` | `daily_cost_summary` materialized view |
| `007_router_tiers.sql` | router-tier support |
| `008_correlation_id.sql` | `cost_events.correlation_id` |

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
