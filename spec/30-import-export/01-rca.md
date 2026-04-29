# 30-01 — Project & Prompt Import/Export — Root Cause Analysis

**Status**: Spec — pending review.
**Owner**: Marco extension.
**Last updated**: 2026-04-24 (Asia/Kuala_Lumpur).
**Related docs**: `02-erd.md` (schema + flow diagrams), `03-test-plan.md` (e2e plan).

---

## 1. Goal

End-to-end verification that:

1. A project can be **exported** as a `.zip` containing exactly **one SQLite DB** holding every project artifact.
2. The same `.zip` can be **imported** to reconstruct the project byte-equivalently.
3. **Prompts** authored as `standalone-scripts/prompts/<NN-slug>/{info.json, prompt.md}` survive the full pipeline (`prompt.md` → aggregator → JSON → runtime seed → SQLite → export → import → resolver) and the resolver returns text **byte-equal** to the source `prompt.md` (after `trimEnd()` only).
4. All SQLite tables and columns inside the bundle remain **PascalCase**.

## 2. What exists today (audit findings)

### 2.1 Two parallel exporters

| File | Behaviour | Status |
|---|---|---|
| `src/lib/sqlite-bundle.ts` | All-projects + per-project + prompts-only export to `marco-backup.zip` containing `marco-backup.db` (SQLite). PascalCase columns. Has `previewSqliteZip`, `importFromSqliteZip`, `mergeFromSqliteZip`. | **Canonical.** |
| `src/lib/project-exporter.ts` | Single-project export to `marco-<slug>.json` (legacy plain JSON, no DB, no prompts, no configs). Still imported by `ProjectEditor.tsx` and `ProjectsSection.tsx`. | **Deprecated.** Rewire UI to call `exportProjectAsSqliteZip()` from `sqlite-bundle.ts`. Tracked in `plan.md`. |

### 2.2 Schema reality vs. user spec

The user-facing spec listed `Settings`, `Dependencies`, `Scripts`, `Variables`, `DatabaseInfo`, `Prompts` as separate tables. The actual export DB written by `sqlite-bundle.ts` contains:

| Table | Columns (PascalCase) | Notes |
|---|---|---|
| `Projects` | `Id`, `Uid`, `SchemaVersion`, `Name`, `Version`, `Description`, `TargetUrls` (JSON), `Scripts` (JSON), `Configs` (JSON), `CookieRules` (JSON), `Settings` (JSON), `CreatedAt`, `UpdatedAt` | Settings / dependency-list / cookie-rules / target-URL-list / script-bindings live as **JSON blobs inside columns**, not as separate rows. |
| `Scripts` | `Id`, `Uid`, `Name`, `Description`, `Code`, `RunOrder`, `RunAt`, `ConfigBinding`, `IsIife`, `HasDomUsage`, `CreatedAt`, `UpdatedAt` | Library scripts (referenced by path/UID from `Projects.Scripts` JSON). |
| `Configs` | `Id`, `Uid`, `Name`, `Description`, `Json`, `CreatedAt`, `UpdatedAt` | Library configs. |
| `Prompts` | `Id`, `Uid`, `Name`, `Text`, `RunOrder`, `IsDefault`, `IsFavorite`, `Category`, `CreatedAt`, `UpdatedAt` | Prompt rows; legacy `Category` denormalised string is kept for backward read-compat. The runtime DB also has `PromptsCategory` + `PromptsToCategory` junction tables (see §2.4) — these are **not** currently exported. **Gap.** |
| `Meta` | `Id`, `Key`, `Value` | Records `exported_at` and `format_version='4'`. |

There is **no** `Dependencies`, `Variables`, or `DatabaseInfo` table. The project's `dependencies` field on `StoredProject` (TS-only) is not currently persisted to a DB column at all.

> **Decision (per user finalisation 2026-04-24)**: ERD and tests document the **real** schema. JSON-blob fields are asserted to round-trip and their internal keys are also PascalCase-clean. Adding first-class `Dependencies` / `Variables` tables is deferred to a follow-up RCA.

### 2.3 Bundle filenames

| Constant | Value | Source |
|---|---|---|
| `DB_FILENAME` | `marco-backup.db` | `src/lib/sqlite-bundle.ts:36` |
| `ZIP_FILENAME` (all-projects) | `marco-backup.zip` | `src/lib/sqlite-bundle.ts:37` |
| Per-project zip | `<slug>-backup.zip` (slug = lowercased project name with non-`[a-zA-Z0-9_-]` replaced by `_`) | `src/lib/sqlite-bundle.ts:343-345` |
| Prompts-only zip | `marco-prompts-backup.zip` | `src/lib/sqlite-bundle.ts:702` |

