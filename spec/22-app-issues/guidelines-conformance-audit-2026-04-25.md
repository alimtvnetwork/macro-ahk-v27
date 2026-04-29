# Guidelines Conformance Audit — 2026-04-25

> **Scope**: How far the codebase has pivoted away from the binding rules in `spec/02-coding-guidelines`, `spec/03-error-manage`, `spec/04-database-conventions`, `spec/05-split-db-architecture`, and `spec/06-seedable-config-architecture`.
>
> **Mode**: Audit only. No code changed. Phased remediation plan included.
>
> **Method**: Static scan across `src/**` and `standalone-scripts/**` (425 TS files in `src/`, ~46K LOC in standalone). Counts come from `rg`/`find`; SQL extracted from the live `CREATE TABLE` statements; nothing inferred without a citation.

---

## 0. Executive Summary

| # | Area | Spec Anchor | Status | Severity | Files Affected (rough) |
|---|------|-------------|--------|----------|------------------------|
| A | Database PK convention (`{TableName}Id`) | `04-database-conventions/00-overview.md` §Golden Rules #3 | ❌ **Broken** — every table uses bare `Id` | **CRITICAL** | 38 `CREATE TABLE` sites |
| B | Database table names — singular | `04-database-conventions/00-overview.md` §Golden Rules #1 | ❌ **Broken** — 14 plural tables | High | 14 tables |
| C | TEXT primary keys (UUID-style) | `04-database-conventions/01-naming-conventions.md` §Quick Reference + `02-schema-design.md` | ❌ Two standalone projects use `Id TEXT PRIMARY KEY` | High | 4 tables |
| D | Boolean prefix `Is`/`Has` | `04-database-conventions/01-naming-conventions.md` §Rule 1 | ⚠️ One bare `Enabled` column; otherwise good | Low | 1 column |
| E | TS string-union types (must be enums with `Type` suffix) | `02-coding-guidelines/02-typescript/08-typescript-standards-reference.md` §3.3 | ❌ **30+ violations** in `src/` alone | **CRITICAL** | 30+ files |
| F | `enum` naming — `Type` suffix mandatory | same §3.3 | ❌ ~20 enums lack `Type` suffix (`MembershipRoleApiCode`, `BannerState`, …) | High | 20 enums |
| G | `any` / `unknown` / `Record<string, unknown>` discipline | same §1, §2 | ❌ 64 `any`, 341 unsigned `unknown`, 412 `Record<string, unknown>` | High | broad |
| H | Raw negation `if (!fn(…))` | `02-coding-guidelines/01-cross-language/12-no-negatives.md` | ❌ 68 occurrences | Medium | broad |
| I | Nested `if` (zero-tolerance) | `02-typescript` §6, cross-lang Rule 2 | ❌ ~3 200 heuristic hits | High | broad |
| J | File size < 300 lines | cross-lang Rule (master coding guidelines) | ❌ 25 business-logic files exceed 300; top is 2 203 lines | High | 25 |
| K | Function size ≤ 15 lines | `02-typescript` §5 | ⚠️ Not measured here; correlates with file-size hotspots | Medium | TBD |
| L | Error management — `apperror`/`Logger.error()` everywhere | `03-error-manage/00-overview.md` §3, `mem://standards/error-logging-via-namespace-logger` | ❌ 142 `throw new Error(`, 126 `console.error/warn` | **CRITICAL** | broad |
| M | Universal Response Envelope (`Status/Attributes/Results`) | `03-error-manage/00-overview.md` §2 | n/a — Chrome-extension messaging is in-process; envelope rule applies to backend HTTP only. **Document the exemption.** | Doc-only | — |
| N | Split-DB Architecture (root.db + per-project DBs) | `05-split-db-architecture/00-overview.md`, `01-fundamentals.md` | ⚠️ Partial: we have `logs.db` + `errors.db` + per-project KV store, but no `Root.Projects` registry table and no `DbManager.GetOrCreateDb(slug, type, entityId)` helper | High | architectural |
| O | Seedable Config (`config.seed.json` + `ConfigMeta.SeedVersion` + CHANGELOG flow) | `06-seedable-config-architecture/00-overview.md`, `01-fundamentals.md` | ⚠️ Partial: `ProjectConfigMeta(SourceHash)` exists; missing `SeedVersion` SemVer gate, missing `Changelog` field, no auto CHANGELOG.md updates | Medium | `src/background/config-seeder.ts` |
| P | JSON keys — PascalCase across the wire | `02-coding-guidelines/01-cross-language/11-key-naming-pascalcase.md` | ⚠️ DB rows are PascalCase (good); message-passing payload keys (`shared/messages.ts`) are camelCase by React/TS convention. **Decide & document the exemption** for in-process extension messaging vs. external API. | Medium | `src/shared/messages.ts` (588 lines) + every handler |
| Q | View prefix `Vw…` | `04-database-conventions/01-naming-conventions.md` §Summary | ❌ Single view `UpdaterDetails` lacks `Vw` prefix | Low | 1 view |
| R | Index naming `Idx{Table}_{Column}` | same | ⚠️ Mixed: most use `Idx…` without underscore separator (`IdxUtcUpdater`, `IdxStatsRecordedAt`) | Low | ~20 indexes |
| S | `Description` column on entity/reference tables | `04-database-conventions/01-naming-conventions.md` §Rule 10 | ❌ Most lookup-style tables (`PromptsCategory`, `UpdaterCategory`, `ProjectGroup`) have no `Description` | Medium | 6+ tables |

