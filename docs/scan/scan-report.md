# Security scan report — bulletproof-agent-economics

**Scanner:** Code Hardener — `standard` profile (12 code-appropriate scanners:
trivy, gitleaks, opengrep, checkov, grype, syft, oxlint, ruff, bandit, dockle,
hadolint).
**Scan ID:** `fa535798-57c1-46dc-ae22-ad179de06cc1`
**Branch:** `main`
**Date:** 2026-07-24

## Result

| Metric | Value |
|--------|-------|
| **Score** | **861 / 1000** |
| **Critical** | **0** ✅ |
| **High** | **0** ✅ |
| Medium | 23 |
| Low | 169 |
| Info | 2 |
| Secrets (gitleaks) | **0 — PASS** ✅ |

All CRITICAL and HIGH findings were fixed and confirmed cleared on re-scan.

## Signed artifacts

- **Attestation certificate PDF:** [`bulletproof-agent-economics-scan-report.pdf`](bulletproof-agent-economics-scan-report.pdf)
  (50 pages) — page 1 is the in-toto attestation certificate + score.
- **Attestation (in-toto, Ed25519):** [`attestation.json`](attestation.json) —
  subject digest `16319ca6…f2be17`, `ed25519-local` signature.
- **SARIF:** [`scan-report.sarif.json`](scan-report.sarif.json).
- **Full markdown report:** [`scan-report-full.md`](scan-report-full.md).

## Fixes applied (every real CRITICAL / HIGH → 0)

The initial scan reported **0 critical / 9 high**. All 9 were real and fixed:

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | HIGH | `nodemailer` GHSA-p6gq-j5cr-w38f (raw-option file/URL access bypass) | Bump `^6.9.0` → `^9.0.3` (installed 9.0.3). |
| 2 | HIGH | `nodemailer` CVE-2025-14874 (DoS via crafted email address header) | Same bump. Usage (`createTransport`/`sendMail`) is v9-compatible. |
| 3 | HIGH | `ws` CVE-2026-48779 (WebSocket DoS via memory exhaustion from small fragments) | Bump `^8.18.0` → `^8.21.0` (installed 8.21.1; advisory patched in 8.21.0). |
| 4 | HIGH | `Dockerfile` (api + migrations) — opengrep `missing-user` | Add `USER node` + `--chown=node:node` copies. Verified `id -un` → `node`. |
| 5 | HIGH | `Dockerfile` (api + migrations) — dockle `DS-0002` (image user is root) | Same fix. |
| 6 | HIGH | `src/dashboard/Dockerfile` — dockle `DS-0002` / `missing-user` | Switch `nginx:alpine` → `nginxinc/nginx-unprivileged:alpine` (non-root UID 101, listens 8080). Verified `id -un` → `nginx` and HTTP 200. |

> Findings 1–6 span 9 raw rule hits (some CVEs are reported by both trivy and
> grype, and the Dockerfile appears under both opengrep and dockle). All map to
> the four root causes above.

Additionally, five **MEDIUM** `github-actions-mutable-action-tag` findings were
fixed (beyond the critical/high requirement) by pinning all GitHub Actions to
commit SHAs (`actions/checkout`, `actions/setup-node`, `ossf/scorecard-action`,
`github/codeql-action/upload-sarif`).

After all fixes, the re-scan confirmed **0 critical / 0 high**.

## Verification performed

- `npx tsc --noEmit` — clean.
- `npm run build` — clean.
- Full test suite — **122 passed, 4 skipped** (skips are DB-integration tests
  that degrade gracefully without Postgres).
- API Docker image builds; `id -un` → `node`.
- Dashboard Docker image builds; `id -un` → `nginx`; serves HTTP 200 on 8080;
  `nginx -t` config valid.

## What remains (low-risk, documented — not blocking)

Per policy, medium/low findings are not chased to zero. The residual 23 medium /
169 low are non-blocking:

| Finding | Count | Assessment |
|---------|-------|------------|
| `express-unvalidated-params` (opengrep) | 13 | **Not exploitable.** These route params flow into **parameterized SQL** (`$1`/`$2`), never string interpolation. |
| `hardcoded-hmac-key` (opengrep) | 5 | **Test fixtures** in `src/alerts/__tests__/alert-dispatcher.test.ts` — not shipped, not real secrets. |
| `qs@6.14.2` CVE-2026-8723 (medium, transitive via express) | 2 | Medium DoS on `qs.stringify`; no fixed release satisfies the express constraint without a breaking major. Watched. |
| `uuid@10.0.0` CVE-2026-41907 (medium) | 2 | Fix is `uuid@14` (breaking major). Not upgraded to avoid an unvetted breaking change; low real-world impact for this usage. |
| oxlint / low findings | ~170 | Cosmetic (unused vars, style). Not auto-`--fix`ed (that can strip defensive null-guards). |

Low-severity items are predominantly informational lint/style and are documented
here rather than mechanically suppressed.

---

Apache-2.0 © 2026 bulletproofsoftware-ai. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
