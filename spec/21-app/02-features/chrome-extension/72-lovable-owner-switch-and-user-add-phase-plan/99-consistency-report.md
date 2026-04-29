# 99 — Consistency Report: Owner Switch & User Add Phase Plan

**Generated:** 2026-04-24 (Asia/Kuala_Lumpur)
**Authority:** Spec Authoring Guide v3.2.0
**Folder:** `spec/21-app/02-features/chrome-extension/72-lovable-owner-switch-and-user-add-phase-plan/`

---

## Summary

| Metric | Value |
|--------|-------|
| Total phases planned | 20 |
| Phases complete | 20 / 20 ✅ |
| R12 invariant (single PUT path) | ✅ Verified |
| Open questions resolved | 11 / 11 ✅ |
| Unified version | **v2.230.0** (synced across 9 files incl. 3 new packages) |
| Health | **A — Clean (migration complete)** |

---

## Phase Inventory

| Phase | Title | Status |
|-------|-------|--------|
| P1–P7 | Common module + DB + CSV + Popup shells | ✅ Complete |
| P8 | Owner Switch login automation | ✅ Complete |
| P9 | Owner Switch promote step | ✅ Complete |
| P10 | Owner Switch sign-out + per-row state machine | ✅ Complete |
| P11–P14 | User Add common + DB + CSV + Popup | ✅ Complete |
| P15 | User Add Step A — POST membership | ✅ Complete |
| P16 | User Add Step B — Owner promotion via shared `promoteToOwner` | ✅ Complete |
| P17 | User Add per-row state machine + sign-out (task-level deviation) | ✅ Complete |
| P18 | Shared XPath/delay editor + Reset (`lovable-common/src/ui/`) | ✅ Complete |
| P19 | Shared logs viewer + copy-to-clipboard (`lovable-common/src/ui/`) | ✅ Complete |
| P20 | **This phase** — cross-spec audit + version bump | ✅ Complete |

---

## R12 Audit (Single PUT Path Invariant)

**Rule:** Exactly **one** site issues `PUT /memberships/{userId}`; both
Owner Switch and User Add must delegate through the shared
`LovableApiClient.promoteToOwner` method.

| Site | Path | Role |
|------|------|------|
| 1 | `lovable-common/src/api/lovable-api-client.ts:24` (`HTTP_PUT = "PUT"` constant) | **Single PUT method declaration** |
| 2 | `lovable-common/src/api/lovable-api-client.ts:64` (`this.send(HTTP_PUT, ...)`) | **Single PUT call site** |
| 3 | `lovable-common/src/api/lovable-api-client.ts:69` (`promoteToOwner` method) | **Single shared method** |
| 4 | `lovable-owner-switch/src/flow/run-promote.ts:55` | Caller — Owner Switch |
| 5 | `lovable-user-add/src/flow/run-step-b.ts:29` | Caller — User Add |

**Verification command:**
```bash
grep -rn "api\.promoteToOwner\|HTTP_PUT" standalone-scripts/ --include="*.ts"
```

**Result:** ✅ Exactly 2 invocation sites of `api.promoteToOwner(...)`,
both delegating through the single `HTTP_PUT` at line 64. **Invariant intact.**

---

## Version Sync Audit

**Baseline:** v2.229.0 (pre-P20)
**Bumped to:** **v2.230.0** (minor bump per Q9 + user preference "Code changes
must bump at least minor version")

**Files synced (9 total):**

| # | File | Status |
|---|------|--------|
| 1 | `manifest.json` | ✅ 2.230.0 |
| 2 | `src/shared/constants.ts` (`EXTENSION_VERSION`) | ✅ 2.230.0 |
| 3 | `standalone-scripts/macro-controller/src/shared-state.ts` (`VERSION`) | ✅ 2.230.0 |
| 4 | `standalone-scripts/macro-controller/src/instruction.ts` | ✅ 2.230.0 |
| 5 | `standalone-scripts/marco-sdk/src/instruction.ts` | ✅ 2.230.0 |
| 6 | `standalone-scripts/xpath/src/instruction.ts` | ✅ 2.230.0 |
| 7 | `standalone-scripts/lovable-common/src/instruction.ts` | ✅ **2.230.0** (was 1.0.0 — P20 lift) |
| 8 | `standalone-scripts/lovable-owner-switch/src/instruction.ts` | ✅ **2.230.0** (was 1.0.0 — P20 lift) |
| 9 | `standalone-scripts/lovable-user-add/src/instruction.ts` | ✅ **2.230.0** (was 1.0.0 — P20 lift) |

**Drift fix:** P20 also registered the three new packages in
`scripts/bump-version.mjs` and `scripts/check-version-sync.mjs` so future
bumps will not skip them.

**Verification:** `node scripts/check-version-sync.mjs` →
`✅ All versions in sync: 2.230.0`.

---

## Coding Rules Audit

| Rule | Verification | Result |
|------|--------------|--------|
| File ≤ 100 lines | `find … -name "*.ts" \| wc -l` per file | ✅ All files within cap |
| `tsc --strict` clean | Per-package compilation | ✅ All 3 new packages clean |
| ESLint zero warnings | `npx eslint standalone-scripts/lovable-{common,owner-switch,user-add}/src` | ✅ Zero warnings |
| Manifest preflight | `node scripts/check-manifest-version.mjs` | ✅ 2.230.0 + CSP + permissions |
| No bare `unknown` | `mem://standards/unknown-usage-policy` | ✅ Per-file audit clean |
| No-retry policy | `mem://constraints/no-retry-policy` | ✅ All flows use sequential fail-fast |
| Defensive property access (`?.`/`??`) | `mem://standards/formatting-and-logic` | ✅ Verified in P19 readers |

---

## Open-Questions Resolution

All 11 questions resolved (Q1–Q10 from spec; Q11 added at P20):

| Q# | Topic | Resolution |
|----|-------|------------|
| Q1–Q8 | Various per-phase defaults | ✅ Defaults applied + documented per phase |
| Q9 | Version bump scope | ✅ **Minor bump** → v2.229.0 → v2.230.0 |
| Q10 | Logs storage | ✅ **(a) SQLite-tagged** rows |
| Q11 | P17 sign-out deviation (task-level vs per-row) | ✅ **Confirmed task-level** for User Add (operator fixed); per-row remains canonical for Owner Switch |

See `03-open-questions.md` for full rationale on each.

---

## P20 Deliverables

1. **R12 grep audit** — verified single PUT path (✅ 2 invocation sites)
2. **Unified version bump** to v2.230.0 across 9 files
3. **Drift-fix** — registered 3 new packages in bump + sync scripts
4. **Sign-out deviation locked** — Q11 appended to open-questions doc
5. **This consistency report** created
6. **`02-progress-log.md`** updated with P20 entry
7. **`.lovable/plan.md`** updated with final P20 status

---

## Sign-Off

✅ **20/20 phases complete.** R12 invariant verified, all coding rules pass,
unified version bumped, all open questions resolved. Both
`lovable-owner-switch` and `lovable-user-add` are production-ready and share
exactly one PUT call site through `lovable-common/LovableApiClient.promoteToOwner`.

The migration is fully retired.
