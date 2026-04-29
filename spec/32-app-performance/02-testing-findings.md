# Testing Findings — Macro Recorder Build

**Version:** 1.0.0
**Updated:** 2026-04-26
**Phase:** 02 (Codebase + Testing Audit)
**Source Module:** `../31-macro-recorder/`

---

## Method

1. Inventoried `vitest.config.ts` setup and counted Vitest suites under `src/` + `standalone-scripts/`.
2. Counted Playwright E2E specs under `tests/e2e/` and grep'd `test.skip()` markers.
3. Cross-referenced recorder-relevant source files against existing test files to surface coverage gaps.

---

## Baseline Snapshot

| Metric | Value |
|---|---|
| Vitest suite files | **54** |
| Vitest config | `vitest.config.ts` — jsdom env, globals on, alias `@` → `src/` |
| Playwright E2E specs | **22** |
| E2E specs with at least one `test.skip()` | **18** (82%) |
| Recorder-relevant source files | 5 (`xpath-recorder`, `xpath-strategies`, `step-executors`, `chain-runner`, `click-trail`) |
| Recorder-relevant **unit** tests | **0** |
| Recorder-relevant **E2E** tests | 1 hermetic (`e2e-21-xpath-capture.spec.ts`) + 1 stub (`e2e-20-xpath-recorder.spec.ts`, fully skipped) |

---

## Findings

### Coverage Gaps — Unit (TEST-U)

| ID | Severity | File With No Tests | Why It Matters For Recorder |
|---|---|---|---|
| TEST-U1 | **High** | `src/content-scripts/xpath-strategies.ts` | All 4 strategies and `buildSegment` have zero unit tests. E2E-21 covers them through the browser; we need fast jsdom unit tests so Phase 06 refactors don't break them silently |
| TEST-U2 | **High** | `src/content-scripts/xpath-recorder.ts` | `isExcludedElement` (iframe/SVG/ShadowRoot guard) and `onElementClick` event flow have zero coverage |
| TEST-U3 | High | `src/lib/step-executors.ts` | Replay-side dispatch table — Phase 09 will extend this. No regression net today |
| TEST-U4 | Medium | `src/lib/chain-runner.ts` | Sequencer that Phase 09's replay contract will lean on |
| TEST-U5 | Medium | `src/lib/click-trail.ts` | Will be reused by recorder for click ordering across iframes |

### Coverage Gaps — E2E (TEST-E)

| ID | Severity | Spec | State | Phase Affected |
|---|---|---|---|---|
| TEST-E1 | **High** | `e2e-20-xpath-recorder.spec.ts` | All 6 tests `test.skip()` | Phase 05 (toolbar) + Phase 06 (XPath engine) |
| TEST-E2 | High | No spec exists | — | Phase 07 — CSV/JSON drop → column parse |
| TEST-E3 | High | No spec exists | — | Phase 08 — Field reference wrapper + binding persistence |
| TEST-E4 | High | No spec exists | — | Phase 09 — Step persistence + replay round-trip |
| TEST-E5 | Medium | No spec exists | — | Phase 10 — Project visualisation Step click → detail panel |
| TEST-E6 | Medium | No spec exists | — | Phase 11 — Inline JS step sandbox isolation |
| TEST-E7 | Medium | No spec exists | — | Phase 12 — Full record→bind→persist→visualise→replay flow |

### Infrastructure Gaps

| ID | Severity | Issue | Fix Sketch |
|---|---|---|---|
| TEST-I1 | High | E2E `globalSetup` runs 4 sequential builds (~13 min total per CI run) | Cache `chrome-extension/` build by `git-tree-hash` of source dirs; skip rebuild if hash unchanged |
| TEST-I2 | Medium | No coverage threshold gate in `vitest.config.ts` | Add `coverage.thresholds.lines: 70` once Phase 09 lands recorder unit tests |
| TEST-I3 | Medium | E2E specs have no shared **page fixture** for HTML test pages | Create `tests/e2e/fixtures/pages/` served by Playwright route handler — recorder phases 05–08 need this |
| TEST-I4 | Low | 18/22 E2E specs are stubbed; no CI signal that they're stubs vs failures | Replace `test.skip()` with `test.fixme()` so reports surface them |

---

## Acceptance for Phase 02

- [x] Vitest + Playwright inventory captured with absolute counts
- [x] 5 unit-coverage gaps flagged with phase-impact mapping
- [x] 7 E2E gaps flagged (1 existing stub + 6 missing) mapped to phases 05–12
- [x] 4 infrastructure gaps recorded

---

## Followup Action Plan (Sequenced With Phases)

| Action | Triggering Phase | Owner |
|---|---|---|
| Add unit tests for `xpath-strategies.ts` (4 strategies + segment) | Phase 06 | `src/content-scripts/__tests__/xpath-strategies.test.ts` (new) |
| Add unit tests for `xpath-recorder.ts` exclusion + click handler | Phase 06 | `src/content-scripts/__tests__/xpath-recorder.test.ts` (new) |
| Un-skip `e2e-20-xpath-recorder.spec.ts` 6 tests | Phase 05 + 06 | existing file |
| Add `e2e-22-data-source-drop.spec.ts` | Phase 07 | new |
| Add `e2e-23-field-binding.spec.ts` | Phase 08 | new |
| Add `e2e-24-step-persistence-replay.spec.ts` | Phase 09 | new |
| Add `e2e-25-project-visualisation.spec.ts` | Phase 10 | new |
| Add `e2e-26-inline-js-step.spec.ts` | Phase 11 | new |
| Add `e2e-27-record-to-replay-roundtrip.spec.ts` | Phase 12 | new |
| Build cache for E2E `globalSetup` | Phase 12 (perf pass) | `tests/e2e/global-setup.ts` |
| `tests/e2e/fixtures/pages/` shared HTML harness | Phase 05 | new |

---

## Cross-References

| Reference | Location |
|---|---|
| Hermetic XPath E2E (Phase 06 seed) | `../../tests/e2e/e2e-21-xpath-capture.spec.ts` |
| Stubbed recorder E2E to revive | `../../tests/e2e/e2e-20-xpath-recorder.spec.ts` |
| Vitest config | `../../vitest.config.ts` |
| Playwright config | `../../playwright.config.ts` |
| Phase plan | `../31-macro-recorder/02-phases.md` |
| Performance findings (sibling) | `./01-performance-findings.md` |
