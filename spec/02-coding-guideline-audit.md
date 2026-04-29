# Coding Guideline Audit (v1.4.0)

> Generated: 2026-04-26T19:10:03.203Z
> Policy: lenient counting (excludes imports, comments, blanks, pure-brace lines, signature).
> Allowed literals: `0`, `1`, `-1`, `""`, `true`, `false`.
> Excluded: `src/components/ui/*` (shadcn), `__tests__/*`, `*.test.ts(x)`, `*.d.ts`, `types.ts`, `*.generated.ts`, `.release/`, `skipped/`, `dist/`, `node_modules/`.

## 1. Summary

| Metric | Value |
|--------|-------|
| TotalFiles audited | **471** |
| TotalFunctions detected | **2290** |
| TotalViolations | **22531** |

### By RuleType

| RuleType | Count |
|----------|-------|
| FunctionLength (>8 LOC) | 1135 |
| FileLength (>100 LOC) | 243 |
| MagicString | 12216 |
| MagicNumber | 8928 |
| ComponentDecomposition | 9 |

### By Severity

| Severity | Count |
|----------|-------|
| Critical | 385 |
| High | 265 |
| Medium | 428 |
| Low | 21453 |

> **Headline finding:** the codebase substantially exceeds the v1.4.0 thresholds.
> The 100-LOC file rule is violated by **243** files (51.6% of audited files), and **1135** functions exceed the 8-LOC limit.
> The MagicString/MagicNumber counts dominate noise — most are diagnostic log messages and SQL fragments.
> Recommend treating Critical/High first, and accepting the ruleset as a target rather than a blocker.

## 2. Top 25 Files by Violation Count

| FilePath | FileLOC | FuncOver | MagicStr | MagicNum | Decomp | WorstSeverity | Total |
|----------|--------:|---------:|---------:|---------:|:------:|:-------------:|------:|
| `src/components/options/ProjectDetailView.tsx` | 1378 | 8 | 308 | 366 |  | **Critical** | 683 |
| `src/platform/preview-adapter.ts` | 503 | 0 | 158 | 409 |  | **Critical** | 568 |
| `src/components/options/UpdaterPanel.tsx` | 856 | 4 | 222 | 244 |  | **Critical** | 471 |
| `src/components/options/LibraryView.tsx` | 855 | 4 | 187 | 215 |  | **Critical** | 407 |
| `scripts/check-no-pnpm-dlx-less.mjs` | 879 | 10 | 305 | 77 |  | **Critical** | 393 |
| `src/background/handlers/injection-handler.ts` | 1260 | 24 | 191 | 148 |  | **Critical** | 364 |
| `src/components/options/StorageBrowserView.tsx` | 761 | 4 | 146 | 165 |  | **Critical** | 316 |
| `src/components/options/project-database/JsonSchemaTab.tsx` | 567 | 1 | 202 | 109 |  | **Critical** | 313 |
| `src/components/options/StorageRuntimePanels.tsx` | 840 | 7 | 156 | 145 |  | **Critical** | 309 |
| `src/components/popup/BootFailureBanner.tsx` | 474 | 5 | 142 | 148 |  | **Critical** | 296 |
| `src/components/options/UpdaterManagementView.tsx` | 660 | 1 | 124 | 157 |  | **Critical** | 283 |
| `src/components/options/ActivityLogTimeline.tsx` | 530 | 5 | 109 | 159 | ✅ | **Critical** | 275 |
| `src/components/options/ProjectUrlRulesEditor.tsx` | 420 | 4 | 87 | 160 |  | **Critical** | 252 |
| `src/components/options/PromptManagerPanel.tsx` | 545 | 4 | 119 | 120 |  | **Critical** | 244 |
| `src/components/options/ScriptsList.tsx` | 785 | 5 | 115 | 114 |  | **Critical** | 235 |
| `src/components/options/StepGroupLibraryPanel.tsx` | 722 | 7 | 105 | 118 |  | **Critical** | 231 |
| `src/components/options/ProjectFilesPanel.tsx` | 696 | 4 | 105 | 117 |  | **Critical** | 227 |
| `src/components/options/WasmStatusBanner.tsx` | 509 | 6 | 139 | 73 | ✅ | **Critical** | 220 |
| `src/components/options/ProjectsListView.tsx` | 485 | 9 | 87 | 121 |  | **Critical** | 218 |
| `src/components/options/DevGuideSection.tsx` | 286 | 3 | 132 | 76 | ✅ | **Critical** | 213 |
| `src/components/popup/PopupFooter.tsx` | 314 | 3 | 83 | 125 | ✅ | **Critical** | 213 |
| `src/components/options/MonacoCodeEditor.tsx` | 528 | 9 | 103 | 87 |  | **Critical** | 200 |
| `src/components/options/PromptChainPanel.tsx` | 320 | 3 | 89 | 103 |  | **Critical** | 196 |
| `src/components/recorder/DriftElementDiffView.tsx` | 263 | 6 | 66 | 116 |  | **Critical** | 189 |
| `scripts/check-readme-compliance.mjs` | 406 | 4 | 144 | 35 |  | **Critical** | 184 |