These differ from the spec's placeholder `{ProjectName}.zip` / `Project.db`. The real names are kept (renaming would break existing user backups).

### 2.4 Prompts pipeline (the real chain)

```
standalone-scripts/prompts/<NN-slug>/
  ├─ info.json   (camelCase today — to be migrated to PascalCase)
  └─ prompt.md   (raw text)
                │
                ▼
        scripts/aggregate-prompts.mjs
                │
                ▼
chrome-extension/prompts/macro-prompts.json   (camelCase array)
                │
                ▼
        runtime seeder (prompt-handler.ts)
                │  INSERT INTO Prompts (Slug, Name, Text, …)
                ▼
              SQLite Prompts table   (PascalCase columns)
                │
                ▼
        sqlite-bundle.ts → marco-backup.zip
```

**Drift risks identified**:
- `aggregate-prompts.mjs` calls `.trim()` on `prompt.md` content (`scripts/aggregate-prompts.mjs:46`). Round-trip equality must therefore use `trimEnd()`-normalised compare.
- The aggregator emits camelCase keys (`name`, `text`, `slug`, `version`, `order`, `isDefault`, `category`). The runtime seeder must continue to map these to PascalCase columns. **Test must assert this mapping.**
- `PromptsCategory` + `PromptsToCategory` junction tables exist in the runtime DB (`prompt-handler.ts:86-103`) but are **not** included in the exported bundle. Categories are flattened into `Prompts.Category` (denormalised single string) on export. Round-trip of multi-category links is therefore lossy. **Flagged**; tracked in `plan.md`.

### 2.5 `info.json` casing

Today (camelCase): `id`, `title`, `slug`, `version`, `author`, `categories`, `isDefault`, `order`, `createdAt`, `updatedAt`.

Per user finalisation, all 14 prompt folders will be migrated to PascalCase: `Id`, `Title`, `Slug`, `Version`, `Author`, `Categories`, `IsDefault`, `Order`, `CreatedAt`, `UpdatedAt`. The aggregator will accept PascalCase as canonical and warn on legacy camelCase. A casing test (already established for `instruction.json` in CI, see workflow `casing-instruction-json`) will be extended to `info.json`.

## 3. Confirmed contracts

1. **Single-DB-in-zip rule**: every export bundle contains exactly one `.db` file at the zip root. Filename per §2.3.
2. **PascalCase rule**: every table name AND every column name in the bundle DB is PascalCase. Inside JSON-blob columns, keys are camelCase (matches `StoredProject` TS contract — this is *not* a violation; it's the documented convention for runtime data inside JSON blobs).
3. **Round-trip rule**: `import(export(state)) ≡ state` for every artifact category currently persisted (Projects + Scripts + Configs + Prompts). Variables/dependencies are TS-only fields and are excluded until §2.2 follow-up lands.
4. **Prompt resolver rule**: `resolvePrompt(slug)` returns `Text` from the SQLite `Prompts` row. `Text === trimEnd(readFileSync(prompt.md))`. Byte-equality after `trimEnd()`.
5. **Strict-PascalCase import**: `ImportStrictPascalCase = true` (default). Bundles whose schema has snake_case or camelCase tables/columns are rejected with a clear error. The current code has lenient fallbacks (lines 371-372 etc.) — these will be gated behind a `legacy=true` opt-in flag added during test work.

## 4. Enums (introduced in test fixtures)

```ts
export enum ExportArtifactKind { Project, Script, Config, Prompt, Meta }
export enum ScriptOriginKind { InProject, External }
export enum PromptOperationKind { Save, Modify, Delete }
```

Defined in `src/test/import-export/enums.ts` (created in test phase, see `03-test-plan.md`).

## 5. Open follow-ups (tracked in plan.md)

1. Rewire `ProjectEditor.tsx` + `ProjectsSection.tsx` from `project-exporter.ts` → `exportProjectAsSqliteZip()`; delete `project-exporter.ts`.
2. Promote `dependencies` and `variables` from JSON-blob to first-class PascalCase tables (`Dependencies`, `Variables`) with a `SchemaVersion` bump.
3. Export `PromptsCategory` + `PromptsToCategory` to preserve multi-category prompt linkage round-trip.
4. Add strict-mode flag (`ImportStrictPascalCase`) and gate the snake_case/camelCase fallback readers behind explicit `legacy=true`.

## 6. Acceptance criteria for this spec

- [x] Real schema documented (table + column inventory).
- [x] Real prompts pipeline documented (file → JSON → SQLite → bundle).
- [x] Drift between user spec and reality is enumerated and resolved.
- [ ] Diagrams in `02-erd.md` reviewed and finalised.
- [ ] Test plan in `03-test-plan.md` reviewed and finalised.
- [ ] User says "next" → e2e suite built.
