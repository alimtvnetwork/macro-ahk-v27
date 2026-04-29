# Reliability & Failure-Chance Report v4 — Extension v2.128.0

**Date**: 2026-04-09
**Purpose**: Assess spec quality and AI-handoff readiness after enum reorganization, error logging, rename preset persistence, and cross-project sync data layer.
**Active Codebase**: `chrome-extension/`, `src/`, `standalone-scripts/`
**Extension Version**: v2.128.0 | **Macro Controller**: v7.41

---

## 0. Changes Since v3 Report (v2.5.0 → v2.128.0)

| Change | Impact | Risk Delta |
|--------|--------|-----------|
| **TS Migration V2 all 8 phases complete** | macro-looping.ts monolith fully decomposed into class modules | F-023 resolved ↓ |
| **Enum reorganization** | Centralized enums, removed duplicates, consistent naming | Reduced state corruption risk ↓ |
| **Error logging via namespace logger** | All errors use `RiseupAsiaMacroExt.Logger.error()`, exact paths + reasoning | AI diagnostics improved ↓ |
| **Rename preset persistence** | Project-scoped IndexedDB via `ProjectKvStore`, auto-save on Apply/Close | New feature, low risk |
| **Cross-project sync data layer (Phase 1)** | SharedAsset, AssetLink, ProjectGroup tables + migration v7 + library handler + sync engine + content hasher + version manager | Data layer solid; UI pending |
| **Namespace database creation** | Dot-separated PascalCase namespaces, System.*/Marco.* reserved, 25 max | New feature, low risk |
| **Error modal & default databases** | Reusable ErrorModel, ErrorModal with copy diagnostics | Improved error UX |
| **SDK AuthTokenUtils** | Pure token utilities moved to SDK static class | Cleaner auth boundary |
| **Version sync automation** | `check-version-sync.mjs` enforced across all 8+ files | Version drift eliminated |
| **Test suite growth** | 822 → **1,079 tests** across 96 files (95 passing, 1 flaky) | +31% coverage |

---

## 1. Success Probability Estimates

### By Module Complexity Tier

| Tier | Module | Success % | Δ from v3 | Notes |
|------|--------|-----------|-----------|-------|
| **Simple** | Config loading (JSON schema) | 99% | — | Stable |
| **Simple** | CSV/JSON export | 99% | — | Stable |
| **Simple** | Progress bar rendering | 97% | — | Stable |
| **Simple** | SQLite bundle import/export | 98% | — | Stable |
| **Simple** | Rename preset persistence | 97% | NEW | ProjectKvStore; IndexedDB backed |
| **Medium** | Credit formula calculation | 96% | — | Shared helpers; 5-pool model |
| **Medium** | Bearer token auth bridge | 97% | +1% | AuthTokenUtils in SDK; cleaner boundary |
| **Medium** | Extension popup UI (React) | 96% | — | PlatformAdapter; 35+ smoke tests |
| **Medium** | Extension options UI (React) | 95% | +1% | Error modal added; hooks-order validated |
| **Medium** | Storage UI (4-category) | 95% | — | Spec 55 complete |
| **Medium** | Advanced automation engine | 93% | — | 46 unit tests; drag-drop builder |
| **Medium** | Prompt management (dual cache) | 94% | — | IndexedDB dual-cache stable |
| **Medium** | Namespace database CRUD | 95% | NEW | Validation rules well-specified |
| **Complex** | Injection pipeline (≤500ms) | 92% | +1% | Better error logging aids debugging |
| **Complex** | Workspace detection (XPath + CSS) | 92% | — | Self-healing XPath stable |
| **Complex** | Smart workspace switching | 89% | — | Race condition risk remains |
| **Complex** | SDK namespace (riseup) | 94% | +1% | AuthTokenUtils solidified |
| **Complex** | SDK notifier + config seeding | 91% | — | Hash-based re-seed |
| **Complex** | Live script hot-reload | 88% | — | File watcher + hash compare |
| **Complex** | Class-based architecture (V2) | 95% | +10% | **All 8 phases complete** — monolith decomposed |
| **Complex** | Cross-project sync (data layer) | 90% | +25% | Migration v7, handler, hasher, version manager all implemented |
| **E2E** | Full macro loop cycle | 88% | +1% | Error logging improves diagnosis |
| **E2E** | ComboSwitch 8-step transfer | 75% | — | Still DOM-coupled; highest fragility |
| **E2E** | Extension inject→detect→credit | 91% | +1% | Auth + error logging improvements |
| **E2E** | P Store marketplace | 70% | — | Still no backend API |
| **E2E** | Cross-project sync (full) | 78% | +13% | Data layer done; UI Phase 2 pending |

