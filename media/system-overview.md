# Technical and Operational Report: Bulletproof Agent Economics

### 1. System Overview and Core Capabilities
The `bulletproof-agent-economics` service is a high-performance TypeScript framework architected for cost metering, budget enforcement, model routing, and financial accountability within multi-agent AI ecosystems. Acting as a centralized FinOps layer, it ensures that autonomous operations remain within predefined fiscal boundaries. The system provides granular visibility into AI spend through an authoritative PostgreSQL ledger complemented by real-time Redis counters for low-latency decision-making.

| Capability | Description |
| :--- | :--- |
| **Metering** | Records metered actions (`llm_call`, `tool_use`, etc.) as integer cents in an authoritative ledger. |
| **Budget Enforcement** | Implements per-scope budget caps with graduated thresholds (Monitor, Warn, Throttle, Pause). |
| **Model Routing** | Uses a heuristic classifier to map tasks to the most cost-effective tier (e.g., Haiku vs. Opus). |
| **Chargeback & ROI** | Generates reports by project or agent and calculates ROI against estimated manual costs. |
| **Anomaly Detection** | Flags cost events exceeding a rolling 7-day per-agent baseline by a set multiplier. |
| **Alerts** | Dispatches real-time notifications via Slack, Email, or Webhooks for budget and anomaly events. |

---

### 2. Technical Architecture and Data Strategy
The architecture employs a dual-database strategy to reconcile absolute data integrity with high-concurrency performance requirements.

**Database Roles and Migration Strategy**
*   **PostgreSQL (Authoritative Ledger):** Serves as the source of truth. Schema integrity is maintained through sequentially applied migrations:
    *   **001_cost_events.sql & 008_correlation_id.sql:** Manages raw metered actions and untrusted correlation IDs.
    *   **002_cost_ledger.sql:** Materializes running totals per scope for high-speed retrieval.
    *   **003_budget_configs.sql:** Defines budget caps, thresholds, and inheritance logic.
    *   **004_chargeback_reports.sql & 005_roi_calculations.sql:** Stores historical reconciliation data and efficiency metrics.
    *   **006_daily_summary_view.sql:** Provides the `daily_cost_summary` materialized view for aggregated reporting.
    *   **007_router_tiers.sql:** Configures the 13 supported model tiers and pricing tiers.
*   **Redis (Real-time Operations):** Facilitates high-frequency state management:
    *   Live counters for events-per-minute and active-agent tracking (15-minute sliding windows).
    *   Anomaly detection baseline sorted sets for instant comparison.
    *   Pub/Sub mechanism for streaming metrics to the WebSocket server.

**Reliability and Integration**
The **MeteringEngine** is optimized for mission-critical paths, targeting a sub-100 ms overhead. The authoritative `cost_events` insert is transactional, updating the `cost_ledger` aggregates within the same atomic operation to prevent data drift. 

External integrations are strictly non-blocking:
*   **Event Router:** Dispatches `cost.recorded` emissions with a 500ms timeout bound.
*   **Qdrant & Ollama:** Best-effort integrations that allow the core service to degrade gracefully.
*   **Governance Audit Bus:** Records all economics events to a local SQLite database for compliance auditing.

---

### 3. Economic Controls and Budget Enforcement
Budgets are managed through a graduated threshold system, allowing for automated intervention before a hard cap is reached.

| Threshold | Action | Description |
| :--- | :--- | :--- |
| 60% | **Monitor** | Standard tracking; entry-level visibility. |
| 80% | **Warn** | Automated alerts via Slack, Email, or Webhook. |
| 90% | **Throttle** | Applies rate limits to agent requests to preserve remaining budget. |
| 100% | **Pause / Block** | Immediate cessation of cost-incurring actions for the scope. |

**Enforcement Actions and Inheritance**
The system supports five levels: `ALLOW`, `WARN`, `DOWNGRADE`, `THROTTLE`, and `BLOCK`. 
*   **Auto-Downgrade Logic:** When thresholds are breached, the system can automatically downgrade tiers for Anthropic (Opus → Sonnet → Haiku) and Google (Gemini-Pro → Gemini-Flash). Other providers require manual selection.
*   **Inheritance Strategies:** Budgets support `POOL` (default), `EQUAL` (split parent cap across children), and `WEIGHTED` (proportional distribution) strategies.

---

### 4. Model Routing and Pricing Framework
The service supports 13 tiers, with pricing standardized as **integer cents per 1M tokens**. 

**Supported Tiers and Conventions:**
*   **Standard:** Haiku, Sonnet, Opus, Gemini-Flash, Gemini-Pro, Codex, AGY.
*   **Local/Media:** Ollama-Local, Edge-TTS, ElevenLabs (per character), Veo (per second of video).
*   **Specialty Mapping:** `nano-banana-pro` maps to 1024 tokens per image.