> Items **A, E, L** are CODE-RED per `spec/02-coding-guidelines/00-overview.md` §"MANDATORY". Everything else is graded by spec acceptance criteria.

---

## 1. Findings — Detailed

### A. Primary keys are bare `Id`, not `{TableName}Id`

**Spec**: `04-database-conventions/00-overview.md` §Golden Rules #3 — *"PK = `{TableName}Id` — e.g., `UserId`, `ProjectId` — always `INTEGER PRIMARY KEY AUTOINCREMENT`, never UUID"*.

**Evidence** (every PK below uses `Id`, not the spec-mandated `{TableName}Id`):

| File:line | Table | Current PK | Spec PK |
|-----------|-------|-----------|---------|
| `src/background/db-schemas.ts:18` | `Sessions` | `Id` | `SessionsId` (or singular `SessionId`) |
| `src/background/db-schemas.ts:28` | `Logs` | `Id` | `LogsId` / `LogId` |
| `src/background/db-schemas.ts:61` | `Errors` | `Id` | `ErrorsId` / `ErrorId` |
| `src/background/db-schemas.ts:112` | `Prompts` | `Id` | `PromptId` |
| `src/background/db-schemas.ts:133` | `PromptsCategory` | `Id` | `PromptsCategoryId` |
| `src/background/db-schemas.ts:146` | `PromptsToCategory` | `Id` | `PromptsToCategoryId` |
| `src/background/db-schemas.ts:205` | `ProjectFiles` | `Id` | `ProjectFileId` |
| `src/background/db-schemas.ts:234` | `GroupedKv` | `Id` | `GroupedKvId` |
| `src/background/db-schemas.ts:251` | `Scripts` | `Id` | `ScriptId` |
| `src/background/db-schemas.ts:273` | `UpdaterInfo` | `Id` | `UpdaterInfoId` |
| `src/background/db-schemas.ts:309` | `UpdateSettings` | `Id` | `UpdateSettingsId` |
| `src/background/db-schemas.ts:325` | `UpdaterCategory` | `Id` | `UpdaterCategoryId` |
| `src/background/db-schemas.ts:338` | `UpdaterToCategory` | `Id` | `UpdaterToCategoryId` |
| `src/background/db-schemas.ts:355` | `UpdaterEndpoints` | `Id` | `UpdaterEndpointId` |
| `src/background/db-schemas.ts:373` | `UpdaterSteps` | `Id` | `UpdaterStepId` |
| `src/background/db-schemas.ts:439` | `DynamicLoadLog` | `Id` | `DynamicLoadLogId` |
| `src/background/db-schemas.ts:459` | `SharedAsset` | `Id` | `SharedAssetId` |
| `src/background/db-schemas.ts:479` | `AssetLink` | `Id` | `AssetLinkId` |
| `src/background/db-schemas.ts:498` | `ProjectGroup` | `Id` | `ProjectGroupId` |
| `src/background/db-schemas.ts:511` | `ProjectGroupMember` | `Id` | `ProjectGroupMemberId` |
| `src/background/db-schemas.ts:529` | `AssetVersion` | `Id` | `AssetVersionId` |
| `src/lib/sqlite-bundle.ts:47,65,82,94,102` | `Projects`, `Scripts`, `Configs`, `Meta`, `Prompts` | `Id` | per-table |
| `src/background/handlers/automation-chain-handler.ts:26` | `AutomationChains` | `Id` | per-table |
| `src/background/config-seeder.ts:33,44` | `ProjectConfig`, `ProjectConfigMeta` | `Id` | per-table |
| `src/background/project-db-manager.ts:36, 166` | `ProjectSchema` + dynamic | `Id` | per-table |
| `src/types/default-databases.ts:183, 195` | `KeyValueStore`, `ConfigStore` | `Id` | per-table |

**Counter-references in our own code that reveal the drift**:

