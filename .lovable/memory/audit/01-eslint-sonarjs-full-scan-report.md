# ESLint SonarJS Full Scan Report

**Date**: 2026-04-01  
**Codebase**: Root (`/dev-server/`) — includes `src/`, `standalone-scripts/`, `tests/`  
**Total findings**: ~1721 (588 errors, 1133 warnings)

---

## Findings by Rule (Top 10)

| # | Rule | Count | Severity | Triage Decision |
|---|------|-------|----------|-----------------|
| 1 | `max-lines-per-function` | 853 | Warning | **Suppress in tests/e2e** — test functions are naturally long. In app code, track as tech debt for gradual splitting. |
| 2 | `@typescript-eslint/no-explicit-any` | 556 | Error | **Suppress project-wide** — macro controller + SDK use dynamic injection patterns, Chrome APIs, and `window.*` globals that require `any`. Converting all would be a multi-day effort with minimal safety gain. |
| 3 | `sonarjs/no-duplicate-string` | 192 | Warning | **Fix gradually** — extract repeated string literals into constants. Low risk if deferred. |
| 4 | `sonarjs/cognitive-complexity` | 58 | Warning | **Track as tech debt** — worst offenders: `findElement` (52), `renderLoopWorkspaceList` (60), `collectWorkspaceNameCandidatesFromNode` (25). Splitting these functions is tied to macro-looping.ts splitting plan. |
| 5 | `sonarjs/prefer-immediate-return` | 15 | Warning | **Auto-fixable** — trivial refactor, low priority. |
| 6 | `react-refresh/only-export-components` | 11 | Warning | **Suppress** — intentional for barrel exports and shared hooks. |
| 7 | `sonarjs/no-nested-template-literals` | 7 | Warning | **Fix gradually** — extract inner templates to variables. |
| 8 | `react-hooks/rules-of-hooks` | 5 | Error | **False positives** — all 5 are in `tests/e2e/fixtures.ts` where Playwright's `use()` function triggers the rule. Not React hooks. |
| 9 | `@typescript-eslint/no-namespace` | 5 | Error | **Suppress** — ambient type declarations for Chrome APIs and window globals. |
| 10 | `@typescript-eslint/no-this-alias` | 3 | Error | **Fix** — replace `const self = this` with arrow functions where possible. |

---

## Actionable Fixes Applied This Session

| Fix | Files | Count |
|-----|-------|-------|
| `prefer-const` auto-fix | Multiple | ~24 |
| `no-var` auto-fix | Multiple | ~11 |
| `no-useless-escape` suppressed (regex char class) | `ws-name-matching.ts` | 1 |
| `prefer-const` false positive suppressed (reassigned in try) | `notify.ts` | 1 |

---

## Recommended Next Steps (Priority Order)

1. **Disable `no-explicit-any` for standalone-scripts/** — These files use dynamic injection and Chrome APIs. Add to ESLint config overrides.
2. **Disable `react-hooks/rules-of-hooks` for tests/e2e/** — Playwright fixtures aren't React hooks.
3. **Disable `max-lines-per-function` for tests/** — Test functions are naturally large.
4. **Extract duplicate strings** in `ws-selection-ui.ts`, `ws-move.ts`, `xpath-utils.ts` — ~50 easy wins.
5. **Split high-complexity functions** — Tied to macro-looping.ts splitting plan (S-005).

---

## Summary

The vast majority of errors are `no-explicit-any` (556/588 = 95%), which is expected for a Chrome extension with dynamic injection patterns. After config tuning to suppress known-safe patterns, the effective error count drops to ~30, all of which are low-severity code style issues.

**Verdict**: No blocking issues. Codebase is healthy. Config tuning recommended to reduce noise.