## 3. Top 50 Violations (sorted by Severity)

| FilePath | RuleType | Symbol | ActualValue | Limit | Severity | SuggestedFix |
|----------|----------|--------|-------------|-------|----------|--------------|
| `scripts/aggregate-prompts.mjs` | FunctionLength | main | 52 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/assert-standalone-dist.mjs` | FunctionLength | parseArgs | 70 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/assert-standalone-dist.mjs` | FunctionLength | main | 101 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/build-standalone.mjs` | FunctionLength | runParallelJob | 41 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/bump-version.mjs` | FunctionLength | getTargets | 52 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-bundle-schema-contract.mjs` | FunctionLength | main | 56 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-installer-contract.mjs` | FunctionLength | renderReport | 32 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-instruction-json-casing.mjs` | FileLength | check-instruction-json-casing.mjs | 409 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `scripts/check-instruction-json-casing.mjs` | FunctionLength | reportProject | 84 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-instruction-json-casing.mjs` | FunctionLength | buildJsonProjectEntry | 62 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-instruction-json-casing.mjs` | FunctionLength | main | 134 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FileLength | check-no-pnpm-dlx-less.mjs | 879 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | parseScanDirFlag | 32 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | toJsonHit | 34 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | matchTextForOffenders | 116 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | expandCommandCandidates | 37 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | runSelfTest | 108 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-no-pnpm-dlx-less.mjs` | FunctionLength | buildSuggestedFix | 37 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-readme-compliance.mjs` | FileLength | check-readme-compliance.mjs | 406 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `scripts/check-readme-compliance.mjs` | FunctionLength | renderMarkdownReport | 59 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/check-spec-links.mjs` | FunctionLength | main | 97 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/generate-installer-constants.mjs` | FunctionLength | generateInstallerConstants | 62 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/generate-seed-manifest.mjs` | FunctionLength | main | 33 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/generate-seed-manifest.mjs` | FunctionLength | buildProjectEntry | 99 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/generate-spec-consistency-report.mjs` | FunctionLength | compose | 63 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/refresh-spec-links-baseline.mjs` | FunctionLength | main | 38 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/repair-readme.mjs` | FileLength | repair-readme.mjs | 427 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `scripts/repair-readme.mjs` | FunctionLength | repairOneFile | 201 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/report-spec-links-ci.mjs` | FunctionLength | main | 128 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/report-spec-links-ci.mjs` | FunctionLength | buildSummaryMarkdown | 37 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/report-standalone-registry.mjs` | FunctionLength | fixHint | 38 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/report-standalone-registry.mjs` | FunctionLength | emitJsonReport | 50 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/report-standalone-registry.mjs` | FunctionLength | main | 77 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/rewrite-spec-links.mjs` | FunctionLength | main | 96 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `scripts/spec-folder-guard.mjs` | FunctionLength | main | 62 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/api-explorer-handler.ts` | FileLength | api-explorer-handler.ts | 561 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `src/background/auth-health-handler.ts` | FunctionLength | buildAuthHealthResponse | 104 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/boot.ts` | FunctionLength | boot | 79 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/builtin-script-guard.ts` | FunctionLength | ensureBuiltinScriptsExist | 66 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/builtin-script-guard.ts` | FunctionLength | seedMissingBuiltinsDirectly | 87 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/config-seeder.ts` | FunctionLength | seedConfigToDb | 38 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/context-menu-handler.ts` | FunctionLength | createStaticMenuItems | 56 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/csp-fallback.ts` | FunctionLength | executeInMainWorld | 58 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/csp-fallback.ts` | FunctionLength | attemptUserScriptFallback | 57 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/csp-fallback.ts` | FunctionLength | executeBlobInjection | 58 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/db-manager.ts` | FunctionLength | loadSqlJs | 68 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/dependency-resolver.ts` | FunctionLength | resolveInjectionOrder | 52 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/handlers/config-auth-handler.ts` | FileLength | config-auth-handler.ts | 486 | 100 | Critical | Split by Responsibility — extract helpers, sub-components, or domain modules. |
| `src/background/handlers/config-auth-handler.ts` | FunctionLength | handleGetToken | 66 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |
| `src/background/handlers/config-auth-handler.ts` | FunctionLength | handleRefreshToken | 40 | 8 | Critical | Extract — pull cohesive blocks into named helpers; compose at top. |