- `src/background/db-schemas.ts:194` — `PRIMARY KEY (ProjectId, Key)` — already uses `ProjectId` (PascalCase + table prefix) for the FK. The PKs are inconsistent with the FKs.
- `src/background/db-schemas.ts:355–373` — `UpdaterId`, `CategoryId` are perfect FK names (matches `{TableName}Id`), so the parents *should* be `UpdaterInfoId` and `UpdaterCategoryId`, not bare `Id`.

**Why we pivoted**: early-iteration shorthand. The bundle docblock at `src/lib/sqlite-bundle.ts:10` even codifies the pivot: *"All primary key `Id` columns use INTEGER PRIMARY KEY AUTOINCREMENT"* — this comment IS the deviation.

**Impact**: every JOIN reads `ON Parent.Id = Child.ParentId` instead of `ON Parent.ParentId = Child.ParentId`. Spec rule 4 ("FK = exact PK name") is mechanically impossible to apply with bare `Id`.

---

### B. Plural table names

**Spec**: Singular only — `User`, `Project`, `Transaction`.

**Evidence**:

| File:line | Plural Table | Spec Singular |
|-----------|--------------|---------------|
| `src/background/db-schemas.ts:17` | `Sessions` | `Session` |
| `src/background/db-schemas.ts:27` | `Logs` | `Log` |
| `src/background/db-schemas.ts:60` | `Errors` | `Error` (rename to avoid keyword: `ErrorRecord`) |
| `src/background/db-schemas.ts:94` | `ErrorCodes` | `ErrorCode` |
| `src/background/db-schemas.ts:111` | `Prompts` | `Prompt` |
| `src/background/db-schemas.ts:204` | `ProjectFiles` | `ProjectFile` |
| `src/background/db-schemas.ts:250` | `Scripts` | `Script` |
| `src/background/db-schemas.ts:308` | `UpdateSettings` | `UpdateSetting` |
| `src/background/db-schemas.ts:354` | `UpdaterEndpoints` | `UpdaterEndpoint` |
| `src/background/db-schemas.ts:372` | `UpdaterSteps` | `UpdaterStep` |
| `src/background/handlers/automation-chain-handler.ts:25` | `AutomationChains` | `AutomationChain` |
| `src/background/schema-meta-engine.ts:20,29,47` | `MetaTables`, `MetaColumns`, `MetaRelations` | `MetaTable`, `MetaColumn`, `MetaRelation` |
| `src/lib/sqlite-bundle.ts:46,64,81,101` | `Projects`, `Scripts`, `Configs`, `Prompts` | singular |

`Settings` (`db-schemas.ts:221`) is debatable — it's a key/value singleton store. Singular `Setting` per spec.

---

### C. UUID/TEXT primary keys

**Spec**: *"never UUID unless required"*; PK type = `INTEGER`.

**Evidence** (only in standalone scripts):

- `standalone-scripts/lovable-owner-switch/src/migrations/ddl.ts:31, 44` — `OwnerSwitchTask.Id TEXT PRIMARY KEY`, `OwnerSwitchRow.Id TEXT PRIMARY KEY`.
- `standalone-scripts/lovable-user-add/src/migrations/ddl.ts:36, 50` — `UserAddTask.Id TEXT PRIMARY KEY`, `UserAddRow.Id TEXT PRIMARY KEY`.

These four tables use UUIDs. Not justified in code comments — appears to be defensive against parallel writes from popup/content scripts. Needs a written justification or migration to integer PK + an indexed `ExternalId TEXT` column.

---

### D. Boolean prefix `Is`/`Has`

**Spec**: every boolean must start with `Is`/`Has`, positive-only.

**Evidence**: `src/background/handlers/automation-chain-handler.ts:33` — `Enabled INTEGER NOT NULL DEFAULT 1` — should be `IsEnabled`.

All other boolean columns conform (`IsActive`, `HasInstructions`, `IsRedirectable`, `HasUserConfirmBeforeUpdate`, …). Approved-inverse names (`IsDisabled`, `IsLocked`, …) are not used incorrectly.

---

### E. String-union types instead of enums (CODE-RED)

**Spec**: `02-typescript/08-typescript-standards-reference.md` §3.3 — *"Never use string union types — always use proper `enum` with PascalCase values and a `Type` suffix on the enum name."*

**Evidence** (30 in `src/`, sample):

