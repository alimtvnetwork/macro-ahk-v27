# Step Group Library — Import / Export via SQLite

**Version:** 1.0.0
**Updated:** 2026-04-26
**Phase:** 16 (Step Library)
**Status:** Draft → Implementation
**AI Confidence:** Production-Ready
**Ambiguity:** None
**Authoritative ERD:** [`./16-step-group-library-erd.md`](./16-step-group-library-erd.md)

---

## 1. Purpose

The Step Group Library lets a user organise recorded steps into a
**nested tree of groups** within a project, run any group on demand,
have one group **call** another (like a function), and **import / export
groups as portable `.zip` bundles** so libraries can be shared between
projects, teammates, or extension installs.

Persistence is a **single SQLite database** maintained by the extension
(via `sql.js` WASM) inside OPFS. Export = the raw `.sqlite` file plus a
small `manifest.json`, packaged as a `.zip`. Import = reverse.

---

## 2. Hierarchy (locked)

```
Project
  └── StepGroup           (level 0 — the root group is implicit and unnamed)
        ├── StepGroup     (level 1 — sub-group)
        │     ├── StepGroup    (level 2 — sub-sub-group)
        │     │     └── Step
        │     └── Step
        └── Step
```

**Constraints**

- `StepGroup.ParentStepGroupId` is `NULL` only for **root groups of a
  project**. Every other group has a parent.
- Maximum **nesting depth = 8** (enforced in code; trees deeper than
  this rejected at insert and at import).
- A `Step` belongs to **exactly one** `StepGroup` (via
  `Step.StepGroupId`). Steps cannot be moved between projects without
  going through export → import.
- `StepGroup.Name` is unique among siblings (same `ParentStepGroupId` +
  same `ProjectId`). Case-insensitive comparison.

---

## 3. Group References (locked)

Two complementary mechanisms:

### 3.1 `RunGroup` step kind

A new `StepKind` row (`Name = "RunGroup"`, see §5.3) lets a step
**invoke another group inline** during replay. Think of it as a
function call.

- New column on `Step`: `TargetStepGroupId INTEGER NULL` (FK →
  `StepGroup.StepGroupId`, `ON DELETE SET NULL`). Required when
  `StepKindId = StepKind.RunGroup`, must be `NULL` otherwise — enforced
  by `CHECK` constraint and by the runtime validator.
- Cross-project references are **forbidden** at the database level: a
  `RunGroup` step's `TargetStepGroupId` must resolve to a group whose
  `ProjectId` matches the calling step's `ProjectId`. Enforced by
  trigger (`TrgStepRunGroupSameProject`) and by the runtime validator.
- **Recursion guard**: the runner maintains a per-execution
  `Set<StepGroupId>` of groups currently on the call stack. If a
  `RunGroup` step targets a group already in the stack the runner
  emits a `RunGroupCycle` failure (Reason code, see §7) **before**
  expanding the call.
- **Max call depth = 16**. Any expansion past depth 16 emits
  `RunGroupDepthExceeded`.

### 3.2 Batch-run-groups action

A user-facing UI action `runGroupsBatch(groupIds: number[])` runs
multiple groups **sequentially** in the order supplied. It is **not**
recorded as a step — it is a transient runtime command. Each group in
the batch starts with a fresh recursion guard and depth counter.

---

## 4. SQLite Runtime (locked)

| Aspect | Choice |
|---|---|
| Engine | `sql.js` 1.10.x (WASM, MIT licensed) |
| Storage | OPFS via `navigator.storage.getDirectory()`; fallback `chrome.storage.local` for service-worker contexts |
| File path (OPFS) | `/marco/step-library.sqlite` (single DB per extension install) |
| Mutation flow | All writes via the `StepLibraryDb` wrapper; auto-flushed to OPFS via `db.export()` after every committed transaction |
| Concurrency | Wrapper serialises all writes via a `Promise` queue (sql.js is single-threaded) |
| Migration | `PRAGMA user_version` integer; on open, run any pending migration scripts in order |
| Encoding | UTF-8 |

