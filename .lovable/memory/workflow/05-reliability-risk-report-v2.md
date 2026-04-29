# Reliability & Failure-Chance Report v2 — Automator Extension v1.60.0

**Date**: 2026-04-01  
**Purpose**: Assess spec quality and AI-handoff readiness after Issues 76-88 resolved.  
**Active Codebase**: `chrome-extension/`, `src/`, `standalone-scripts/`  
**Chrome Extension**: v1.60.0 | **Macro Controller**: v7.38

---

## 1. Success Probability Estimates

### By Module Complexity Tier

| Tier | Module | Success % | Assumptions |
|------|--------|-----------|-------------|
| **Simple** | Config loading (JSON schema) | 99% | Schema meta engine with validation (Issue 85) |
| **Simple** | CSV/JSON export | 99% | Pure data transform |
| **Simple** | Progress bar rendering | 97% | Relative scaling; shared helpers |
| **Simple** | SQLite bundle import/export | 98% | Standardized schema; parameterized queries (S-033) |
| **Medium** | Credit formula calculation | 96% | Shared helpers; 5-pool model stable |
| **Medium** | Bearer token / cookie auth bridge | 95% | Cookie namespace binding fixed (Issue 76); cookie watcher active |
| **Medium** | Extension popup UI (React) | 96% | PlatformAdapter, preview-testable; 35 smoke tests |
| **Medium** | Extension options UI (React) | 94% | 14 components; Framer Motion; needs E2E verification |
| **Medium** | Storage UI (4-category redesign) | 95% | Spec 55 complete; cross-category search |
| **Medium** | Advanced automation engine | 93% | Spec 21 complete; 46 unit tests; drag-drop builder |
| **Complex** | Injection pipeline (≤500ms) | 90% | Issue 87 optimized; IndexedDB cache (Issue 88); auto-invalidation |
| **Complex** | Workspace detection (XPath + CSS) | 92% | Self-healing XPath; RiseUp namespace (Issue 79) |
| **Complex** | Smart workspace switching | 89% | Skip-depleted logic; race condition risk remains |
| **Complex** | SDK namespace (window.marco → riseup) | 93% | Issue 79 migration complete; globals injected (Issue 83) |
| **Complex** | SDK notifier + config seeding | 91% | Issue 86 complete; hash-based re-seed; 3-tab DB panel |
| **Complex** | Live script hot-reload | 88% | Issue 77 implemented; file watcher + hash compare |
| **E2E** | Full macro loop cycle | 86% | Improved from 84%; injection cache reduces timeout risk |
| **E2E** | ComboSwitch 8-step transfer | 75% | Still DOM-coupled; highest fragility point |
| **E2E** | Extension inject→detect→credit | 90% | Auth stabilized (Issues 80-81, 83); namespace migration done |

### Overall AI Handoff Success: **91%** (up from 89%)

**Improvement drivers**: Issues 76-88 resolved (auth, injection perf, namespace, IndexedDB cache), ESLint SonarJS integrated, 16 completed workflow plans, 822+ unit tests.

---

## 2. Failure Map

### 2.1 High-Risk Failures (Still Open)

| # | Module / Workflow | Why It Fails | Symptoms | Likelihood |
|---|-------------------|-------------|----------|------------|
| F-001 | DevTools injection | Chrome keyboard shortcut changes across versions | JS not injected; silent failure | 15% per Chrome major |
| F-005 | Credit formula divergence | Lovable introduces new credit pool type | Wrong totals; bad auto-move decisions | 10% per quarter |
| F-020 | ComboSwitch modal DOM | Lovable updates Transfer dialog DOM | 8-step combo fails at step 2-5 | 20% per Lovable major |

### 2.2 Medium-Risk Failures (Open)

| # | Module / Workflow | Why It Fails | Symptoms |
|---|-------------------|-------------|----------|
| F-008 | MutationObserver SPA persistence | React re-renders unmount injected UI | Panel disappears |
| F-009 | Cross-controller state sharing | Both controllers share localStorage keys | State corruption |
| F-022 | TS Migration V2 initialization race | `createUI()` runs before workspace API completes | Wrong workspace name on first load |
| F-023 | Macro-looping.ts monolith | Still ~4,165 lines; 8 segments pending split | AI may misidentify function boundaries |
| F-024 | E2E verification gap | Steps 10 of React unification never tested in Chrome | Potential hidden regressions |

### 2.3 Low-Risk Failures

| # | Module / Workflow | Why It Fails |
|---|-------------------|-------------|
| F-011 | Clipboard race condition | User copies during injection (~200ms window) |
| F-012 | Project dialog timing | Wait insufficient on slow connections |

