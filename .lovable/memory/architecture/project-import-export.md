# Project & Prompt Import/Export Architecture

**Status**: Documented 2026-04-24. Spec at `spec/30-import-export/` (3 docs). Diagrams at `/mnt/documents/import-export-{erd,flow}.mmd`.

## Canonical exporter

- `src/lib/sqlite-bundle.ts` is the single source of truth for project / prompt / all-data export and import.
- `src/lib/project-exporter.ts` is **deprecated** — legacy single-project JSON exporter still wired into `ProjectEditor.tsx` and `ProjectsSection.tsx`. Rewire is tracked as a follow-up in `plan.md`.

## Bundle layout

- All-projects backup: `marco-backup.zip` containing `marco-backup.db`.
- Per-project backup: `<slug>-backup.zip` containing `marco-backup.db` (slug = lowercased project name, non-`[a-zA-Z0-9_-]` → `_`).
- Prompts-only backup: `marco-prompts-backup.zip` containing `marco-backup.db`.
- Filenames are kept stable to avoid breaking existing user backups.

## Real SQLite schema (PascalCase tables + columns)

- `Projects(Id, Uid, SchemaVersion, Name, Version, Description, TargetUrls, Scripts, Configs, CookieRules, Settings, CreatedAt, UpdatedAt)` — Settings/Scripts/Configs/CookieRules/TargetUrls live as **JSON blobs** inside columns.
- `Scripts(Id, Uid, Name, Description, Code, RunOrder, RunAt, ConfigBinding, IsIife, HasDomUsage, CreatedAt, UpdatedAt)` — library scripts.
- `Configs(Id, Uid, Name, Description, Json, CreatedAt, UpdatedAt)`.
- `Prompts(Id, Uid, Name, Text, RunOrder, IsDefault, IsFavorite, Category, CreatedAt, UpdatedAt)` — note `Category` is denormalised single string; multi-category linkage via runtime `PromptsCategory` + `PromptsToCategory` tables is **not** exported (lossy round-trip flagged).
- `Meta(Id, Key, Value)` with `exported_at` and `format_version='4'`.

There is **no** `Dependencies`, `Variables`, or `DatabaseInfo` table. `dependencies` and `variables` are TS fields on `StoredProject` and currently live inside the `Projects.Settings` JSON blob. Promotion to first-class tables is deferred.

## JSON-blob casing rule

Inside JSON-blob columns the keys are **camelCase** (matches `StoredProject` TS contract). This is documented and intentional — only DB identifiers (table + column names) are PascalCase. The instruction-casing CI policy applies to compiled artifacts under `dist/`, not to runtime DB JSON blobs.

## Round-trip contract (asserted by e2e tests)

`importFromSqliteZip(exportProjectAsSqliteZip(state)) ≡ state` for Projects + Scripts + Configs + Prompts.