> Full violation list: `spec/02-coding-guideline-audit.json` (machine-readable sidecar).

## 4. RefactorPlan — Top 15 Modules

### 1. `src/components/options/ProjectDetailView.tsx` — Severity: **Critical**

- Split file (1378 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 8 oversized function(s) into named helpers.
- Centralize 308 user-facing string(s) into a Constants/i18n module.
- Replace 366 magic number(s) with NamedConstants (units in name).

### 2. `src/platform/preview-adapter.ts` — Severity: **Critical**

- Split file (503 LOC) by Responsibility — extract helpers and SubComponents.
- Centralize 158 user-facing string(s) into a Constants/i18n module.
- Replace 409 magic number(s) with NamedConstants (units in name).

### 3. `src/components/options/UpdaterPanel.tsx` — Severity: **Critical**

- Split file (856 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 4 oversized function(s) into named helpers.
- Centralize 222 user-facing string(s) into a Constants/i18n module.
- Replace 244 magic number(s) with NamedConstants (units in name).

### 4. `src/components/options/LibraryView.tsx` — Severity: **Critical**

- Split file (855 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 4 oversized function(s) into named helpers.
- Centralize 187 user-facing string(s) into a Constants/i18n module.
- Replace 215 magic number(s) with NamedConstants (units in name).

### 5. `scripts/check-no-pnpm-dlx-less.mjs` — Severity: **Critical**

- Split file (879 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 10 oversized function(s) into named helpers.
- Centralize 305 user-facing string(s) into a Constants/i18n module.
- Replace 77 magic number(s) with NamedConstants (units in name).

### 6. `src/background/handlers/injection-handler.ts` — Severity: **Critical**

- Split file (1260 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 24 oversized function(s) into named helpers.
- Centralize 191 user-facing string(s) into a Constants/i18n module.
- Replace 148 magic number(s) with NamedConstants (units in name).

### 7. `src/components/options/StorageBrowserView.tsx` — Severity: **Critical**

- Split file (761 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 4 oversized function(s) into named helpers.
- Centralize 146 user-facing string(s) into a Constants/i18n module.
- Replace 165 magic number(s) with NamedConstants (units in name).

### 8. `src/components/options/project-database/JsonSchemaTab.tsx` — Severity: **Critical**

- Split file (567 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 1 oversized function(s) into named helpers.
- Centralize 202 user-facing string(s) into a Constants/i18n module.
- Replace 109 magic number(s) with NamedConstants (units in name).

### 9. `src/components/options/StorageRuntimePanels.tsx` — Severity: **Critical**

- Split file (840 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 7 oversized function(s) into named helpers.
- Centralize 156 user-facing string(s) into a Constants/i18n module.
- Replace 145 magic number(s) with NamedConstants (units in name).

### 10. `src/components/popup/BootFailureBanner.tsx` — Severity: **Critical**

- Split file (474 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 5 oversized function(s) into named helpers.
- Centralize 142 user-facing string(s) into a Constants/i18n module.
- Replace 148 magic number(s) with NamedConstants (units in name).

### 11. `src/components/options/UpdaterManagementView.tsx` — Severity: **Critical**

- Split file (660 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 1 oversized function(s) into named helpers.
- Centralize 124 user-facing string(s) into a Constants/i18n module.
- Replace 157 magic number(s) with NamedConstants (units in name).

### 12. `src/components/options/ActivityLogTimeline.tsx` — Severity: **Critical**

- Split file (530 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 5 oversized function(s) into named helpers.
- Extract data-fetching into a CustomHook; isolate Presentation from State.
- Centralize 109 user-facing string(s) into a Constants/i18n module.
- Replace 159 magic number(s) with NamedConstants (units in name).

### 13. `src/components/options/ProjectUrlRulesEditor.tsx` — Severity: **Critical**

- Split file (420 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 4 oversized function(s) into named helpers.
- Centralize 87 user-facing string(s) into a Constants/i18n module.
- Replace 160 magic number(s) with NamedConstants (units in name).

### 14. `src/components/options/PromptManagerPanel.tsx` — Severity: **Critical**

- Split file (545 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 4 oversized function(s) into named helpers.
- Centralize 119 user-facing string(s) into a Constants/i18n module.
- Replace 120 magic number(s) with NamedConstants (units in name).

### 15. `src/components/options/ScriptsList.tsx` — Severity: **Critical**

- Split file (785 LOC) by Responsibility — extract helpers and SubComponents.
- Extract 5 oversized function(s) into named helpers.
- Centralize 115 user-facing string(s) into a Constants/i18n module.
- Replace 114 magic number(s) with NamedConstants (units in name).

## 5. AutomatedCheck Proposal

Add **`scripts/audit/coding-guideline.mjs`** wired into CI via `pnpm run audit:guideline`:

- Reuse the rule engine in `/tmp/audit.mjs` (relocate to `scripts/audit/`).
- Emit JSON to `spec/02-coding-guideline-audit.json` and Markdown to `spec/02-coding-guideline-audit.md`.
- Fail the build only on **Critical** violations initially; ratchet thresholds quarterly.
- Add an `// audit-allow-next-line <RuleType>` escape hatch for justified cases.

## 6. Open Questions Confirmed

| Question | Answer |
|----------|--------|
| File LOC exclusions | Imports, comments, blank lines, pure-brace lines |
| Function LOC exclusions | Signature, braces, blanks, comments |
| Magic literal whitelist | `0`, `1`, `-1`, `""`, `true`, `false` |
| Vendor exclusions | `src/components/ui/*`, generated, tests, type-only |
| Auto-fix | **No** — report-only this run |
| JSON sidecar | **Yes** — `spec/02-coding-guideline-audit.json` |

## 7. Next Steps

When you say `next`, I will proceed in this order:

1. **Phase A — Critical files**: refactor the top 5 files (>400 LOC) into SubComponents + CustomHooks.
2. **Phase B — Constants extraction**: introduce `src/shared/constants/` with grouped UI strings, log messages, and tuning numbers; sweep top 25 files.
3. **Phase C — Function extraction**: split the 265 High/Critical-severity oversized functions.
4. **Phase D — CI wiring**: move the audit script under `scripts/audit/` and add a soft-fail gate.
5. **Phase E — Component decomposition**: address the 9 components mixing State + DataFetching + heavy JSX.
