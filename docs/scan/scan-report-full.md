# Security Scan Report: bulletproof-agent-economics

**Scan ID:** `fa535798-57c1-46dc-ae22-ad179de06cc1`
**Date:** 2026-07-24T19:55:08.058Z
**Score:** 976/1000 (excellent)
**Branch:** main | **Commit:** `N/A`
**Profile:** standard

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 23 |
| Low | 169 |
| Info | 2 |
| **Total (open)** | **194** |

> **Note:** The counts above reflect _open_ findings only.
> 1 scanner(s) were skipped — see "Skipped Scanners" below.

## Scanners Executed

| Scanner | Status | Findings | Duration | Notes |
|---------|--------|----------|----------|-------|
| trivy | pass | 163 | 2.6s |  |
| gitleaks | pass | 0 | 0.5s |  |
| opengrep | pass | 22 | 6.3s |  |
| checkov | pass | 0 | 3.0s |  |
| grype | pass | 3 | 2.1s |  |
| syft | pass | 7 | 1.5s |  |
| package-validator | pass | 0 | 0.5s |  |
| oxlint | pass | 1 | 0.0s |  |
| ruff | skipped | 0 | 0.0s | _skipped: no_matching_files_ |
| actionlint | pass | 0 | 0.0s |  |
| jscpd | pass | 0 | 0.0s |  |
| typos | pass | 0 | 0.0s |  |
| _file_inventory | pass | 0 | 0.0s |  |

## Medium Findings (23)

### [MEDIUM] Type 'Mock' is imported but never used.

- **File:** `src/metering/__tests__/metering-correlation.test.ts`
- **Scanner:** oxlint
- **Rule:** `OXLINT-UNKNOWN`

**What's wrong:** Type 'Mock' is imported but never used.

**How to fix:** Review this finding and apply the appropriate fix based on the description: Type 'Mock' is imported but never used.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Using outdated libraries with known security issues.

- **File:** `/package-lock.json`
- **Scanner:** grype
- **Rule:** `CVE-2026-8723`
- **OWASP:** A06:2021-Vulnerable and Outdated Components

**What's wrong:** qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set

**Code:**
```json
Package: qs
Version: 6.14.2
Type: npm
Language: javascript
```

**How to fix:** Update qs to version 6.15.2

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Using outdated libraries with known security issues.

- **File:** `/package-lock.json`
- **Scanner:** grype
- **Rule:** `CVE-2026-41907`
- **OWASP:** A06:2021-Vulnerable and Outdated Components

**What's wrong:** uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided

**Code:**
```json
Package: uuid
Version: 10.0.0
Type: npm
Language: javascript
```

**How to fix:** Update uuid to version 11.1.1

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/trends.ts:15`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/trends.ts:14`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/routing.ts:17`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/projects.ts:69`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/projects.ts:50`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/projects.ts:17`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:77`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:76`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:75`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:17`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:16`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/chargeback.ts:15`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Request parameter or query string used without validation. Validate and sanitize all user input before use.


