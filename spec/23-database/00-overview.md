# 23 — Database

**Version:** 1.0.0
**Updated:** 2026-04-28
**Status:** Active

Index of all database-related specs and the canonical diagram set.

---

## Purpose

Folder `23-database/` is the **single discovery point** for everything
database-related in the project. It does not move existing specs; it links
them and adds the canonical Mermaid ERDs + storage-layer diagrams.

---

## Canonical diagrams

All ERDs live in [`./diagrams/`](./diagrams/) as `.mmd` files. Rendered PNGs
land in [`./images/`](./images/) via `node scripts/render-db-diagrams.mjs`.

| # | Diagram | Source | Image |
|---|---------|--------|-------|
| 01 | Extension DB (logs.db / errors.db / SQLite bundle) | [diagrams/01-extension-db.mmd](./diagrams/01-extension-db.mmd) | [images/01-extension-db.png](./images/01-extension-db.png) |
| 02 | Project DB / Macro Recorder (Phase 14) | [diagrams/02-project-recorder-db.mmd](./diagrams/02-project-recorder-db.mmd) | [images/02-project-recorder-db.png](./images/02-project-recorder-db.png) |
| 03 | Step Group Library | [diagrams/03-step-group-library.mmd](./diagrams/03-step-group-library.mmd) | [images/03-step-group-library.png](./images/03-step-group-library.png) |
| 04 | Storage layers overview (4-tier) | [diagrams/04-storage-layers.mmd](./diagrams/04-storage-layers.mmd) | [images/04-storage-layers.png](./images/04-storage-layers.png) |
| 05 | Overall schema ERD (Extension DB + Project DB combined) | [diagrams/05-overall-schema-erd.mmd](./diagrams/05-overall-schema-erd.mmd) | [images/05-overall-schema-erd.png](./images/05-overall-schema-erd.png) |
| 06 | Key tables & relationships (focused recorder/replay subset) | [diagrams/06-key-tables-relationships.mmd](./diagrams/06-key-tables-relationships.mmd) | [images/06-key-tables-relationships.png](./images/06-key-tables-relationships.png) |

Visual style follows `mem://style/diagram-visual-standards` — XMind-inspired
dark aesthetic, top-down (`flowchart TD`) where applicable, PascalCase node
labels.

---

## Linked specs (no content moved)

### Conventions & architecture

| Spec | What it covers |
|---|---|
| [`spec/04-database-conventions/`](../04-database-conventions/00-overview.md) | Naming, ID convention, ORM/views, testing strategy |
| [`spec/05-split-db-architecture/`](../05-split-db-architecture/02-features/00-overview.md) | Split-DB CLI examples, reset API, RBAC, user isolation |
| [`spec/06-seedable-config-architecture/`](../06-seedable-config-architecture/) | Seedable config layer |

### Schema sources (code)

| Module | Tables |
|---|---|
| `src/background/db-schemas.ts` | Sessions, Logs, Errors, ErrorCodes, Prompts, PromptsCategory, PromptsToCategory, ProjectKv, ProjectFiles, Settings, GroupedKv, Scripts, UpdaterInfo, UpdaterCategory, UpdaterToCategory, UpdaterEndpoints, UpdaterSteps, UpdateSettings, DynamicLoadLog, SharedAsset |
| `src/background/recorder-db-schema.ts` | DataSourceKind, SelectorKind, StepKind, StepStatus, DataSource, Step, StepTag, Selector, FieldBinding, JsSnippet, ReplayRun, ReplayStepResult |
| `src/background/migration-v8-sql.ts` | AssetVersion |

### Recorder / project DB specs

| Spec | What it covers |
|---|---|
| [`spec/31-macro-recorder/03-data-model.md`](../31-macro-recorder/03-data-model.md) | Authoritative recorder schema |
| [`spec/31-macro-recorder/03-erd.md`](../31-macro-recorder/03-erd.md) | Original recorder ERD |
| [`spec/31-macro-recorder/04-per-project-db-provisioning.md`](../31-macro-recorder/04-per-project-db-provisioning.md) | Per-project DB provisioning flow |
| [`spec/31-macro-recorder/14-step-chaining-and-cross-project-links.md`](../31-macro-recorder/14-step-chaining-and-cross-project-links.md) | Phase 14 chain columns + StepTag |
| [`spec/31-macro-recorder/15-step-chain-data-model.mmd`](../31-macro-recorder/15-step-chain-data-model.mmd) | Phase 14 ERD |
| [`spec/31-macro-recorder/16-step-group-library.md`](../31-macro-recorder/16-step-group-library.md) + [`16-step-group-library-erd.md`](../31-macro-recorder/16-step-group-library-erd.md) | Step group hierarchy |

### Other DB-touching specs

| Spec | What it covers |
|---|---|
| [`spec/21-app/02-features/misc-features/cross-project-sync.md`](../21-app/) | SharedAsset + AssetVersion (cross-project sync, version history) |
| [`spec/30-import-export/02-erd.md`](../30-import-export/02-erd.md) | Import/export ERD |

---

## Rendering diagrams

```bash
node scripts/render-db-diagrams.mjs
```

The script invokes `@mermaid-js/mermaid-cli` via `npx` (no permanent
dependency added) and writes PNGs into `./images/`. Re-run after editing
any `.mmd` file. See [`./diagrams/readme.md`](./diagrams/readme.md).

---

## Cross-references

- Diagram visual standards: `mem://style/diagram-visual-standards`
- Spec authoring guide: [`spec/01-spec-authoring-guide/`](../01-spec-authoring-guide/)