| File:line | Current | Spec |
|-----------|---------|------|
| `src/lib/automation-types.ts:87` | `type TriggerType = "manual" \| "on_page_load" \| ...` | `enum TriggerType { Manual = "Manual", OnPageLoad = "OnPageLoad", ... }` (note: `_` in `on_page_load` is also a magic-string violation — values must be PascalCase) |
| `src/lib/automation-types.ts:123,125` | `StepStatus`, `ChainRunnerStatus` | `enum StepStatusType { … }` |
| `src/shared/types.ts:9,12,15,18,21` | `HealthState`, `MatchMode`, `ExecutionWorld`, `InjectionMethod`, `RunAt` | enums with `Type` suffix; PascalCase values |
| `src/hooks/use-prompt-chains.ts:29`, `use-log-viewer.ts:19`, `use-activity-timeline.ts:23,24`, `use-network-data.ts`*, `use-editor-theme.ts:7`, `use-library-link-map.ts:14` | string unions | enums |
| `src/background/handlers/dynamic-require-handler.ts:39`, `library-handler.ts:61,62`, `script-resolver.ts:23`, `db-manager.ts:31`, `project-db-manager.ts:21` | string unions | enums |
| `src/components/popup/BootFailureBanner.tsx:422`, `SdkSelfTestPanel.tsx:23`, multiple `options/*` panels | string unions | enums |
| `src/lib/sqlite-bundle-contract.ts:95` | `BundleMode = "full" \| "prompts-only"` | `enum BundleModeType { Full = "Full", PromptsOnly = "PromptsOnly" }` |

Several existing enums also miss the `Type` suffix:

- `MembershipRoleApiCode`, `BannerState`, `XPathKeyCode`, `LogViewerSeverityCode`, `OwnerSwitchTaskStatusCode`, `NavDirection`, `SignOutStepCode`, `PromoteStepCode`, `AllowedHomeUrl`, `LogPhase`, `LogSeverity`, `LoginStepCode`, `UserAddTaskStatusCode`, `UserAddMembershipRoleCode`, `RowOutcomeCode`, `StepBStepCode`, `StepAStepCode`, `OwnerSwitchCsvColumn`, `UserAddRowOutcomeCode`, `UserAddLogPhase` — ~20.

> The `Code` suffix is a project-internal convention but does not satisfy the `Type` suffix spec. Rename to `…Type` or document the `Code` exemption in `spec/02-coding-guidelines/02-typescript/`.

---

### F. `any` / `unknown` / `Record<string, unknown>` discipline

**Spec**: §1, §2 — `any` is **PROHIBITED everywhere**; `unknown` only at parse boundaries; `Record<string, unknown>` forbidden in API signatures.

**Evidence**:

- `:\s*any\b|<any>|as\s+any` — **64 occurrences** in `src/` + `standalone-scripts/`.
- `: unknown` in signatures — **341 occurrences** (some legitimate at parse boundaries; spec says these must be narrowed *immediately*).
- `Record<string, unknown>` — **412 occurrences**; this is the highest leak source.

The `mem://standards/unknown-usage-policy` memory exists but is not enforced by ESLint at the rule level (`@typescript-eslint/no-explicit-any` is not configured to `error` per spec §7).

---

### G. Raw negation `if (!fn(...))`

**Spec**: `01-cross-language/12-no-negatives.md` — wrap every negative call in a positively-named guard.

**Evidence**: 68 hits matching `if\s*\(\s*!\w+\(`. Examples are widespread (handlers, hooks, content-scripts).

---

### H. Nested `if` blocks

**Spec**: zero-tolerance.

**Evidence**: heuristic regex (`if(...) { … if(...)` within 200 chars) returns ~3 200 hits across `src/` + `standalone-scripts/`. The heuristic over-counts (it triggers on `if/else if` ladders), but spot checks confirm hundreds of true nested-if violations especially in:

- `src/background/handlers/injection-handler.ts` (1 998 lines — top offender)
- `src/background/handlers/library-handler.ts` (742)
- `src/background/handlers/config-auth-handler.ts` (761)
- `src/components/options/ProjectDetailView.tsx` (1 683)
- `src/components/options/UpdaterPanel.tsx` (1 013)

---

### I. File size < 300 lines

**Spec**: `02-typescript` §5 + master guidelines.

**Top business-logic offenders** (excluding generated and shadcn UI primitives):

