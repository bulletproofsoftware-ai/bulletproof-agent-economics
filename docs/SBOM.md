# Software Bill of Materials — bulletproof-agent-economics

A machine-readable CycloneDX SBOM is committed at
[`agent-economics.cyclonedx.json`](agent-economics.cyclonedx.json), generated
with:

```bash
npm install
npm sbom --sbom-format cyclonedx --omit dev > docs/agent-economics.cyclonedx.json
```

## Summary

- **Runtime components (production, `--omit dev`): 84**
- **License distribution:**

| License | Count |
|---------|-------|
| MIT | 75 |
| ISC | 4 |
| Apache-2.0 | 3 |
| BSD-3-Clause | 1 |
| MIT-0 | 1 |

All runtime dependencies use permissive OSI-approved licenses (MIT / ISC /
Apache-2.0 / BSD-3-Clause / MIT-0). No copyleft licenses are present.

## Direct runtime dependencies

| Package | Version | License |
|---------|---------|---------|
| `better-sqlite3` | 13.0.1 | MIT |
| `cors` | 2.8.6 | MIT |
| `express` | 4.22.1 | MIT |
| `helmet` | 8.1.0 | MIT |
| `ioredis` | 5.10.1 | MIT |
| `jsonwebtoken` | 9.0.3 | MIT |
| `nodemailer` | 9.0.3 | MIT-0 |
| `pg` | 8.22.0 | MIT |
| `uuid` | 10.0.0 | MIT |
| `ws` | 8.21.1 | MIT |
| `zod` | 3.25.76 | MIT |

> `ws` and `nodemailer` were bumped to `8.21.1` and `9.0.3` respectively to
> clear HIGH-severity advisories (see [scan/scan-report.md](scan/scan-report.md)).

## Dev dependencies (not shipped)

Build/test-only tooling — TypeScript, `tsx`, `vitest`, `supertest`, and the
`@types/*` packages — is excluded from the SBOM above (`--omit dev`) because it
is not present in the runtime image. The dashboard (`src/dashboard/`) has its own
`package.json` with Vite/React build tooling; only the **built static assets**
ship in the dashboard image, not its `node_modules`.

## Base images

| Image | Base | Notes |
|-------|------|-------|
| API / migrations | `node:20-alpine` | Runs as non-root `node`. Installs `python3 make g++` only to build `better-sqlite3` from source where no prebuilt binary exists. |
| Dashboard | `nginxinc/nginx-unprivileged:alpine` | Runs as non-root `nginx` (UID 101), listens on 8080. |

## Runtime prerequisites (not npm packages)

- **PostgreSQL** — authoritative ledger.
- **Redis** — live counters + pub/sub.
- Optional: Event Router, Qdrant, Ollama (all best-effort, non-blocking).

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../LICENSE) and [NOTICE](../NOTICE).
