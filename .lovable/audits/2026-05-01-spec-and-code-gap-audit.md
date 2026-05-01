# 2026-05-01 — Spec & Code Gap Audit (v2.230.0)

**Scope.** Snapshot audit of the repository at version `2.230.0`, run after
the README version refresh. Focus areas: (1) version + branding consistency,
(2) error-handling compliance, (3) spec health, (4) workstream backlog
hygiene. No code changes were made as part of this audit — findings only,
with prioritized remediation suggestions.

**Audit run.** `2026-05-01T08:11Z` · scripts executed:
`scripts/check-version-sync.mjs`, `scripts/audit-error-swallow.mjs`,
`scripts/check-spec-links.mjs`, `scripts/audit-checklist.mjs`.

---

## 1 · Headline numbers

| Signal | Result | Status |
|---|---|---|
| Unified version (manifest / constants / SDK) | `2.230.0` everywhere | ✅ in sync |
| Spec relative-link integrity | 829 files / 1670 relative links | ✅ all resolve |
| Error-swallow audit | 94 total (4 P0 · 34 P1 · 56 P2) | 🔴 P0 must close |
| Spec consistency report (`spec/99-consistency-report.md`) | 98/100 (A+) | 🟡 6 stub folders |
| Open backlog lines surfaced by checklist | 37 | 🟡 within plan.md |

---

## 2 · README — what was updated, what remains

**Updated this pass** (`readme.md`, version-only edits):

- Pinned-version banner: `v2.158.0` → **`v2.230.0`** (4 occurrences in install
  blocks, "Quick Start" headers, and the "Pinned version:" line).
- Flag-table examples: `v2.224.0` → `v2.230.0`, `v2.116.1` → `v2.230.0`.
- Override example: `v2.150.0` → `v2.220.0` (kept lower than current to make
  the "override to an older release" example realistic).
- Historical "since v2.226.0" / "since v2.227.0" notes left untouched —
  they describe when a feature first shipped and must not float.

**Still open in README** (deferred — not part of this pass):

| # | Finding | Where | Suggestion |
|---|---|---|---|
| R-1 | "Macro Controller: `v7.41`" line is hand-maintained and not validated by `check-version-sync.mjs`. | `readme.md:46` | Wire MC version into `scripts/check-version-sync.mjs` so the README and `standalone-scripts/macro-controller/changelog.md` cannot drift. |
| R-2 | `docs/extension-architecture.md §11` is referenced for companion-repo layout — verify the §11 anchor still exists. | `readme.md:280` | One-shot link audit (out of scope of `check-spec-links.mjs`, which scans `spec/` only). |
| R-3 | Hero image `docs/assets/marco-extension-hero.png` should be regenerated from a current options-page screenshot at v2.230.0 to match the badges. | `readme.md:12` | Capture fresh 820-px-wide screenshot. |

No README structural violations against `mem://standards/root-readme-conventions`
were detected (centered hero, 5 badge groups, single H1, Author + Company
sections all present).

---

## 3 · Error-handling compliance — `audit-error-swallow.mjs`

Generator: `node scripts/audit-error-swallow.mjs` →
`public/error-swallow-audit.json` (`94` items: **4 P0**, 34 P1, 56 P2).

### 3.1 P0 — true silent swallows (must close)

These 4 sites have empty `catch {}` blocks with no `Logger.error()` call,
violating `mem://standards/error-logging-via-namespace-logger.md` and the
"every failure carries Reason + ReasonDetail" rule.

| # | File | Line | Suggested fix |
|---|---|---|---|
| E-1 | `src/background/handlers/injection-wrapper.ts` | 48 | Wrap with `try/catch (err) { logError('injection-wrapper', 'wrapper failed', err); }` — this path is the user-visible injection result, so a swallow hides every failure that surfaces in Popup → InjectionResults. |
| E-2 | `src/background/handlers/logging-handler.ts` | 281 | Use `NamespaceLogger.error('LoggingHandler', 'persist failed', err)`. Persistence failures here corrupt the SQLite session log silently. |
| E-3 | `src/background/script-resolver.ts` | 75 | Add a CODE-RED entry per `mem://constraints/file-path-error-logging-code-red.md` — log the resolved path, the missing item, and the reason. Resolver failures cascade into 4 downstream P1 sites. |
| E-4 | `src/background/service-worker-main.ts` | 39 | Boot-time swallow — should emit a `BootFailureBanner`-eligible error per `mem://architecture/extension-error-management`. |

### 3.2 P1 — namespace-logger violations (`console.error` instead of `Logger.error`)

34 sites across `src/background/` (handlers, db-persistence, bg-logger,
prompt-chain, sdk-selftest, settings, storage, updater, …). Each is a
"visible in DevTools, invisible in SQLite + Diagnostic Dump" risk.

**Pattern fix.** Single-PR sweep: replace `console.error(...)` and bare
`.catch(() => {})` in `src/background/**/*.ts` with the established helper
from `src/background/bg-logger.ts`. Acceptance: `audit-error-swallow.mjs`
reports `P1: 0` and the existing test
`scripts/__tests__/check-no-swallowed-errors.test.mjs` passes.

### 3.3 P2 — 56 lower-severity items

Mostly `catch (e) { /* best-effort */ }` in DOM-patching CSP fallbacks and
boot-time storage probes. These are documented in
`.lovable/audits/2026-04-27-error-swallowing-audit.md` and are tracked as
acceptable best-effort branches. **Recommendation:** add a short comment
sentinel `// best-effort: <reason>` on each so the audit can downgrade them
automatically on the next pass.

