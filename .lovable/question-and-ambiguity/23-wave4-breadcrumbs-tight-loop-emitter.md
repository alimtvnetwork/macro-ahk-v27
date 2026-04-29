# 23 — Wave 4 P1 breadcrumbs: tight-loop emitter scope (2026-04-27)

User asked to instrument ~58 P1 sites with a sampled emitter. Real audit shows
many sites already have `console.debug` breadcrumbs from earlier waves; the
truly remaining swallows are smaller. Two design ambiguities had to be
resolved without asking (No-Questions Mode):

## Ambiguity 1 — In-page serialized catches (csp-fallback lines 245/249/254/530/534/539, config-auth 574/588/590)
These live inside functions passed to `chrome.scripting.executeScript({ func })`,
which strips outer-scope references before serialization. They **cannot** import
`bg-logger`. Options:
- **A.** Leave silent (current state). Failures still surface upstream because
  the inlined `appendNode` returns `false` and the SW-side caller logs
  via `logBgWarnError(BgLogTag.INJECTION_CSP, combinedError)` (line 396).
- B. Inject bare `console.debug` in the page world — pollutes host page console,
  no per-key budget possible without `window` state.
- C. Plumb breadcrumbs back via `executeScript` return value — large refactor.

**Picked A.** SW-side `appendNodeToTarget` (lines 31–69, called per injection
attempt in the SW) IS instrumented with `logSampledDebug`. The downstream
catch in `runCspFallback` already collects the failure reason into
`combinedError` and surfaces it through `logBgWarnError`, so observability
is preserved.

## Ambiguity 2 — Sampling budget
Audit said "once-per-load". Picked **3 emissions per key per SW lifetime**
(constant `SAMPLED_DEBUG_BUDGET = 3`) so a flaky DOM produces a small
forensic trail rather than a single ambiguous line. Last emission appends
`(further occurrences suppressed)` so the operator knows more were dropped.
Counters reset on SW cold start; test-only `_resetSampledDebugCountersForTest`
exported for future Vitest coverage.

## Sites instrumented this wave
- `bg-logger.ts` — added `logSampledDebug(tag, key, message, error?)` helper
- `csp-fallback.ts` — SW-side `appendNodeToTarget` (3 strategy steps via
  extracted `tryAppendStrategy` helper) + `isLegacyInjectionForced`
- `boot.ts` — `persistBootFailure`, `readCurrentBuildId`,
  `clearAllLogsAndErrors` (logs + errors)
- `handlers/prompt-handler.ts` — `queryAllPromptsViaView`, `loadBundledDefaultPrompts`
- `handlers/storage-browser-handler.ts` — `probeTableEntry` (extracted helper for
  tables + views) + `handleStorageClearAll` per-table loop
- `handlers/config-auth-handler.ts` — `getCookieNames`, `getActiveTabUrl`,
  `extractSignedUrlTokenFromUrl`

11 SW-side P1 sites converted. Remaining audit-listed sites already had
breadcrumbs from earlier waves (cookie-watcher, cookie-helpers, several
config-auth and prompt-handler entries — verified via awk scan).