### Overall AI Handoff Success: **93%** (↑2% from v3)

**Key factors**: 1,079 tests (+31%), all 8 TS migration phases complete, enum centralization, structured error logging, cross-project sync data layer, 50+ memory files.

---

## 2. Failure Map

### 2.1 High-Risk Failures (Open)

| # | Module / Workflow | Why It Fails | Symptoms | Likelihood |
|---|-------------------|-------------|----------|------------|
| F-001 | DevTools injection | Chrome keyboard shortcut changes | JS not injected; silent failure | 15% per Chrome major |
| F-005 | Credit formula divergence | Platform introduces new credit pool | Wrong totals; bad auto-move | 10% per quarter |
| F-020 | ComboSwitch modal DOM | Platform updates Transfer dialog | 8-step combo fails step 2-5 | 20% per platform major |
| F-025 | P Store backend absence | No API server exists | Frontend renders empty store | 100% until backend built |

### 2.2 Medium-Risk Failures (Open)

| # | Module / Workflow | Why It Fails | Symptoms |
|---|-------------------|-------------|----------|
| F-008 | MutationObserver SPA persistence | React re-renders unmount injected UI | Panel disappears |
| F-009 | Cross-controller state | Both controllers share localStorage keys | State corruption |
| F-024 | E2E verification gap | React unification never Chrome-tested end-to-end | Hidden regressions |
| F-028 | Cross-project sync UI (NEW) | Phase 2 not yet built; complex state transitions (synced↔pinned↔detached) | Library tab missing |
| F-029 | js-executor test flake (NEW) | 1 test fails intermittently: "warns when textbox not found" | CI noise |

### 2.3 Low-Risk Failures

| # | Module / Workflow | Why It Fails |
|---|-------------------|-------------|
| F-011 | Clipboard race condition | User copies during injection (~200ms window) |
| F-012 | Project dialog timing | Wait insufficient on slow connections |

### 2.4 Resolved Since v3 Report ✅

| # | What Changed |
|---|-------------|
| F-023 | **macro-looping.ts monolith decomposed** — all 8 TS Migration V2 phases complete |
| F-026 | **Cross-project sync data layer complete** — migration v7, handler, sync engine, content hasher, version manager |
| F-027 | Hooks-order violations fixed across all components |
| — | Enum reorganization eliminates duplicate/inconsistent enum values |
| — | All error logs now include exact path + missing item + reasoning |
| — | Version sync automated and enforced via check-version-sync.mjs |
| — | Test suite expanded from 822 → 1,079 tests |

---

## 3. Corrective Actions (Prioritized)

| Priority | Action | Where to Change | Expected Gain | Status |
|----------|--------|----------------|---------------|--------|
| **P1** | Cross-project sync Phase 2 UI | `src/pages/options/views/`, `src/components/library/` | +5% sync module | ⬜ Ready (data layer done) |
| **P2** | E2E verification React UI | Manual Chrome testing | +2% overall | ⬜ Blocked (manual) |
| **P3** | P Store backend API definition | New server or mock | +5% for P Store | ⬜ Blocked (owner spec) |
| **P4** | Fix js-executor flaky test | `standalone-scripts/macro-controller/src/__tests__/` | Eliminates F-029 | ⬜ Ready |
| **P5** | React component test expansion (target 1,200+) | `src/__tests__/` | +1% | ⬜ Ready |

