# Performance Findings — Macro Recorder Build

**Version:** 1.0.0
**Updated:** 2026-04-26
**Phase:** 02 (Codebase + Testing Audit)
**Source Module:** `../31-macro-recorder/`

---

## Method

1. Reused the verified findings from `mem://performance/idle-loop-audit-2026-04-25` (PERF-1..15).
2. Re-scanned `src/`, `standalone-scripts/`, and `scripts/` for issues that **specifically affect the macro recorder build path** (capture loop, replay runtime, content-script injection budget, options-page render cost during a recording session).
3. Measured large-file footprint to flag refactor candidates that block the recorder UI shell (Phase 05).

---

## Findings

### Inherited from Round 2 Audit (Verified Intact)

These already have RCA tickets queued in `spec/22-app-issues/108-110`. Recorder phases must **not** introduce regressions of the same shape.

| ID | Severity | File | Risk to Recorder |
|---|---|---|---|
| PERF-9  | High   | `standalone-scripts/macro-controller/src/loop-controls.ts:297` | Replay runtime shares this loop pattern — Phase 09 must not duplicate the stale-interval bug |
| PERF-10 | High   | `src/hooks/use-token-watchdog.ts:168` | Recorder runs in Options page; any new 10 s timer must follow the visibility-pause pattern |
| PERF-11 | Medium | `src/hooks/use-network-data.ts:54` | Same |
| PERF-12 | Medium | `src/hooks/use-error-count.ts:55` | Same |
| PERF-13 | Medium | `standalone-scripts/macro-controller/src/startup-persistence.ts:51` | Recorder will register a MutationObserver during capture (Phase 06) — apply the same narrow-target rule |

### New Findings (Recorder-Specific)

| ID | Severity | Location | Failure Mode | Fix Sketch |
|---|---|---|---|---|
| PERF-R1 | **High** | `src/components/options/ProjectDetailView.tsx` (1683 LOC) | Phase 10 (project visualisation) will mount inside this view. Single component already exceeds the 80–100 LOC cap by ~17×; React will re-render the entire Step graph on any toolbar state change | Split into `ProjectDetailHeader`, `ProjectDetailSteps`, `ProjectDetailSidebar` **before** Phase 10 wires the Step graph |
| PERF-R2 | High | `src/background/handlers/injection-handler.ts` (1998 LOC) | Recorder injection will add 3+ new message types (`RECORD_START`, `RECORD_STEP`, `RECORD_STOP`). Switch-statement growth in a 2 k-LOC handler is a perf + maintainability risk | Refactor into `handlers/` subfolder with one file per message kind **before** Phase 09 ships |
| PERF-R3 | Medium | `src/lib/developer-guide-data.generated.ts` (2203 LOC) | Generated bundle ships in the Options page even though the recorder doesn't need it. Cold-start parse cost is paid on every `chrome-extension://` load | Lazy-load via dynamic `import()` only when the Help / Guide section opens. Saves measurable parse time in Recorder UI |
| PERF-R4 | Medium | `src/content-scripts/xpath-recorder.ts:128` (`startRecorder()` runs on script load) | Today the script self-starts on inject. Phase 05 toolbar wiring needs explicit start/stop control; auto-start adds capture overhead even when recorder is idle | Replace top-level `startRecorder()` with a `chrome.runtime.onMessage` listener gated on `RECORD_START` |
| PERF-R5 | Medium | `src/content-scripts/xpath-recorder.ts` `highlightElement()` uses a 1500 ms `setTimeout` per click | Burst-clicks during recording stack timeouts unboundedly | Track active timeout id per element; clear before reassigning |
| PERF-R6 | Low | No `chrome.runtime.sendMessage` batching in recorder | Every captured step round-trips to the SW individually. At 3+ clicks/sec the message queue fills | Buffer captures in a 100 ms-debounced flush; SW receives `{Steps: RecordedStep[]}` |
| PERF-R7 | Low | Recorder content script reads `element.textContent.trim().slice(0, 100)` on every click | OK today; will become hot if Phase 06 adds the closest-label walk on every hover for variable-name preview | Cache labels in a `WeakMap<Element, string>` invalidated by `MutationObserver` on `attributes`/`childList` |

### Confirmed-Clean Surfaces

| Surface | Why Safe |
|---|---|
| `tests/e2e/e2e-21-xpath-capture.spec.ts` | Hermetic — no network, no extension load |
| `src/content-scripts/xpath-strategies.ts` | Pure functions, no allocations beyond return objects |
| `src/lib/click-trail.ts`, `src/lib/step-executors.ts` | Replay-side only; not hot during capture |

---

## Acceptance for Phase 02

- [x] All 15 prior findings cross-referenced
- [x] 7 new recorder-specific findings recorded (PERF-R1..R7)
- [x] Each finding has Severity + Fix Sketch + linked phase that must respect the constraint

---

## Followup Action Plan (Sequenced With Phases)

| Action | Triggering Phase | Owner File |
|---|---|---|
| Refactor `injection-handler.ts` into `handlers/` subfolder | Before Phase 09 | `src/background/handlers/` |
| Replace `xpath-recorder.ts` auto-start with message-gated start | Phase 05 | `src/content-scripts/xpath-recorder.ts` |
| Add highlight-timeout tracking | Phase 05 | `src/content-scripts/xpath-recorder.ts` |
| Split `ProjectDetailView.tsx` | Before Phase 10 | `src/components/options/` |
| Lazy-load `developer-guide-data.generated.ts` | Phase 12 (perf pass) | `src/components/options/` import sites |
| Debounce capture flushes | Phase 09 | `src/content-scripts/xpath-recorder.ts` + SW handler |
| Label `WeakMap` cache | Phase 06 | `src/content-scripts/xpath-strategies.ts` |

---

## Cross-References

| Reference | Location |
|---|---|
| Round 2 audit (PERF-1..15) | `mem://performance/idle-loop-audit-2026-04-25` |
| Phase plan | `../31-macro-recorder/02-phases.md` |
| Coding caps (80–100 LOC, <8 line fns) | `../02-coding-guidelines/00-overview.md` |
| Visibility-pause pattern reference | `src/popup/hooks/usePopupData.ts:128` |
