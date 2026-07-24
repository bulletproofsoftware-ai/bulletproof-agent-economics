# How to use — bulletproof-agent-economics

All routes are mounted under the **`/economics`** prefix on the API port
(default `8097`). Every route except `/economics/health` requires a JWT bearer
token; some write routes additionally require the `admin` role. See
[ADMINISTRATOR.md](ADMINISTRATOR.md) for the auth model and token minting.

```
Authorization: Bearer <jwt>
```

> In development, if `ECONOMICS_JWT_SECRET` is unset and `NODE_ENV` is not
> `production`, auth is bypassed and the request runs as a dev admin user.

## REST endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/health` | none | Liveness + version. |

```bash
curl -s http://localhost:8097/economics/health
```

### Live metrics (dashboard feed)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/live` | token | Cost rate, active agents, per-project spend vs. budget, recent events. |

`cost_rate_cents_per_hour` is computed from real spend in a trailing window
(`COST_RATE_WINDOW_MINUTES`, default 15) and extrapolated hourly. `active_agents`
are agents seen within `ACTIVE_AGENT_WINDOW_MINUTES` (default 15).

### Projects & budgets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/projects/:id` | token | Project cost ledger + per-agent breakdown + current budget. |
| `GET` | `/economics/projects/:id/budget` | token | Budget config + current spend. |
| `PUT` | `/economics/projects/:id/budget` | **admin** | Upsert budget cap, thresholds, inheritance strategy, alert channels. Rate-limited (20/min). |

```bash
curl -s -X PUT http://localhost:8097/economics/projects/proj-42/budget \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cap_cents":500000,"period_type":"monthly","threshold_warn_pct":80}'
```

`cap_cents` must be a positive integer. Defaults if omitted: `period_type=monthly`,
`inheritance_strategy=POOL`, thresholds `60/80/90/100`, `alert_channels=["slack"]`.

### Agents

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/agents/:id/session` | token | Current (or `?session_id=`) session cost for an agent. |
| `GET` | `/economics/agents/:id/ledger` | token | Last 12 ledger periods for an agent. |

### Trends & forecast

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/trends` | token | Daily cost history + linear-regression forecast. `?days=` (max 90), `?project_id=`. |

### Chargeback & ROI

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/chargeback` | token | Chargeback line items for a period. `?start=`, `?end=` (YYYY-MM-DD), `?scope=project\|agent\|department\|organization`. |
| `GET` | `/economics/chargeback/export` | token | Same data as download. `?format=json\|csv`. |
| `GET` | `/economics/roi/:feature_id` | token | Stored ROI calculation for a feature (404 if none). |

```bash
curl -s "http://localhost:8097/economics/chargeback/export?format=csv&start=2026-07-01&end=2026-07-31" \
  -H "Authorization: Bearer $TOKEN" -o chargeback.csv
```

### Routing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/economics/route` | none¹ | Advisory routing recommendation for a task (does not record a cost). |
| `GET` | `/economics/routing/history` | token | Routing decision log. `?limit=` (max 200). |
| `POST` | `/economics/routing/override` | **admin** | Force a model tier for an agent, audited. Rate-limited (10/min). |

¹ `/economics/route` is mounted before the auth guard as an advisory-only lookup.

```bash
curl -s -X POST http://localhost:8097/economics/route \
  -H 'Content-Type: application/json' \
  -d '{"taskDescription":"refactor the auth module across 30 files","agentId":"builder-1","fileCount":30}'
# -> { model_tier, model_id, rationale, estimated_cost_cents, confidence, signals_used, media }
```

The response also carries a `media` field: if the task description matches an
image / video / TTS intent, it returns `{ modality, tier }`
(`nano-banana-pro` / `veo` / `elevenlabs`).

### Cache

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/cache/stats` | token | Per-layer cache hit rates from the TokenOptimizer. |

### Anomalies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/economics/anomalies` | token | Cost events in the last 24 h that exceed the agent's 7-day baseline by ≥ the multiplier. |
| `POST` | `/economics/anomalies/:id/resolve` | **admin** | Mark an anomaly investigated (`{ "resolution": "..." }`). |

### Cost-event ingest

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/economics/events` | **admin** | Record a cost event. Delegates to the MeteringEngine (DB + Redis + audit + anomaly/budget checks). |

```bash
curl -s -X POST http://localhost:8097/economics/events \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "event_type":"llm_call","agent_id":"builder-1","session_id":"s-1",
    "project_id":"proj-42","model":"claude-sonnet-4-5","routed_tier":"sonnet",
    "input_tokens":12000,"output_tokens":3000,"cache_read_tokens":0,"latency_ms":1800
  }'
# -> 201 { "recorded": true, "event_id": "...", "cost_cents": 81 }
```

Required string fields: `agent_id`, `session_id`, `project_id`, `model`,
`routed_tier`. `event_type` defaults to `tool_use`. `routed_tier` must be one of
the 13 known tiers; `event_type` one of `llm_call | tool_use | external_api |
cache_hit`. Costs are always integer cents.

## WebSocket stream

Connect to `ws://<host>:8097/economics/stream`. **Auth is via the
`Authorization: Bearer <token>` header on the upgrade request** (not a query
string), per CISO policy. On connect you receive a `connected` message.

Subscribe to filter by project/agent:

```json
{ "type": "subscribe", "projects": ["proj-42"], "agents": ["builder-1"] }
```

Broadcast message types: `cost_event`, `budget_update`, `anomaly_alert`,
`routing_decision`, `cache_savings`.

## Dashboard

The Vite/React dashboard (served on port 8080 in Docker) polls `/economics/live`
and `/economics/trends` and subscribes to the WebSocket stream. It renders:

- **Cost Rate Indicator** — live cents/hour + active agents.
- **Spend vs Budget** — per-project bars with threshold coloring.
- **Trend Chart** — daily history with forecast band.
- **Routing Feed** — recent routing decisions.
- **Alert Feed** — budget/anomaly/cost events streamed over WebSocket.

A green/red dot in the header reflects the live WebSocket connection state.

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