> [!WARNING]
> **Fable Pricing Verification Required**
> Current rates for the Fable tier are placeholders matched to Claude Opus rates. Infrastructure engineers must verify and update these in environment variables before relying on Fable-related chargeback figures.

**Heuristic Complexity Classifier**
The `/economics/route` endpoint analyzes task metadata—including token estimates, file counts, tool-call frequency, and "reasoning need"—to recommend a tier. For image, video, or TTS intents, the response includes a `media` field specifying the modality and relevant tier (e.g., `veo` for video).

---

### 5. Security Posture and Administrative Configuration
Security is baked into the infrastructure layer, utilizing non-privileged execution and strict validation.

**Authentication and Authorization**
The system mandates **JWT HS256** for all requests (excluding `/health` and advisory `/route`).
*   **Validation:** All tokens must contain a `sub`, a `role` (`admin` | `viewer`), and the expected issuer: `ECONOMICS_JWT_ISSUER=agent-economics`.
*   **Production Safeguard:** If `ECONOMICS_JWT_SECRET` is missing in production, the service returns HTTP 500 and halts all operations.
*   **CORS:** Restricted to the dashboard origin and `localhost:3000`.

**Core Environment Variables**
| Section | Variable | Purpose |
| :--- | :--- | :--- |
| **Core** | `DATABASE_URL` | PostgreSQL connection string (Authoritative). |
| **Auth** | `ECONOMICS_JWT_SECRET` | Required HS256 secret for production environments. |
| **Auth** | `ECONOMICS_JWT_ISSUER` | Must be set to `agent-economics`. |
| **Anomaly** | `ANOMALY_MULTIPLIER_THRESHOLD` | Threshold (default 10x) for spend alerts. |

**Container Security**
The environment boasts **0 critical and 0 high** vulnerabilities. Both the API/Migrations and Dashboard containers run as non-root users:
*   **API/Migrations:** `node:20-alpine` (Running as `node`).
*   **Dashboard:** `nginxinc/nginx-unprivileged:alpine` (Running as `nginx`, UID 101).

---

### 6. Anomaly Detection and Operational Monitoring
Operational risks are identified by comparing real-time spend against a 7-day rolling baseline (`ANOMALY_BASELINE_WINDOW_DAYS`). An event is flagged if it exceeds the baseline by the `ANOMALY_MULTIPLIER_THRESHOLD` (10x default).

**Operational Specifics**
*   **Materialized View:** The `daily_cost_summary` view requires an external schedule (e.g., Cron) for `REFRESH MATERIALIZED VIEW` operations; the service does not auto-refresh this view.
*   **Heartbeat Handling:** Presence heartbeats (`claude-code-hook-presence`) are recorded as activity to maintain agent visibility but **never** create a cost event row, ensuring anomaly and budget baselines remain untainted.

**Dashboard Components**
1.  **Cost Rate Indicator:** Real-time cents/hour based on a 15-minute window.
2.  **Spend vs. Budget:** Progress bars with color-coded threshold status.
3.  **Trend Chart:** 90-day history with linear-regression forecasting.
4.  **Routing Feed:** Log of recent heuristic decisions and modality mapping.
5.  **Alert Feed:** WebSocket-streamed budget breaches and anomalies.

---

### 7. API and Integration Reference

#### REST Endpoints
*   **Projects:** `GET /projects/:id` (Ledger), `PUT /projects/:id/budget` (**Admin**, Rate-limited: 20/min).
*   **Agents:** `GET /agents/:id/session` (Session cost), `GET /agents/:id/ledger` (12-period history).
*   **Routing:** `POST /economics/route` (Advisory), `POST /economics/routing/override` (**Admin**, Rate-limited: 10/min).
*   **Anomalies:** `GET /anomalies`, `POST /anomalies/:id/resolve` (**Admin**).
*   **System:** `POST /economics/events` (**Admin** - Manual cost ingest).

#### WebSocket Stream
Real-time events are available at `ws://<host>:8097/economics/stream`.
*   **Authentication:** Per CISO policy, the `Authorization: Bearer <token>` header must be present on the **initial upgrade request**. Query string tokens are rejected.
*   **Broadcasts:** Includes `cost_event`, `budget_update`, `anomaly_alert`, and `cache_savings`.

#### Chargeback and ROI
Chargeback data is available in JSON and CSV formats via `/chargeback/export`. ROI is derived by comparing actual AI expenditures against the `estimated_manual_cost` defined for specific features, providing a quantifiable metric for AI efficiency gains.