- **File:** `src/api/routes/agents.ts:16`
- **Scanner:** opengrep
- **Rule:** `configs.express-unvalidated-params`
- **CWE:** [CWE-20: Improper Input Validation](https://cwe.mitre.org/data/definitions/20.html)

**What's wrong:** Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Request parameter or query string used without validation. Validate and sanitize all user input before use.


**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

- **File:** `src/alerts/__tests__/alert-dispatcher.test.ts:44`
- **Scanner:** opengrep
- **Rule:** `javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key`
- **CWE:** [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- **OWASP:** A07:2021 - Identification and Authentication Failures

**What's wrong:** Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

- **File:** `src/alerts/__tests__/alert-dispatcher.test.ts:43`
- **Scanner:** opengrep
- **Rule:** `javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key`
- **CWE:** [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- **OWASP:** A07:2021 - Identification and Authentication Failures

**What's wrong:** Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

- **File:** `src/alerts/__tests__/alert-dispatcher.test.ts:35`
- **Scanner:** opengrep
- **Rule:** `javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key`
- **CWE:** [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- **OWASP:** A07:2021 - Identification and Authentication Failures

**What's wrong:** Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

- **File:** `src/alerts/__tests__/alert-dispatcher.test.ts:29`
- **Scanner:** opengrep
- **Rule:** `javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key`
- **CWE:** [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- **OWASP:** A07:2021 - Identification and Authentication Failures

**What's wrong:** Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

- **File:** `src/alerts/__tests__/alert-dispatcher.test.ts:21`
- **Scanner:** opengrep
- **Rule:** `javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key`
- **CWE:** [CWE-798: Use of Hard-coded Credentials](https://cwe.mitre.org/data/definitions/798.html)
- **OWASP:** A07:2021 - Identification and Authentication Failures

**What's wrong:** Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Code:**
```typescript
requires login
```

**How to fix:** Review this finding and apply the appropriate fix based on the description: Detected a hardcoded hmac key. Avoid hardcoding secrets and consider using an alternate option such as reading the secret from a config file or using an environment variable.

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Using outdated libraries with known security issues.

- **File:** `package-lock.json`
- **Scanner:** trivy
- **Rule:** `CVE-2026-41907`
- **OWASP:** A06:2021-Vulnerable and Outdated Components

**What's wrong:** uuid is for the creation of RFC9562 (formerly RFC4122) UUIDs. Prior to 14.0.0, v3, v5, and v6 accept external output buffers but do not reject out-of-range writes (small buf or large offset). This allows silent partial writes into caller-provided buffers. This vulnerability is fixed in 14.0.0.

**Code:**
```json
Package: uuid
Installed: 10.0.0
Fixed: 11.1.1, 12.0.1, 13.0.1
```

**How to fix:** Update uuid to version 11.1.1, 12.0.1, 13.0.1

**Action:** Plan to fix this issue in your next sprint or release.

---

### [MEDIUM] Using outdated libraries with known security issues.

- **File:** `package-lock.json`
- **Scanner:** trivy
- **Rule:** `CVE-2026-8723`
- **OWASP:** A06:2021-Vulnerable and Outdated Components

**What's wrong:** ### Summary



`qs.stringify` throws `TypeError` when called with `arrayFormat: 'comma'` and `encodeValuesOnly: true` on an array containing `null` or `undefined`. The throw is synchronous and not handled by any of qs's null-related options (`skipNulls`, `strictNullHandling`).



### Details



In the comma + `encodeValuesOnly` branch, `lib/stringify.js:145` mapped the array through the raw encoder before joining:



```js



obj = utils.maybeMap(obj, encoder);



```



`utils.encode` (`lib/utils.js:195`) reads `str.length` with no null guard, so a `null` or `undefined` element throws `TypeError`. `skipNulls` and `strictNullHandling` are both checked in the per-element loop below this line and never get a chance to run.



Same class of bug as the filter-array path fixed in 0c180a4. The vulnerable shape of the comma + `encodeValuesOnly` branch was introduced in 4c4b23d ("encode comma values more consistently", PR #463, 2023-01-19), first released in v6.11.1.



#### PoC



```js



const qs = require('qs');



qs.stringify({ a: [null, 'b'] },      { arrayFormat: 'comma', encodeValuesOnly: true });



qs.stringify({ a: [undefined, 'b'] }, { arrayFormat: 'comma', encodeValuesOnly: true });



qs.stringify({ a: [null] },           { arrayFormat: 'comma', encodeValuesOnly: true });



// TypeError: Cannot read properties of null (reading 'length')



//     at encode (lib/utils.js:195:13)



//     at Object.maybeMap (lib/utils.js:322:37)



//     at stringify (lib/stringify.js:145:25)



```



#### Fix



`lib/stringify.js:145`, applied in 21f80b3 on `main` and released as v6.15.2:



```diff



- obj = utils.maybeMap(obj, encoder);



+ obj = utils.maybeMap(obj, function (v) {



+     return v == null ? v : encoder(v);



+ });



```



`null` and `undefined` now pass through `maybeMap` unchanged and reach the `join(',')` step as-is. For `{ a: [null, 'b'] }` this produces `a=,b`, matching the non-`encodeValuesOnly` comma path (which already joins before encoding and produces `a=%2Cb` for the same input). Single-element `[null]` arrays still collapse via the existing `obj.join(',') || null` and remain subject to `skipNulls` / `strictNullHandling` in the main loop.



### Affected versions



`>=6.11.1 <6.15.2` — fixed in v6.15.2.



The vulnerable code shape was introduced in 4c4b23d and first shipped in v6.11.1. Earlier versions — including all of 6.7.x, 6.8.x, 6.9.x, 6.10.x, and 6.11.0 — implemented the comma + `encodeValuesOnly` path differently (joining before encoding) and are not affected. Empirically verified across released versions.



### Impact



Application code that calls `qs.stringify` with both `arrayFormat: 'comma'` and `encodeValuesOnly: true` (both non-default) on input that may contain a `null` or `undefined` array element will throw synchronously instead of producing a query string. In a typical Node.js HTTP framework (Express, Fastify, Koa, hapi) the sync throw is caught by the framework's error boundary and the affected request returns a 500; the worker process does not exit and subsequent requests are unaffected. The "kills the worker process" framing applies only to call sites outside a request-handler error boundary (background jobs, startup paths, stream pipelines) or to deployments with framework error handling explicitly disabled.



The vulnerable input is a `null` or `undefined` entry inside an array; this is reachable from JSON request bodies or from application code constructing arrays from user input, but not from standard HTML form submissions (which produce strings or omitted fields, not literal `null`).

**Code:**
```json
Package: qs
Installed: 6.14.2
Fixed: 6.15.2
```

**How to fix:** Update qs to version 6.15.2

**Action:** Plan to fix this issue in your next sprint or release.

---

## Low Findings (169)

- **SBOM-LICENSE-UNKNOWN**: Unknown License: ossf/scorecard-action@v2.4.0 (`/.github/workflows/scorecard.yml`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: github/codeql-action/upload-sarif@4187e74d05793876e9989daffde9c3e66b4acd07 (`/.github/workflows/scorecard.yml`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: agent-economics-dashboard@1.0.0 (`/src/dashboard/package-lock.json`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: agent-economics@1.0.0 (`/package-lock.json`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 (`/.github/workflows/ci.yml`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 (`/.github/workflows/scorecard.yml`)
- **SBOM-LICENSE-UNKNOWN**: Unknown License: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 (`/.github/workflows/ci.yml`)
- **CVE-2026-12590**: CVE-2026-12590: Vulnerability in body-parser@1.20.4 (`/package-lock.json`)
- **javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring**: unsafe-formatstring (`src/run-migrations.ts:60`)
- **javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring**: unsafe-formatstring (`src/audit/audit-bus-bridge.ts:188`)
- **javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring**: unsafe-formatstring (`src/alerts/alert-dispatcher.ts:68`)
- **LICENSE-Apache-2.0**: License Compliance: Apache-2.0 in  (`LICENSE`)
- **LICENSE-MIT**: License Compliance: MIT in scheduler (`src/dashboard/package-lock.json`)
- **LICENSE-MIT**: License Compliance: MIT in safer-buffer (`src/dashboard/package-lock.json`)
- **LICENSE-BSD-3-Clause**: License Compliance: BSD-3-Clause in rw (`src/dashboard/package-lock.json`)
- **LICENSE-Unlicense**: License Compliance: Unlicense in robust-predicates (`src/dashboard/package-lock.json`)
- **LICENSE-MIT**: License Compliance: MIT in loose-envify (`src/dashboard/package-lock.json`)
- **LICENSE-MIT**: License Compliance: MIT in js-tokens (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in internmap (`src/dashboard/package-lock.json`)
- **LICENSE-MIT**: License Compliance: MIT in iconv-lite (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in delaunator (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-zoom (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-transition (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-timer (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-time-format (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-time (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-shape (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-selection (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-scale-chromatic (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-scale (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-random (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-quadtree (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-polygon (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-path (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-interpolate (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-hierarchy (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-geo (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-format (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-force (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-fetch (`src/dashboard/package-lock.json`)
- **LICENSE-BSD-3-Clause**: License Compliance: BSD-3-Clause in d3-ease (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-dsv (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-drag (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-dispatch (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-delaunay (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-contour (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-color (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-chord (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-brush (`src/dashboard/package-lock.json`)
- **LICENSE-ISC**: License Compliance: ISC in d3-axis (`src/dashboard/package-lock.json`)

> ... and 119 more low findings

## Skipped Scanners (1)

Scanners that did not run on this scan, with the reason why and how to enable them.

| Scanner | Reason | How to enable |
|---------|--------|---------------|
| `ruff` | no_matching_files | No .py files found — Ruff requires a Python project |

## Recommendations

1. Update 163 vulnerable dependency/dependencies -- run `npm audit fix` or equivalent

---
*Generated by Code Hardener v0.1.0 | 2026-07-24T19:55:46.602Z*