**Why sql.js + OPFS over absurd-sql:** simpler dependency footprint,
synchronous queries (sql.js is sync), and OPFS already chosen for
recorder-session logging (mem://architecture/session-logging-system) so
no new persistence layer is added.

---

## 5. SQLite Schema

Conventions: PascalCase, singular table names, PK `{Table}Id`,
positive booleans, lookup tables for every kind/status. See
`spec/04-database-conventions/`.

### 5.1 `Project` (already exists in macro-recorder DB; mirrored here)

The Step Library DB owns its **own copy** of the project list (only the
columns it needs) so the export bundle is self-contained. Synced one
way: when a project is created in the recorder, a row is inserted here
via `StepLibraryDb.upsertProject()`.

| Column | Type | Constraints |
|---|---|---|
| `ProjectId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `ProjectExternalId` | `TEXT` | `NOT NULL UNIQUE` — UUID issued by the recorder, lets us re-link on import |
| `Name` | `VARCHAR(120)` | `NOT NULL` |
| `CreatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |
| `UpdatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |

**Indexes**: `IxProjectExternal` on `ProjectExternalId`.

### 5.2 `StepGroup`

| Column | Type | Constraints |
|---|---|---|
| `StepGroupId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `ProjectId` | `INTEGER` | `NOT NULL`, FK → `Project.ProjectId` `ON DELETE CASCADE` |
| `ParentStepGroupId` | `INTEGER` | `NULL` (root) or FK → `StepGroup.StepGroupId` `ON DELETE CASCADE` |
| `Name` | `VARCHAR(120)` | `NOT NULL` |
| `Description` | `TEXT` | `NULL` |
| `OrderIndex` | `INTEGER` | `NOT NULL DEFAULT 0` — sibling sort order |
| `IsArchived` | `TINYINT` | `NOT NULL DEFAULT 0` |
| `CreatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |
| `UpdatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxStepGroupProjectParent` | `ProjectId, ParentStepGroupId` | Tree walk |
| `IxStepGroupSiblingNameUnique` | `ProjectId, ParentStepGroupId, lower(Name)` (unique) | Prevent name collision among siblings |

**Triggers**

- `TrgStepGroupNoSelfParent`: `BEFORE INSERT/UPDATE` rejects rows where
  `ParentStepGroupId = StepGroupId`.
- `TrgStepGroupSameProjectParent`: `BEFORE INSERT/UPDATE` rejects rows
  where `ParentStepGroupId` references a group whose `ProjectId` differs
  from the new row's `ProjectId`.
- `TrgStepGroupMaxDepth8`: `BEFORE INSERT/UPDATE` walks the parent
  chain; if depth > 8, raises `MaxNestingDepthExceeded`.

### 5.3 `StepKind` (lookup, expanded)

| `StepKindId` | `Name` |
|---|---|
| 1 | `Click` |
| 2 | `Type` |
| 3 | `Select` |
| 4 | `JsInline` |
| 5 | `Wait` |
| **6** | **`RunGroup`** *(new)* |

### 5.4 `Step`

| Column | Type | Constraints |
|---|---|---|
| `StepId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `StepGroupId` | `INTEGER` | `NOT NULL`, FK → `StepGroup.StepGroupId` `ON DELETE CASCADE` |
| `OrderIndex` | `INTEGER` | `NOT NULL DEFAULT 0` — sibling sort within group |
| `StepKindId` | `TINYINT` | `NOT NULL`, FK → `StepKind.StepKindId` |
| `Label` | `VARCHAR(160)` | `NULL` — user-facing description |
| `PayloadJson` | `TEXT` | `NULL` — kind-specific payload (selectors, value, JS source) |
| `TargetStepGroupId` | `INTEGER` | `NULL`, FK → `StepGroup.StepGroupId` `ON DELETE SET NULL` |
| `IsDisabled` | `TINYINT` | `NOT NULL DEFAULT 0` |
| `CreatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |
| `UpdatedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |

**Constraints**

- `CHECK` constraint `CkStepRunGroupTarget`:
  `(StepKindId = 6 AND TargetStepGroupId IS NOT NULL) OR
  (StepKindId <> 6 AND TargetStepGroupId IS NULL)`.

**Triggers**

- `TrgStepRunGroupSameProject`: `BEFORE INSERT/UPDATE` ensures
  `TargetStepGroupId`'s project matches `StepGroupId`'s project.

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxStepGroupOrder` | `StepGroupId, OrderIndex` | Iterate steps in a group in order |
| `IxStepTargetGroup` | `TargetStepGroupId` | Reverse lookup: "what calls this group?" |

### 5.5 `SchemaMigration` (housekeeping)

| Column | Type | Constraints |
|---|---|---|
| `Version` | `INTEGER` | `PRIMARY KEY` |
| `Description` | `TEXT` | `NOT NULL` |
| `AppliedAt` | `TEXT` | `NOT NULL DEFAULT (datetime('now'))` |

`PRAGMA user_version` is the source of truth; this table is the audit
log.

---

## 6. ZIP Bundle Format (locked)

**File extension:** `.marco-step-library.zip`

**Contents**

```
db.sqlite          — raw SQLite file produced by sql.js `db.export()`
manifest.json      — see schema below
```

**`manifest.json` schema** (UTF-8 JSON):

```json
{
  "Format": "marco-step-library",
  "FormatVersion": 1,
  "Generator": "marco-extension",
  "GeneratorVersion": "<extension version>",
  "ExportedAt": "2026-04-26T10:30:00.000Z",
  "Project": {
    "ExternalId": "550e8400-e29b-41d4-a716-446655440000",
    "Name": "Onboarding macros"
  },
  "GroupIds": [12, 17, 19],
  "Counts": {
    "Groups": 3,
    "Steps": 27,
    "RunGroupSteps": 4
  },
  "SchemaUserVersion": 3,
  "Sha256OfDbSqlite": "<hex digest of db.sqlite>"
}
```

**Required fields:** `Format`, `FormatVersion`, `Generator`,
`ExportedAt`, `Project`, `GroupIds`, `SchemaUserVersion`,
`Sha256OfDbSqlite`. Importer rejects bundles missing any required
field with a Code Red error (path + what + why — see
mem://constraints/file-path-error-logging-code-red).

**Compatibility**

- `FormatVersion` is checked exactly (`=== 1`). Higher = "produced by a
  newer extension; please upgrade". Lower = future-only concern.
- `SchemaUserVersion` ≤ current DB's `user_version` is acceptable
  (importer runs forward migrations on the imported DB before merging).
  Higher SchemaUserVersion = reject with a clear error.
- `Sha256OfDbSqlite` is verified after unzip; mismatch = reject as
  corrupt.

---

## 7. Failure Reasons (additions)

Adds three new `FailureReasonCode` values used by both the runner and
the import/export pipeline. All flow through `buildFailureReport()` /
`logFailure()` per
mem://standards/verbose-logging-and-failure-diagnostics.

| Code | Phase | Trigger | `ReasonDetail` example |
|---|---|---|---|
| `RunGroupCycle` | Replay | `RunGroup` step targets a group already on the call stack | `"Group #17 'Login' already on stack [12 → 17 → 17]"` |
| `RunGroupDepthExceeded` | Replay | Call depth > 16 | `"Depth 17 exceeded max 16 at group #42"` |
| `StepLibraryImportInvalid` | Record | manifest missing fields, schema too new, or sha mismatch | `"manifest.json missing 'Sha256OfDbSqlite'; bundle rejected"` |

Each emission MUST include `SourceFile` (e.g.
`"src/background/recorder/step-library/runner.ts"`) and pass through
the existing `buildFailureReport()` chokepoint (build-time enforced by
`scripts/check-failure-log-schema.mjs`).

---

## 8. Public APIs

### 8.1 `StepLibraryDb` (TypeScript, in `src/background/recorder/step-library/db.ts`)

```typescript
export interface StepLibraryDb {
  upsertProject(input: { ExternalId: string; Name: string }): Promise<number>;
  listGroups(projectId: number): Promise<readonly StepGroupRow[]>;
  createGroup(input: {
    ProjectId: number;
    ParentStepGroupId: number | null;
    Name: string;
    Description?: string | null;
  }): Promise<number>;
  renameGroup(stepGroupId: number, newName: string): Promise<void>;
  moveGroup(stepGroupId: number, newParentId: number | null): Promise<void>;
  deleteGroup(stepGroupId: number): Promise<void>;

  appendStep(input: {
    StepGroupId: number;
    StepKindId: StepKindId;
    Label?: string | null;
    PayloadJson?: string | null;
    TargetStepGroupId?: number | null;
  }): Promise<number>;
  reorderSteps(stepGroupId: number, orderedStepIds: readonly number[]): Promise<void>;
  deleteStep(stepId: number): Promise<void>;

  /** Snapshot the entire DB; returned as Uint8Array for `db.sqlite`. */
  exportDbBytes(): Promise<Uint8Array>;
  /** Replace current DB with the bytes from an imported bundle. Idempotent. */
  importDbBytes(bytes: Uint8Array): Promise<void>;
}
```

### 8.2 `StepLibraryRunner` (in `src/background/recorder/step-library/runner.ts`)

```typescript
export interface StepLibraryRunner {
  runGroup(stepGroupId: number, opts?: { Verbose?: boolean }): Promise<RunResult>;
  runGroupsBatch(orderedGroupIds: readonly number[], opts?: { Verbose?: boolean }): Promise<RunResult[]>;
}
```

`RunResult` shape mirrors existing replay results; the only new field
is `CallStack: readonly number[]` (populated for `RunGroup`-failure
cases so the user can see where the cycle / depth issue happened).

### 8.3 `StepLibraryBundle` (in `src/background/recorder/step-library/bundle.ts`)

```typescript
export interface StepLibraryBundle {
  /** Build a .marco-step-library.zip for a project (or the whole DB). */
  exportZip(input: {
    ProjectId: number;
    GroupIds?: readonly number[]; // omit = all groups in project
    Now?: () => Date;            // test seam
  }): Promise<Uint8Array>;       // zip bytes

  /** Validate + import a bundle. `mode: "merge"` adds groups; `mode: "replace"` wipes and replaces the project's library. */
  importZip(input: {
    ZipBytes: Uint8Array;
    Mode: "merge" | "replace";
  }): Promise<ImportResult>;

  /** Cheap pre-import inspection — used by the UI's dry-run preview. */
  inspectZip(zipBytes: Uint8Array): Promise<BundleManifest>;
}
```

---

## 9. Acceptance Criteria

A future PR is "done" when **all** of these hold:

1. **Schema** — Running `StepLibraryDb.open()` on a fresh OPFS creates
   every table, index, trigger, and CHECK constraint listed in §5;
   `PRAGMA integrity_check` returns `ok`.
2. **Hierarchy invariants** — Inserting a group with self-parent, a
   cross-project parent, or producing depth ≥ 9 fails with the
   trigger's specific error message. Covered by unit tests.
3. **RunGroup step** — Inserting a `Step` with `StepKindId = 6` and
   `TargetStepGroupId = NULL` fails the CHECK; with a cross-project
   target fails the trigger.
4. **Recursion guard** — A → B → A `RunGroup` chain emits a
   `RunGroupCycle` failure (full report carries `SourceFile`, `Phase:
   "Replay"`, `CallStack: [A, B, A]`). Verified by a fixture in
   `failure-report-fixtures.ts` (mode parity per
   mem://features/js-step-diagnostics).
5. **Depth guard** — A 17-deep call chain emits
   `RunGroupDepthExceeded`.
6. **Batch run** — `runGroupsBatch([G1, G2])` runs G1 fully, then G2
   fully, with independent recursion guards and aggregated
   `RunResult[]`.
7. **Export** — `exportZip({ProjectId: P})` produces a zip containing
   exactly `db.sqlite` + `manifest.json`; manifest schema matches §6;
   `Sha256OfDbSqlite` matches the bytes; round-trip
   `importZip(exportZip())` is a no-op (idempotent in `merge` mode).
8. **Import safety** — Tampered `Sha256OfDbSqlite`, missing field, or
   `FormatVersion ≠ 1` rejects the import via
   `StepLibraryImportInvalid` failure report (Code Red format with
   path + what + why).
9. **UI** — The Group Library panel renders the tree (Project → Group
   → SubGroup → Step), supports rename/move/delete, exposes
   "Import .zip", "Export .zip", "Run group", "Run batch…", and
   "Export step JSON" (existing failure-export buttons unaffected).
10. **Diagnostics** — Every new failure surface has been added to
    `failure-report-fixtures.ts` in both Verbose and NonVerbose modes;
    `scripts/check-failure-log-schema.mjs` still exits 0;
    `LOG-1…LOG-6` checklist in `plan.md` is satisfied.

---

## 10. Out of Scope

- **Cross-project group references.** Forbidden by trigger and by
  spec. If users need shared groups across projects, the workflow is
  export-then-import.
- **Conflict-resolution UI for `merge` import.** v1 simply renames
  imported groups by appending ` (imported)` when a sibling-name
  collision is detected. A richer merge UI is a future phase.
- **Versioned group history / diff view.** Not in v1. The DB carries
  `CreatedAt` / `UpdatedAt` so a future feature can layer on top.

---

## 11. Cross-References

| Topic | Link |
|---|---|
| Failure-log contract | [mem://standards/verbose-logging-and-failure-diagnostics](mem://standards/verbose-logging-and-failure-diagnostics) |
| Build-time schema guard | [`scripts/check-failure-log-schema.mjs`](../../scripts/check-failure-log-schema.mjs) |
| OPFS session logging | [mem://architecture/session-logging-system](mem://architecture/session-logging-system) |
| Recorder data model | [`./03-data-model.md`](./03-data-model.md) |
| Step chaining (intra-project) | [`./14-step-chaining-and-cross-project-links.md`](./14-step-chaining-and-cross-project-links.md) |
| Database conventions | [`../04-database-conventions/`](../04-database-conventions/) |
| ZIP packaging guidelines | [`../30-import-export/`](../30-import-export/) |