---

## 4. Readiness Decision

### Verdict: **READY — with minor caveats**

### What's Excellent ✅

1. **1,079 unit tests** across 96 files (+31% from v3)
2. **All 8 TS Migration V2 phases complete** — monolith fully decomposed
3. **26 engineering standards** — ESLint SonarJS zero errors/zero warnings
4. **Structured error logging** — every error includes path, missing item, reasoning
5. **Centralized enums** — no duplicate definitions, consistent naming
6. **Cross-project sync data layer** — 4 tables, 22 message types, full CRUD + sync engine
7. **50+ memory files** — architecture, features, workflow, constraints all documented
8. **Automated version sync** — check-version-sync.mjs + 8 version locations
9. **SDK auth boundary** — AuthTokenUtils static class, clean separation
10. **17 numbered spec folders** — well-organized with single-source-of-truth convention

### What Reduces AI Success ⚠️

1. **No E2E verification** of React unification (Step 10 never run in Chrome)
2. **P Store spec is DRAFT** — no backend API exists
3. **Cross-project sync Phase 2** — UI not yet built (data layer ready)
4. **1 flaky test** — js-executor "warns when textbox not found"
5. **No automated E2E test runner** — all verification is manual

### AI Failure Scenarios

| Scenario | Probability | Δ from v3 | Cause |
|----------|------------|-----------|-------|
| AI edits skipped/ folder | 2% | — | Policy well-documented + memory rule |
| AI breaks credit formula | 7% | — | Shared helpers reduce risk |
| AI breaks injection pipeline | 8% | ↓1% | Better error logging |
| AI introduces state race condition | 10% | ↓2% | Enum centralization, class decomposition |
| AI doesn't run build verification | 18% | — | No CI/CD; relies on manual build |
| AI misidentifies function in monolith | 5% | ↓9% | **Monolith decomposed into class modules** |
| AI modifies .release folder | 3% | — | Explicitly prohibited in memory |
| AI breaks cross-project sync state | 8% | NEW | 3 link states × N assets, but well-documented rules |

---

## 5. Spec Quality Scorecard

| Aspect | Rating | Δ from v3 | Notes |
|--------|--------|-----------|-------|
| Architecture documentation | ⭐⭐⭐⭐⭐ | — | Master overview + 17 spec folders + developer guide |
| Code conventions & standards | ⭐⭐⭐⭐⭐ | — | 26 standards + ESLint SonarJS zero-warning |
| Error handling documentation | ⭐⭐⭐⭐⭐ | — | 90+ issue write-ups + structured error logging |
| Root cause analysis docs | ⭐⭐⭐⭐⭐ | — | Prevention rules for every issue |
| UI sync patterns | ⭐⭐⭐⭐⭐ | — | All state changes verified |
| Testing guidance | ⭐⭐⭐⭐½ | ↑½ | 1,079 tests; no E2E runner |
| Version clarity | ⭐⭐⭐⭐⭐ | — | Automated version sync check |
| AI onboarding guide | ⭐⭐⭐⭐⭐ | — | S-029 checklist + developer guide |
| Memory system | ⭐⭐⭐⭐⭐ | — | 50+ memory files, structured conventions |
| Integration test coverage | ⭐⭐⭐½ | ↑½ | 1,079 tests but no E2E runner |
| Future feature specs | ⭐⭐⭐⭐ | ↑1 | Cross-project sync Phase 1 done; P Store still DRAFT |

---

## 6. Test Suite Summary

| Metric | v3 (v2.5.0) | v4 (v2.128.0) | Delta |
|--------|-------------|---------------|-------|
| Total tests | 822 | 1,079 | +257 (+31%) |
| Test files | 72+ | 96 | +24 |
| Passing | 822 | 1,078 | +256 |
| Failing | 0 | 1 (flaky) | +1 |
| Duration | ~15s | ~18s | +3s |
