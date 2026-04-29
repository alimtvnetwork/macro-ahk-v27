# Idle Loop Audit — 2026-04-25 (Round 2)

**Trigger**: User asked to re-sweep for background loops/timers/intervals/observers running idly that could harm performance.
**Method**: `rg setInterval|setTimeout|MutationObserver|chrome.alarms|while.*true` across `src/` + `standalone-scripts/`; manually inspected every match; cross-referenced with PERF-1..8 fixes from prior audit.
**Outcome**: All 8 prior fixes still in source. **7 new findings** (PERF-9..15) recorded — no code changes per user instruction. Each High/Medium item gets its own RCA before any fix.

## Round 2 Findings

| ID | Sev | File:Line | Failure mode | Fix sketch |
|---|---|---|---|---|
| PERF-9  | ✅ Fixed | `standalone-scripts/macro-controller/src/loop-controls.ts` | Stale interval period after running↔stopped transition. | `startStatusRefresh()` now compares `state.statusRefreshPeriodMs` to desired interval, tears down + reinstalls on drift; fast-path no-op when matched. |
| PERF-10 | ✅ Fixed | `src/hooks/use-token-watchdog.ts` | 10 s setInterval ran while tab hidden. | Visibility-pause guard installed; refresh-on-visible. |
| PERF-11 | ✅ Fixed | `src/hooks/use-network-data.ts` | 5 s auto-refresh ran while tab hidden. | Visibility-pause guard; immediate tick on mount + `visibilitychange→visible`. |
| PERF-12 | ✅ Fixed | `src/hooks/use-error-count.ts` | 30 s fallback poll ran with broadcast listener AND while hidden. | `document.hidden` early-return + visibility listener; skips poll when listener attached. |
| PERF-13 | ✅ Fixed 2026-04-27 | `standalone-scripts/macro-controller/src/startup-persistence.ts` | MutationObserver bursts paid check cost mid-render on busy SPA pages. | Debounced burst now yields to `requestIdleCallback` (1 s timeout fallback) before re-checking marker/container. |
| PERF-14 | Low    | `standalone-scripts/marco-sdk/src/notify.ts:175` | `_dedupTimer` self-clears when map empties — already correct. Documented for completeness. | None. |
| PERF-15 | Low    | `standalone-scripts/macro-controller/src/ui/countdown.ts:86` | 1 Hz countdown tick runs while host tab hidden. Cheap (1 DOM write/tick). | None unless profile shows it. |

## Confirmed-Clean Surfaces (no action)

- `src/background/keepalive.ts` — `chrome.alarms` 30 s, idiomatic MV3.
- `src/background/hot-reload.ts` — PERF-1 prod-gate intact.
- `standalone-scripts/macro-controller/src/ui/panel-controls.ts:398` — PERF-2 self-clearing badge poll intact.
- `standalone-scripts/macro-controller/src/ui/section-auth-diag.ts:185` — PERF-3 self-clearing diag poll intact.
- `standalone-scripts/macro-controller/src/ui/redock-observer.ts` — PERF-4 generation token intact.
- `src/content-scripts/network-reporter.ts:294` — PERF-5 re-injection guard + pagehide teardown intact.
- `src/popup/hooks/usePopupData.ts:128` — PERF-7 visibility-pause intact.
- `standalone-scripts/macro-controller/src/toast.ts:214` — PERF-8 SDK-miss bailout intact.
- `standalone-scripts/macro-controller/src/workspace-observer.ts:239` — Disconnects previous; bounded retries.
- `standalone-scripts/payment-banner-hider/src/index.ts:102` — Self-disconnects when banner hidden.
- `src/content-scripts/home-screen/index.ts:66` — Scoped `subtree:false`, debounced, teardown returned.
- `src/background/handlers/library-handler.ts:398` — `while(true)` is a bounded slug uniqueness search (indexed query).
- `src/lib/developer-guide-data.generated.ts:1728,1937` — Inside literal user-doc code-snippet strings; not executed.

## Followup Action Plan

1. PERF-9 → RCA `spec/22-app-issues/108-status-refresh-interval-stale.md` → fix.
2. PERF-10..12 → shared RCA `spec/22-app-issues/109-react-hooks-visibility-pause.md` → 3 hook fixes.
3. PERF-13 → RCA `spec/22-app-issues/110-startup-persistence-observer-narrowing.md` → fix.
4. After fixes: `tsc --noEmit` for both projects; manual Chrome profiler check is deferred per `mem://preferences/deferred-workstreams`.

## Cross-References

- Round 1 audit: items PERF-1..8 (fixed in prior session, all verified intact).
- Task pattern: `mem://workflow/task-execution-pattern` (RCA-before-fix).
- Deferred items: `mem://preferences/deferred-workstreams` (manual Chrome testing).