| Lines | File |
|-------|------|
| 2 203 | `src/lib/developer-guide-data.generated.ts` (generated — exempt, but verify exemption is documented) |
| 1 998 | `src/background/handlers/injection-handler.ts` |
| 1 683 | `src/components/options/ProjectDetailView.tsx` |
| 1 032 | `src/components/options/LibraryView.tsx` |
| 1 023 | `src/components/options/StorageRuntimePanels.tsx` |
| 1 013 | `src/components/options/UpdaterPanel.tsx` |
| 982 | `src/components/options/ScriptsList.tsx` |
| 933 | `src/components/options/StorageBrowserView.tsx` |
| 870 | `src/components/options/ProjectFilesPanel.tsx` |
| 802 | `standalone-scripts/macro-controller/src/ui/error-overlay.ts` |
| 782 | `src/lib/sqlite-bundle.ts` |
| 781 | `src/components/options/UpdaterManagementView.tsx` |
| 761 | `src/background/handlers/config-auth-handler.ts` |
| 755 | `standalone-scripts/macro-controller/src/ws-list-renderer.ts` |
| 742 | `src/background/handlers/library-handler.ts` |
| 735 | `src/platform/preview-adapter.ts` |
| 718 | `src/components/options/WasmStatusBanner.tsx` |
| 716 | `src/components/options/project-database/JsonSchemaTab.tsx` |
| 707 | `standalone-scripts/macro-controller/src/ui/bulk-rename.ts` |
| 703 | `src/components/options/MonacoCodeEditor.tsx` |
| 702 | `standalone-scripts/macro-controller/src/startup.ts` |
| 697 | `standalone-scripts/macro-controller/src/ui/prompt-dropdown.ts` |
| 678 | `src/components/options/PromptManagerPanel.tsx` |
| … | (25+ files >300 lines in business logic alone) |

---

### J. Error management

**Spec**: `03-error-manage/00-overview.md` — error handling from the very first line; no swallowed errors; structured logging.

**Project memory baseline**: `mem://standards/error-logging-via-namespace-logger` already mandates `RiseupAsiaMacroExt.Logger.error()` in macro-controller; `mem://standards/error-logging-requirements` requires file path + missing-file reasoning in HARD ERROR logs.

**Evidence of drift**:

- `throw new Error(` — **142 occurrences** across `src/` + `standalone-scripts/`. Spec calls for typed error classes (`apperror.Wrap`/`apperror.New`-equivalent) carrying error codes from a central registry. We have no registry; we have `src/background/db-schemas.ts:94` `CREATE TABLE ErrorCodes` but no enforced TS-side enum that mirrors it.
- `console.error|warn` — **126 occurrences**. Most should route through `Logger.error()` / `bg-logger.ts` / `RiseupAsiaMacroExt.Logger.error()`.

The `apperror`-style facility partially exists as `src/background/bg-logger.ts` and the `RiseupAsiaMacroExt.Logger` namespace, but adoption is partial — at least 142 + 126 = ~268 sites bypass it.

---

### K. Universal Response Envelope

**Spec**: `03-error-manage/00-overview.md` §2 — every backend API returns `{Status, Attributes, Results}`.

**Project context**: this is a Chrome extension. Inter-context communication is `chrome.runtime.sendMessage` (`src/shared/messages.ts`, 588 lines). The envelope rule is written for HTTP backends and is not strictly required for in-process messaging. **Action**: document the exemption in `spec/22-app-issues/` or add an envelope-equivalent (`{ ok, error?, data }` is what the messaging layer already uses — formalize and rename to `{ Status, Results }` to match spec wire-shape).

---

### L. Split-DB Architecture (root.db + per-project DB)

**Spec**: `05-split-db-architecture/01-fundamentals.md` — Root DB owns `Projects` + `Databases` registries; per-entity DBs live under `data/{project}/{type}/{entity}.db`; opened via `DbManager.GetOrCreateDb(slug, type, entityId)`.

**What we have**:

- `src/background/db-manager.ts` (523 lines) — manages two top-level DBs: `logs.db`, `errors.db`.
- Per-project key/value lives in `ProjectKv` (a single table inside `logs.db`), not in per-project SQLite files.
- `src/background/project-db-manager.ts` — creates per-project schema *inside the same shared DB*, not a separate file per project.
- No `Projects` or `Databases` registry tables matching the spec.

**Gap vs spec**:

| Spec Component | Status |
|----------------|--------|
| Root DB at `data/root.db` with `Projects` + `Databases` + `DatabaseStats` registries | ❌ Missing |
| Per-project folder `data/{slug}/…` | ❌ Single shared DB instead |
| Per-entity DB files (`data/{slug}/cache/search-cache.db`, …) | ❌ All inside `logs.db`/`errors.db` |
| `DbManager.GetOrCreateDb(slug, type, entityId)` | ❌ Replaced by ad-hoc `bindKvDbManager`, `bindStorageDbManager`, `bindFileStorageDbManager`, `bindGroupedKvDbManager`, `bindPromptDbManager`, `bindErrorDbManager` (six binders, no router) |
| WAL mode + busy_timeout pragmas | ⚠️ Verify in `src/background/db-manager.ts` |
| `BackupProject` / `RestoreProject` (zip per project) | ⚠️ Partial — `src/lib/sqlite-bundle.ts` zips a single bundle DB, not the spec's multi-file project folder |

---

### M. Seedable Config (CW Config)

