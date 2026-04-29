# Issue RCA — MV3 CSP Install Failure + Osano Injection Breakage
Updated: 2026-03-19

## Summary
A regression introduced a **non-loadable extension build** and masked the original runtime injection issue.

- **Primary failure now:** Extension fails to load in Chrome with:
  - `'content_security_policy.extension_pages': Insecure CSP value "'unsafe-eval'" in directive 'script-src'.`
- **Secondary (original) failure:** On Osano-protected pages, MAIN-world script-tag injection throws:
  - `Failed to execute 'appendChild' on 'Node': Unexpected identifier 'let' ... (osano.js...)`

This created a loop where fixes for runtime injection violated MV3 policy and blocked extension install.

---

## Do I know what the issue is?
**Yes.** The architecture currently depends on eval for ISOLATED fallback, but Manifest V3 extension pages cannot use `'unsafe-eval'`, so the extension cannot load when CSP is relaxed for that fallback.

---

## Impact
- **Severity:** Critical
- **User impact:** Extension cannot load (hard failure) or scripts silently fail on some pages (runtime failure).
- **Scope:** All users on Chrome MV3 builds using this manifest.

---

## Evidence

### 1) Install-time failure evidence
From user screenshot (`image-29`):
- Chrome dialog: `Error Loading Extension`
- Exact error:
  - `Insecure CSP value "'unsafe-eval'" in directive 'script-src'.`

From codebase:
- `chrome-extension/manifest.json`
  - `content_security_policy.extension_pages` currently contains `'unsafe-eval'`.

From official Chrome docs:
- `manifest/content-security-policy` states `extension_pages` policy **cannot be relaxed** beyond minimum.
- Disallowed additions like `'unsafe-eval'` cause install-time error.

### 2) Runtime failure evidence
From user screenshots (`image-26`, `image-28`):
- `Uncaught SyntaxError: Failed to execute 'appendChild' on 'Node': Unexpected identifier 'let'`
- Stack points to `osano.js ... [as appendChild]`

From codebase:
- `src/background/csp-fallback.ts` executes MAIN world via DOM script-tag append path.
- Same file executes ISOLATED fallback with `(0, eval)(code)`.

---

## Root Cause Analysis

## Root Cause A — MV3 CSP policy violation (install-time blocker)
**What happened**
- `'unsafe-eval'` was added to `manifest.json` extension CSP to support eval fallback.

**Why this fails**
- MV3 extension pages only allow secure script sources (`'self'`, `'wasm-unsafe-eval'`, etc. per Chrome policy constraints).
- `'unsafe-eval'` in `extension_pages` is rejected at install/load time.

**Result**
- Extension never loads, so no runtime fix can execute.

---

## Root Cause B — ISOLATED fallback design depends on eval (architectural conflict)
**What happened**
- ISOLATED fallback implementation uses `(0, eval)(code)`.

**Why this is fragile**
- It requires `'unsafe-eval'` in extension CSP, which MV3 forbids for extension pages.

**Result**
- The chosen fallback strategy is incompatible with MV3 CSP rules.

---

## Root Cause C — Osano monkey-patch interferes with MAIN-world script-tag injection
**What happened**
- On Osano pages, patched append flow re-parses injected script and throws parse errors (`Unexpected identifier 'let'`).

**Result**
- MAIN-world injection path can fail even when extension loads.

---

## Root Cause D — UX visibility gap for build/runtime mismatch
**What happened**
- Users saw failures but lacked immediate, explicit UI correlation of:
  - current extension build,
  - failing error build,
  - install-time policy violations.

**Result**
- High confusion: appears like “same bug” even when root cause shifted from runtime to install-time.

---

## Why previous fixes looked inconsistent
1. Runtime injection changes can appear to work in one loaded build.
2. Adding `'unsafe-eval'` then blocks extension loading entirely.
3. After failed reload/install, testing may still reference stale or partially loaded contexts.
4. Outcome appears random, but it is two different failure layers.

---

## Better Solution (Recommended)

## Strategy: remove eval dependency and migrate dynamic user code execution to MV3-compliant API

### Recommended target: `chrome.userScripts` pipeline
Why:
- Designed for user-provided arbitrary scripts.
- Supports world selection (`MAIN` / `USER_SCRIPT`).
- `USER_SCRIPT` world is intended to be isolated from page CSP constraints.
- Avoids requiring `'unsafe-eval'` in extension pages.

### High-level migration
1. **Manifest hardening**
   - Remove `'unsafe-eval'` from `extension_pages` CSP.
2. **Injection engine refactor**
   - Replace eval-based ISOLATED fallback with `chrome.userScripts` registration/execute flow.
3. **Error handling**
   - Keep explicit classification: CSP block, Osano interference, registration failure, bridge failure.
4. **Bridge compatibility**
   - Preserve existing message bridge (`window.postMessage`/relay or userScripts messaging).

---

## Alternative options considered

### Option 1: Keep `chrome.scripting` + eval fallback
- **Rejected**: MV3 install-time CSP violation.

### Option 2: Sandbox page for eval
- **Partially viable**, but sandbox lacks direct extension API and page DOM integration for this use case.
- Adds complexity and relay overhead.

### Option 3: MAIN-world only
- **Rejected**: still vulnerable on strict CSP / monkey-patched environments.

---

## Implementation Plan (phased)

### Phase 0 — Stabilize (immediate)
- Remove `'unsafe-eval'` from manifest CSP.
- Fail fast with explicit error code when fallback mechanism requires forbidden policy.

### Phase 1 — Compliance refactor
- Introduce `userScripts` execution path for dynamic user scripts.
- Feature-flag old fallback path off by default.

### Phase 2 — UX/debug resilience
- Surface in popup:
  - active extension version,
  - failing error version,
  - normalized root-cause code.
- Add explicit "extension failed to load due to CSP policy" diagnostic in docs + checks.

### Phase 3 — CI guardrails
- Add preflight rule to reject `'unsafe-eval'` in `manifest.json` for `extension_pages`.
- Keep version sync check as required gate.

---

## Acceptance Criteria
- Extension loads successfully in Chrome MV3 with no CSP install error.
- Injection works on Osano pages without eval in extension pages.
- Popup clearly shows failure reason + build version when any injection fails.
- Automated tests cover:
  - no unsafe-eval in manifest extension_pages,
  - Osano-style appendChild failure classification,
  - compliant fallback path behavior.

---

## Owner Notes
This is not a single bug; it is a layered architecture conflict:
1) install-time CSP policy violation, and
2) runtime injection interference.

Fixing only one layer keeps the loop alive.
