# Per-Project Recorder DB Provisioning

**Version:** 1.0.0
**Updated:** 2026-04-26
**Phase:** 04 (Backend Provisioning)

---

## Decision

Recording steps are **not** stored in a global Lovable Cloud table. Instead,
each Project owns its own SQLite `.db` file managed via OPFS, and the
recorder schema (9 tables) is migrated automatically the moment a project
is created.

This aligns with `spec/04-database-conventions/07-split-db-pattern.md`
("one database per bounded context") and `spec/05-split-db-architecture/`.

---

## Bounded Context

| Concern | Storage Location |
|---|---|
| Project list / metadata (name, slug, ownership) | `chrome.storage.local` (extension layer) |
| Recording steps, selectors, data sources, bindings | `project-{slug}.db` (per-project SQLite via OPFS) |
| Cross-project audit logs | `marco-logs.db` (global) |

> **Rule:** A project is the bounded context. All recorder rows for that
> project live inside that single `.db` file. No FKs cross DB boundaries
> — the project ID is implicit in the file name.

---

## File Layout

```
OPFS root/
├── marco-logs.db                    ← global logs
├── marco-errors.db                  ← global errors
├── project-acme-checkout.db         ← project A (recorder schema applied)
├── project-foo-bar.db               ← project B (recorder schema applied)
└── project-{slug}.db                ← one per project, auto-provisioned
```

Naming convention: `project-{slug}.db` where `slug` is the kebab-case
project slug from `StoredProject.slug`.

---

## Schema Source of Truth

| Layer | File |
|---|---|
| Authoritative table catalog | [`./03-data-model.md`](./03-data-model.md) |
| ERD | [`./03-erd.md`](./03-erd.md) |
| Live SQL | `src/background/recorder-db-schema.ts` |
| Code Enums | Same file — `SelectorKindId`, `StepKindId`, `StepStatusId`, `DataSourceKindId` |

The TypeScript constant `RECORDER_DB_SCHEMA` is the single executable
source. Any change to the data model must update **both** `03-data-model.md`
and `recorder-db-schema.ts` in the same commit.

---

## Migration Flow

```
┌────────────────────────────────────────────────────────────────────┐
│  User clicks "Create" in ProjectCreateForm                         │
│            │                                                        │
│            ▼                                                        │
│  useProjects.save({ ...newProject })                                │
│            │                                                        │
│            ▼  sendMessage SAVE_PROJECT                              │
│  handleSaveProject (project-handler.ts)                             │
│    ├── upsertProject + writeAllProjects                             │
│    ├── rebuildNamespaceCache (fire-and-forget)                      │
│    ├── seedBoundConfigs       (fire-and-forget)                     │
│    └── if (wasNew) initProjectDb(slug)  ◄── NEW                     │
│            │                                                        │
│            ▼                                                        │
│  initProjectDb (project-db-manager.ts)                              │
│    ├── ensureSqlJs                                                  │
│    ├── tryLoadDb(sql, slug,                                         │
│    │             PROJECT_SCHEMA_TABLE                               │
│    │             + RECORDER_DB_SCHEMA   ◄── NEW                     │
│    │             + extraSchema)                                     │
│    └── ensureDefaultDatabases (KV + Meta)                           │
└────────────────────────────────────────────────────────────────────┘
```

**Idempotence guarantee.** Every statement in `RECORDER_DB_SCHEMA` uses
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, or
`INSERT OR IGNORE`. Re-running the migration on an existing project DB
is a safe no-op — important because `tryLoadDb` runs the schema on every
service-worker boot when the DB is loaded from OPFS.

---

## Tables Provisioned per Project

Lookup tables (seeded with reference rows on creation):

| Table | Rows | Code Enum |
|---|---|---|
| `DataSourceKind` | `Csv`, `Json` | `DataSourceKindId` |
| `SelectorKind` | `XPathFull`, `XPathRelative`, `Css`, `Aria` | `SelectorKindId` |
| `StepKind` | `Click`, `Type`, `Select`, `JsInline`, `Wait` | `StepKindId` |
| `StepStatus` | `Draft`, `Active`, `Disabled` | `StepStatusId` |

Business tables:

| Table | PK | Notable Constraints |
|---|---|---|
| `DataSource` | `DataSourceId` | FK → `DataSourceKind` |
| `Step` | `StepId` | FK → `StepKind`, `StepStatus`; `CHECK (InlineJs IS NULL OR StepKindId = 4)`; unique `VariableName` |
| `Selector` | `SelectorId` | FK → `Step` (CASCADE), `SelectorKind`, self-FK `AnchorSelectorId`; partial-unique primary per Step |
| `FieldBinding` | `FieldBindingId` | FK → `Step` (CASCADE), `DataSource` (RESTRICT); 1:1 with Step |

> **No `Project` table here.** The DB file *is* the project. Storing a
> redundant `ProjectId` column in every row would violate split-DB
> normalisation and create a useless self-reference.

---

## Reuse Pattern

The same provisioning runs for:

| Trigger | Hook |
|---|---|
| New project created | `handleSaveProject` (when `wasNew === true`) |
| Existing project loaded (cold boot) | `initProjectDb` called on first `getProjectDb` request |
| Project re-imported from `.zip` bundle | `handleImportProject` → `initProjectDb` |
| Recorder UI mount | Indirectly — UI calls `getProjectDb(slug)` which throws if not initialised, prompting init |

Anyone needing a project DB calls `initProjectDb(slug)` first — there is
**one** initialiser, and it always applies the recorder schema.

---

## Cross-References

| Reference | Location |
|---|---|
| Split-DB pattern | `../04-database-conventions/07-split-db-pattern.md` |
| Naming conventions | `../04-database-conventions/01-naming-conventions.md` |
| Authoritative schema | [`./03-data-model.md`](./03-data-model.md) |
| ERD | [`./03-erd.md`](./03-erd.md) |
| Live SQL constant | `src/background/recorder-db-schema.ts` |
| Provisioning hook | `src/background/handlers/project-handler.ts` (`handleSaveProject`) |
| DB manager | `src/background/project-db-manager.ts` (`initProjectDb`) |
