# 25 — Wave 5 scope: no list provided

**Date:** 2026-04-27
**Trigger:** "Implement Wave 5 by replacing console.error stragglers with Logger.error or logCaughtError across the listed files."

## The ambiguity

User said "the listed files" but no list was given in this turn or the immediately preceding context. Wave 2-4 covered: prompt-injector, injection-handler, use-popup-actions (W2); SW-side P1 breadcrumbs in csp-fallback/boot/prompt-handler/storage-browser-handler/config-auth-handler (W4); auth-health-handler + context-menu-handler (W3 named-files).

## Options considered

| # | Option | Pros | Cons |
|---|---|---|---|
| A | Stop & ask for the explicit list | Most accurate | Violates active No-Questions Mode |
| B | Sweep all remaining `console.error` in repo | Maximum coverage | Touches intentional-bare sites (logger internals, schema-migration mid-DB, OPFS bootstrap, page-side `func:` injections, snippet templates) — would break them |
| C | Convert real app-code stragglers in surfaces that already imported a logger pattern, OR for which a thin shim parallels the existing popup-logger / home-screen logger pattern. Skip intentional-bare sites with documented justifications. | Pragmatic; matches W2/W4 precedent; advances goal | User may have meant a narrower or wider list |

## Decision

**Option C.** Converted 7 real stragglers; documented why 16 others were left alone.

## Converted (7 sites)

1. **`src/pages/NotFound.tsx:8`** — added `@/components/options/options-logger` import; `logError("NotFound", ...)`.
2. **`src/lib/recorder-session-sync.ts:171`** — created neutral `src/lib/lib-logger.ts` shim (lib runs in both UI and SW); `logError("recorder-session-sync.dispatch", ...)`.
3. **`src/content-scripts/message-relay.ts:391`** — uses existing `./home-screen/logger` shim; `logHomeScreenError("boot", ...)`.
4. **`src/components/onboarding/OnboardingFlow.tsx:540`** — `logError("OnboardingStepBoundary", ...)` via options-logger.
5. **`src/components/options/StorageBrowserView.tsx:617`** — `logError("StorageBrowserView.loadData", ...)` via options-logger.
6. **`src/components/theme/ThemeProvider.tsx:57`** — `logError("ThemeProvider.cssSentinel", ...)` via options-logger.
7. **`src/background/recorder/step-library/result-webhook.ts:535`** — `logCaughtError(BgLogTag.WEBHOOK, ...)`. Added new `BgLogTag.WEBHOOK` enum member.

## New shim files

- **`src/components/options/options-logger.ts`** — mirrors `popup-logger.ts` / `home-screen/logger.ts`; scope prefix `"Options."`. Single fallback site for chrome-extension://options.html context where the `RiseupAsiaMacroExt` SDK is not present.
- **`src/lib/lib-logger.ts`** — neutral shim for `src/lib/` modules consumed by both UI and SW; scope prefix `"Lib."`. Cannot import bg-logger (would pull SQLite + DOM-less code into UI bundle).

## Skipped — and why (16 sites)

| Site | Reason for keeping bare |
|---|---|
| `src/background/bg-logger.ts:128, :130` | The bg-logger fallback path itself — "DB/session not ready" branch, by design. |
| `src/background/db-manager.ts:356, :371` | Runs before SQLite is initialized; bg-logger pipeline depends on it. |
| `src/background/session-log-writer.ts:83, :139, :198, :388` | Writes the session log; cannot recurse into itself. |
| `src/background/schema-migration.ts:341, :364, :366` | Already commented `// Keep bare console.error — DB may be mid-migration`. |
| `src/background/manifest-seeder.ts:40`, `src/background/builtin-script-guard.ts:264` | String literal templates that are *injected as code* into stub scripts. |
| `src/background/injection-diagnostics.ts:100, :166` | The diagnostics renderer itself — emits structured banners with `%c` styling, not log entries. |
| `src/background/handlers/injection-wrapper.ts:106, :146` | Inside `func: () => { … }` body that runs in page MAIN world — has no extension-context imports. |
| `src/background/context-menu-handler.ts:319` | Inside `func:` body executed via `chrome.scripting.executeScript` in page world. |
| `src/background/handlers/injection-handler.ts:1154` | Same — inside injected page-world `func:` body. |
| `src/background/project-namespace-builder.ts:235` | String template assembled into the injected per-project namespace shim — runs in page MAIN world. |
| `src/components/options/monaco-js-intellisense.ts:160, :167, :213` | Monaco snippet template strings shown to the *user* as autocomplete; converting would break their suggestions (per Wave 2 decision in `22-logger-error-conversion-scope.md`). |
| `src/components/ErrorBoundary.tsx:42` | Top-level React error boundary — runs as the last-resort handler before UI white-screen; intentionally uses bare console for parity with React DevTools. |
| `standalone-scripts/marco-sdk/**` (logger.ts, http.ts, self-namespace.ts, index.ts) | The SDK *defines* its own Logger — these are the SDK's own fallback paths. |
| `standalone-scripts/macro-controller/src/{logging,error-utils,core/MacroController}.ts` | Macro controller's own logger or its bootstrap paths before the namespace logger is mounted. |
| `standalone-scripts/payment-banner-hider/src/index.ts:147` | Documented fallback in standalone bundle without namespace SDK. |
| `standalone-scripts/{lovable-owner-switch,lovable-user-add}/src/ui/popup-file-input.ts:39` | Standalone popup scripts — no SDK access. |
| `standalone-scripts/payment-banner-hider/src/smoke-test.ts:107` | Standalone smoke test, runs outside ext. |
| `src/lib/developer-guide-data.generated.ts:*` | Generated file — never hand-edit. |

## Verification

- `npx tsc --noEmit`: clean.
- `npx eslint <all 10 edited/new files>`: 0 errors, 4 warnings (all pre-existing in `result-webhook.ts` + `recorder-session-sync.ts`, untouched by this wave).
- `node scripts/audit-error-swallow.mjs`: 131 → **129** total (P0 8 → 7, P1 50 → 49). The audit only counts *empty catches / catch-noops*, not `console.error` calls — so the count drop reflects W3 carry-over confirming no regressions; W5 changes don't move that needle by design.