**Spec**: `06-seedable-config-architecture/01-fundamentals.md` —
1. `config.seed.json` with `Version` SemVer
2. Table `ConfigMeta(SeedVersion, CurrentVersion, LastSeededAt, ChangelogUpdatedAt, ...)`
3. `SeedWithVersionCheck()` — diff SemVer, merge new keys, preserve user overrides
4. Auto-update `CHANGELOG.md` from the seed `Changelog` field

**What we have** (`src/background/config-seeder.ts`):

- Table `ProjectConfigMeta(ConfigName, SourceHash, SeededAt, UpdatedAt)` — uses content hash, not SemVer.
- No `SeedVersion` field, no `Changelog` in the seed payload, no `CHANGELOG.md` automation.
- No `config.seed.json` file in the repo root (the seeds are inlined in `src/background/default-project-seeder.ts` and `src/background/manifest-seeder.ts`).

**Gap**: hash-based seeding is functionally similar (re-seed when content changes) but loses the SemVer-aware merge (preserve user overrides; gate by `seedVer.GreaterThan(currentVer)`) and the changelog auditability that the spec mandates.

---

### N. View prefix `Vw…`

**Evidence**: `src/background/db-schemas.ts:…` defines `CREATE VIEW IF NOT EXISTS UpdaterDetails` — should be `VwUpdaterDetail` (singular + `Vw` prefix).

### O. Index naming `Idx{Table}_{Column}`

Spec uses an underscore separator (`IdxTransactions_CreatedAt`). Most of our indexes drop the underscore (`IdxStatsRecordedAt`, `IdxUtcUpdater`). Either fix the schema or amend the spec — pick one and apply globally.

### P. JSON-key PascalCase across the wire

DB rows are PascalCase ✅. But `src/shared/messages.ts` (588 lines) defines TS interfaces with camelCase properties (e.g., `requestId`, `payload`, `tabId`). For an in-process Chrome-extension bus this is normal TS practice, but the spec rule 11 (`PascalCase Key Naming Standard`) literally lists *"WebSocket message types"* and *"Log context keys"* as PascalCase-required. **Decide**: enforce PascalCase across the message bus, or document the exemption (alongside Prometheus, WordPress hooks, HTTP headers).

### Q. `Description` column on entity/reference tables

`PromptsCategory`, `UpdaterCategory`, `ProjectGroup`, `MetaTables` are reference tables and should carry `Description TEXT NULL` per `04-database-conventions/01-naming-conventions.md` §Rule 10. None of them do.

---

## 2. What's Working Well (do not regress)

- ✅ All DB columns are PascalCase (snake_case scan returns zero hits).
- ✅ `INTEGER PRIMARY KEY AUTOINCREMENT` is used consistently for the bare-`Id` PKs.
- ✅ Foreign-key columns already use the `{TableName}Id` naming we want for PKs (e.g., `ProjectId`, `UpdaterId`, `CategoryId`, `SettingId`). This means flipping PKs is mostly a one-side rename plus FK reference touch-ups — not a 2-sided rewrite.
- ✅ Boolean naming `Is`/`Has` is honoured almost everywhere.
- ✅ `mem://constraints/no-supabase`, `mem://architecture/linting-policy`, `mem://standards/error-logging-via-namespace-logger` are already in active use — they directly map onto these spec rules.
- ✅ Bundle schema (`src/lib/sqlite-bundle-contract.ts` + CI guard `scripts/check-bundle-schema-contract.mjs`) provides a working template we can copy for runtime DB schema validation.

---

## 3. Phased Remediation Plan

> **Principle**: every phase is independently shippable, gated by a CI rule, and ordered by **risk reduction × cost**. Phase 1 is mandatory; later phases can be reordered after Phase 1 lands.

### Phase 1 — CODE-RED stop-the-bleed (1–2 sessions)

| Step | Work | Files | Verification |
|------|------|-------|--------------|
| 1.1 | Add ESLint rules from `02-typescript/08` §7 (`no-explicit-any: error`, `no-unsafe-*: error`) | `eslint.config.js` | `bunx eslint .` exits clean against new violations gated; existing violations get `// SAFETY:` waivers per spec §7 |
| 1.2 | Add a `forbidden-patterns` CI script that scans for `: any`, raw `if (!fn(`, `console.error\|warn`, `throw new Error(`, and `type X = "a" \| "b"` | `scripts/check-forbidden-patterns.mjs` | New job in `.github/workflows/ci.yml`; fails on **new** introductions only via baseline file |
| 1.3 | Wrap the existing 142 `throw new Error` and 126 `console.error/warn` sites with a baseline-allow file; block any **new** ones | `scripts/baseline-error-violations.txt` | Same CI job |
| 1.4 | Document message-bus PascalCase exemption (or commit to renaming) in a new spec file `spec/02-coding-guidelines/02-typescript/13-pascalcase-exemptions.md` | spec only | spec link-checker |