### 2.4 Resolved Since Last Report ✅

| # | What Changed | Issue |
|---|-------------|-------|
| F-003 | Cookie namespace binding fixed | Issue 76 |
| F-004 | Auth token bridge fixed | Issues 80, 81 |
| F-006 | Globals injection fixed | Issue 83 |
| F-010 | Injection pipeline ≤500ms | Issue 87 |
| F-015 | IndexedDB cache with auto-invalidation | Issue 88 |
| F-016 | SDK namespace migration complete | Issue 79 |
| F-017 | Config seeding + DB overhaul | Issue 86 |

---

## 3. Corrective Actions (Prioritized)

| Priority | Action | Where to Change | Expected Reliability Gain | Status |
|----------|--------|----------------|--------------------------|--------|
| **P1** | TS Migration V2 Phase 01 — Init fix | `macro-looping.ts` startup sequence | +3% overall (eliminates F-022) | ⬜ Critical |
| **P2** | E2E verification React UI (Step 10) | Manual Chrome testing | +2% overall (eliminates F-024) | ⬜ High |
| **P3** | ESLint SonarJS full scan + triage | Root + chrome-extension | +1% (catches hidden code smells) | ⬜ Medium |
| **P4** | TS Migration V2 Phase 02 — Class arch | Macro controller modules | +2% (eliminates F-023 partially) | ⬜ High (blocked by P1) |
| **P5** | Macro-looping.ts splitting (8 segments) | `standalone-scripts/macro-controller/` | +1% (reduces F-023) | ⬜ Medium |
| **P6** | Prompt click E2E verification (52/53) | Live environment test | +0.5% | ⬜ Medium |
| **P7** | TS Migration V2 Phase 04 — Perf/logging | Macro controller | +1% | ⬜ High |

---

## 4. Readiness Decision

### Verdict: **READY — with caveats (same as v1, but improved)**

### What's Excellent ✅

1. **88 issue write-ups** with RCA — up from 44
2. **26 engineering standards** — battle-tested
3. **Comprehensive spec hierarchy** — 10 numbered folders, well-organized
4. **822+ unit tests** across 72 files + 46 automation engine tests
5. **16 completed workflow plans** — full history of major work
6. **Spec reorganization plan** ready (14 atomic tasks)
7. **IndexedDB injection cache** with auto-invalidation on deploy
8. **SDK namespace migration** complete (window.marco → riseup)
9. **ESLint SonarJS** integrated with tuned thresholds
10. **Version sync** at v1.60.0, validated via check-version-sync.mjs

### What Reduces AI Success ⚠️

1. **TS Migration V2 Phase 01 not started** — initialization race condition exists (F-022)
2. **macro-looping.ts still ~4,165 lines** — AI may struggle with function boundaries
3. **No E2E verification** of React unification (Step 10 never run)
4. **ComboSwitch DOM coupling** — hardcoded XPaths, fragile to Lovable UI changes
5. **No automated E2E test runner** — all verification is manual

### AI Failure Scenarios

| Scenario | Probability | Cause |
|----------|------------|-------|
| AI edits wrong folder (skipped/) | 3% | Folder policy well-documented; improved from 5% |
| AI breaks credit formula | 7% | Shared helpers reduce risk |
| AI breaks injection pipeline | 10% | Improved with IndexedDB cache; was 15% |
| AI introduces state race condition | 12% | Two controllers sharing localStorage |
| AI doesn't run build verification | 18% | No CI/CD; relies on manual build |
| AI misidentifies function in monolith | 15% | macro-looping.ts too large for context window |

---

## 5. Spec Quality Scorecard

| Aspect | Rating | Notes |
|--------|--------|-------|
| Architecture documentation | ⭐⭐⭐⭐⭐ | Master overview + 10 spec folders |
| Code conventions & standards | ⭐⭐⭐⭐⭐ | 26 standards + ESLint SonarJS |
| Error handling documentation | ⭐⭐⭐⭐⭐ | 88 issue write-ups with RCA |
| Root cause analysis docs | ⭐⭐⭐⭐⭐ | Prevention rules for every issue |
| UI sync patterns | ⭐⭐⭐⭐⭐ | All state changes verified |
| Testing guidance | ⭐⭐⭐⭐ | 822+ unit tests; still no E2E runner |
| Version clarity | ⭐⭐⭐⭐⭐ | Automated version sync check |
| AI onboarding guide | ⭐⭐⭐⭐⭐ | S-029 checklist in master overview |
| Integration test coverage | ⭐⭐⭐ | No automated E2E runner |
| Monolith risk | ⭐⭐⭐ | macro-looping.ts still needs splitting |