---

## 4 · Spec audit

### 4.1 Compliance — green

- `scripts/check-spec-links.mjs`: **0 broken relative links** across 829
  files / 1670 relative links / 1813 total links. No remediation needed.
- `spec/99-consistency-report.md`: every top-level folder has both
  `00-overview.md` and `99-consistency-report.md`. Numeric hierarchy
  (01–22, 23+, 99-archive, validation-reports) intact.

### 4.2 Stub folders — 6 outstanding (yellow)

Per `spec/99-consistency-report.md` Phase-8/9/10 closure notes, these stubs
remain on the deduction list (-2 → 98/100):

| Folder | Status | Suggested next step |
|---|---|---|
| `spec/08-docs-viewer-ui/` | Stub | Promote the in-extension docs-viewer notes (popup `HelpOverlay.tsx` + Options "About" section) into the spec body. |
| `spec/09-code-block-system/` | Stub | Capture the prompt + code-block normalization rules already implemented in `standalone-scripts/macro-controller/src/prompt-loader.ts`. |
| `spec/10-research/` | Stub | Move `.lovable/memory/performance/idle-loop-audit-2026-04-25.md` and the 2026-04-27 error-swallow audit out of `.lovable/` and into `spec/10-research/` as the canonical research log. |
| `spec/12-cicd-pipeline-workflows/` | Stub | Consolidate `pipeline/01..07-*.md` (already authored) into `spec/12-cicd-pipeline-workflows/`. The content exists — only the move + cross-link is missing. |
| `spec/14-update/` | Stub | The installer behavior is fully documented at `spec/14-update/01-generic-installer-behavior.md`; needs `02-…` chapters for checksum verification (since v2.227.0) and main-branch fallback (since v2.226.0). |
| `spec/17-consolidated-guidelines/` | Stub | Aggregate the constraints in `mem://constraints/*` and `mem://standards/*` into a single readable index. |

Closing any **two** of these moves the consistency score to 100/100.

### 4.3 Spec ↔ code drift candidates (sampled, not exhaustive)

| # | Spec | Code | Drift |
|---|---|---|---|
| S-1 | `spec/14-update/01-generic-installer-behavior.md` references `v2.227.0` checksum verification & `v2.226.0` main-branch fallback. | `scripts/install.ps1`, `scripts/install.sh` | Confirmed implemented; spec needs explicit chapter references (see 4.2 → `spec/14-update/`). |
| S-2 | `spec/22-app-issues/111-open-tabs-workspace-mapping.md` — implementation landed; awaiting "next" memory rule. | `src/background/handlers/open-tabs-handler.ts`, `standalone-scripts/macro-controller/src/ui/section-open-tabs.ts` | Per `plan.md:21-29`, write `mem://features/macro-controller/open-tabs-workspace-mapping`. |
| S-3 | `spec/30-import-export/03-test-plan.md` exists but no E2E test file matches the pattern. | `tests/e2e/` | Audit "Project Import/Export E2E Audit" already in `plan.md:77`. |

---

## 5 · Workstream backlog (from `audit-checklist.mjs`)

37 open lines across `plan.md` and the latest audit. Highest-priority
clusters (in order):

1. **PERF-10 / PERF-11** — `src/hooks/use-token-watchdog.ts` and
   `src/hooks/use-network-data.ts` run unguarded `setInterval`s while the
   Options tab is hidden. Add `document.visibilityState === 'hidden'` gate.
2. **LOG-1 → LOG-6 checklist** — failure-log schema work (`plan.md:268-275`)
   is gated on running `node scripts/check-failure-log-schema.mjs` and
   `bunx vitest run src/background/recorder/__tests__/failure-report-fixtures.test.ts`.
3. **Banner-hider RCA follow-up (0.13)** — 7 new memory standards
   (`pre-write-check`, `no-…`) drafted; not yet promoted to `mem://`.
4. **Cross-Project Sync — Phase 3** in progress (`plan.md:326`).

---

## 6 · Recommended remediation order

Ranked by signal-to-effort:

1. **Close 4 P0 swallows** (E-1 … E-4 above) — small surgical edits, removes
   all true silent swallows from the background service worker.
2. **Sweep 34 P1 console-error sites** in one PR — same pattern, same
   helper, deterministic.
3. **Promote two stub spec folders** (`spec/12-cicd-pipeline-workflows/`
   and `spec/14-update/` are easiest — content already exists) → 100/100.
4. **Add visibility-pause guards** to the two unguarded intervals (PERF-10,
   PERF-11) → recovers SW idle wake-ups.
5. **Wire Macro-Controller version into `check-version-sync.mjs`** so
   README line 46 cannot drift.

---

## 7 · How to reproduce this audit

```bash
node scripts/check-version-sync.mjs          # ✅ All versions in sync: 2.230.0
node scripts/check-spec-links.mjs            # ✅ 1670/1670 relative links resolve
node scripts/audit-error-swallow.mjs         # writes public/error-swallow-audit.json
node scripts/audit-checklist.mjs             # surfaces open lines from plan.md + audits
```

Outputs land in `public/error-swallow-audit.json` and the console — no
network calls, no mutations.

---

## 8 · Files touched by this audit pass

| File | Change |
|---|---|
| `readme.md` | Version refs `v2.158.0` / `v2.224.0` / `v2.116.1` → `v2.230.0`; example `v2.150.0` → `v2.220.0`. |
| `.lovable/audits/2026-05-01-spec-and-code-gap-audit.md` | **New** — this report. |

No other source files were modified. All remediations in §6 are proposals;
none have been applied.