**Outcome**: drift is frozen. No new `any`/string-union/`throw new Error` enters the codebase.

---

### Phase 2 — Database PK rename (1 session, high-risk migration)

> The biggest single conformance gap, and the one with the cleanest migration story because FK columns already match the spec.

| Step | Work | Files |
|------|------|-------|
| 2.1 | Write migration `migration-v9-pk-rename.ts` that for each table runs `ALTER TABLE Foo RENAME COLUMN Id TO FooId` (SQLite 3.25+ supports this in-place) | new file under `src/background/migrations/` |
| 2.2 | Update every `INSERT … (Id, …)` / `WHERE Id = ?` / `last_insert_rowid()` reader site | grep `\bId\b` inside SQL string literals across `src/background/handlers/**`, `src/lib/sqlite-bundle.ts`, `src/background/schema-meta-engine.ts` |
| 2.3 | Add CI guard `scripts/check-pk-naming.mjs` — parse every `CREATE TABLE`, ensure the first column matches `<TableName>Id` (excluding junction-table composite PKs) | new |
| 2.4 | Bundle schema contract update: `src/lib/sqlite-bundle-contract.ts` BUNDLE_SCHEMA already declares `Id` as required — flip every entry to `{TableName}Id`. Bump `BUNDLE_FORMAT_VERSION` to `5` and add v4→v5 transparent reader. | `src/lib/sqlite-bundle.ts`, `src/lib/sqlite-bundle-contract.ts` |
| 2.5 | Singularize the 14 plural tables (Phase B fold-in): `Sessions→Session`, `Logs→Log`, `Errors→ErrorRecord` (avoid keyword), `Prompts→Prompt`, etc. Same migration script. | same files |

**Verification**: `bunx vitest run` for the existing import/export regression tests; manual spot check that `logs.db` and `errors.db` open after migration.

---

### Phase 3 — TypeScript enum cleanup (2 sessions, mechanical)

| Step | Work |
|------|------|
| 3.1 | Convert all 30 `type X = "a" \| "b"` declarations to `enum XType { A = "A", B = "B" }`. Update every consumer in the same PR (codemod). |
| 3.2 | Rename existing 20 `…Code` / suffix-less enums to add `Type` suffix (or formally exempt the `Code` suffix in `spec/02-coding-guidelines/02-typescript/13-pascalcase-exemptions.md`). |
| 3.3 | Replace `as` casts in switch statements with exhaustive `never` checks. |

**Files**: `src/lib/automation-types.ts`, `src/shared/types.ts`, all `src/hooks/use-*.ts` flagged in §E, `src/background/handlers/*.ts`, `src/components/popup/BootFailureBanner.tsx`, `src/components/popup/SdkSelfTestPanel.tsx`, `src/components/options/Project*`, `standalone-scripts/lovable-*`.

---

### Phase 4 — File-size / function-size cleanup (3+ sessions)

> Per `mem://workflow/task-execution-pattern` we should land an RCA for the largest two files first, then split.

| Step | File | Strategy |
|------|------|----------|
| 4.1 | `src/background/handlers/injection-handler.ts` (1 998 lines) | Extract per-strategy modules (`inject-via-tabs.ts`, `inject-via-scripting.ts`, `world-bridge.ts`, …). Keep public surface through a barrel. |
| 4.2 | `src/components/options/ProjectDetailView.tsx` (1 683 lines) | Split into `ProjectDetailHeader`, `ProjectDetailTabs`, one component per tab content. Each <200 lines. |
| 4.3 | `src/lib/sqlite-bundle.ts` (782 lines) | Extract per-table writers (`write-projects.ts`, `write-scripts.ts`, …) and per-table readers; bundle-shell stays. Will help Phase 2 too. |
| 4.4 | Other 22 files >300 lines | One issue file per surface, batch in a follow-up sprint. |

**Verification**: tsc clean per slice; the existing snapshot tests gate UI splits.

---

### Phase 5 — Error-management completion (2 sessions)

| Step | Work |
|------|------|
| 5.1 | Build a TS-side error-code registry mirroring `db-schemas.ts:94 ErrorCodes`; export typed `ErrorCodeType` enum. |
| 5.2 | Introduce `AppError` class (`src/lib/app-error.ts`) with `code`, `message`, `cause`, `context: Record<string, string>`, `toLogPayload(): LogPayload` (PascalCase keys per spec). |
| 5.3 | Codemod the 142 `throw new Error(` → `throw new AppError({ code: ErrorCodeType.…, message, cause })`. |
| 5.4 | Codemod the 126 `console.error/warn` → `Logger.error(...)` / `bg-logger`. |
| 5.5 | Mandate file-path inclusion for HARD errors (already encoded in `mem://constraints/file-path-error-logging-code-red`). Add CI grep that fails when an `AppError` with severity HARD lacks `path` in context. |

---

### Phase 6 — Split-DB Architecture migration (large, reorderable)

> Most invasive. Touches storage layout. Requires a backwards-compatible reader for the current single-shared-DB layout.

| Step | Work |
|------|------|
| 6.1 | Decide: stay with the shared-DB layout and **document the exemption**, or migrate to per-project files. The extension's OPFS / `chrome.storage` constraints make per-project files non-trivial. Suggest writing `spec/22-app-issues/split-db-feasibility-2026.md` first, then deciding. |
| 6.2 | If we migrate: introduce `Root.Projects` and `Root.Databases` tables; swap the six `bind*DbManager` calls for a `DbManager.GetOrCreateDb(slug, type, entityId)` router. |
| 6.3 | Add `WAL`, `busy_timeout=5000`, `foreign_keys=ON` pragmas on every open path (verify current state in `src/background/db-manager.ts`). |
| 6.4 | Wire `BackupProject` / `RestoreProject` into the existing `sqlite-bundle.ts` exporter so bundles reflect the multi-file project layout. |

---

### Phase 7 — Seedable Config completion

| Step | Work |
|------|------|
| 7.1 | Add a top-level `config.seed.json` and `config.schema.json`. Move inline seeds out of `default-project-seeder.ts` / `manifest-seeder.ts`. |
| 7.2 | Migrate `ProjectConfigMeta` to add `SeedVersion TEXT`, `CurrentVersion TEXT`, `ChangelogUpdatedAt TEXT`. Keep `SourceHash` for cheap idempotency check. |
| 7.3 | Implement `seedWithVersionCheck()` mirroring the spec algorithm: `semver.gt(seed.Version, current.SeedVersion)` → merge new keys, preserve overrides, append to `CHANGELOG.md`. |
| 7.4 | Add a CI step that diffs `config.seed.json` against the prior tag and fails when version is not bumped. |

---

### Phase 8 — Polish (low-risk, batched)

| Step | Work |
|------|------|
| 8.1 | Rename `UpdaterDetails` view → `VwUpdaterDetail`. |
| 8.2 | Apply `Idx{Table}_{Column}` underscore-separator to all indexes (or amend spec to drop the underscore — pick one). |
| 8.3 | Add `Description TEXT NULL` to `PromptsCategory`, `UpdaterCategory`, `ProjectGroup`, `MetaTables`. |
| 8.4 | Rename `Enabled` → `IsEnabled` in `AutomationChains`. |
| 8.5 | Justify or replace the 4 UUID PKs in `lovable-owner-switch` and `lovable-user-add`. |

---

## 4. Effort vs. Risk Matrix

| Phase | Effort | Risk | Blocks? |
|-------|--------|------|---------|
| 1 — Stop-the-bleed | S | Low | None — pure CI |
| 2 — PK rename + singularize | M | **High** (data migration) | Blocks Phase 6 cleanly |
| 3 — Enum cleanup | M | Low | Blocks Phase 1.1 ratchet |
| 4 — File-size split | L | Medium (UI regressions) | None |
| 5 — Error mgmt | M | Low–Medium | Improves Phase 4 telemetry |
| 6 — Split-DB | XL | **High** (storage layout) | Decision gate first |
| 7 — Seedable config | M | Low | None |
| 8 — Polish | S | Low | None |

---

## 5. Deferred / Out of Scope (for this audit)

- Function-size measurement (Phase 4 will surface the worst sites; full audit is its own pass).
- Rust / Go / PHP / C# rules — no such code in this project.
- React-component test coverage — explicitly deferred per `mem://preferences/deferred-workstreams`.

---

## 6. Cross-References

- `spec/02-coding-guidelines/00-overview.md` — root rules
- `spec/02-coding-guidelines/02-typescript/08-typescript-standards-reference.md` — TS specifics
- `spec/04-database-conventions/01-naming-conventions.md` — DB naming
- `spec/05-split-db-architecture/01-fundamentals.md` — Split-DB
- `spec/06-seedable-config-architecture/01-fundamentals.md` — CW Config
- `mem://standards/error-logging-via-namespace-logger`
- `mem://standards/error-logging-requirements`
- `mem://constraints/file-path-error-logging-code-red`
- `mem://standards/unknown-usage-policy`
- `mem://architecture/linting-policy`

---

*Audit prepared 2026-04-25 — Riseup Asia LLC. No code changed in this pass.*
