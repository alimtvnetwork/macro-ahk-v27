---
name: step-group-library-spec
description: Step Group Library spec + initial SQLite DB layer — Project → StepGroup (max depth 8) → Step, RunGroup step kind 6, ZIP export = db.sqlite + manifest.json
type: feature
---

Spec: `spec/31-macro-recorder/16-step-group-library.md` + `16-step-group-library-erd.md`.

**Hierarchy (locked):** Project → StepGroup → SubGroup → Step. Max nesting depth 8 (DB trigger). Steps belong to exactly one group.

**RunGroup (StepKindId=6):** new step kind that invokes another group inline. Same-project only (CHECK + trigger). Recursion guard + max call depth 16 enforced at runtime (`StepLibraryRunner` — pending).

**Batch run:** `runGroupsBatch(orderedGroupIds)` — sequential, fresh recursion guard per group. Not recorded as a step.

**SQLite runtime:** sql.js (already installed) + OPFS at `/marco/step-library.sqlite`. Wrapper: `src/background/recorder/step-library/db.ts` (sync — sql.js is sync; OPFS persistence layer wraps it).

**Schema:** `src/background/recorder/step-library/schema.ts` — `STEP_LIBRARY_SCHEMA_VERSION=1`, `MAX_GROUP_NESTING_DEPTH=8`, `MAX_RUN_GROUP_CALL_DEPTH=16`, `StepKindId` enum. Tables: Project, StepGroup, StepKind, Step, SchemaMigration. Triggers: TrgStepGroupNoSelfParent, TrgStepGroupSameProjectParent, TrgStepGroupMaxDepth8, TrgStepRunGroupSameProject. CHECK: CkStepRunGroupTarget.

**ZIP bundle (.marco-step-library.zip):** db.sqlite + manifest.json (Format, FormatVersion=1, Generator, ExportedAt, Project{ExternalId,Name}, GroupIds, Counts, SchemaUserVersion, Sha256OfDbSqlite). Importer rejects on missing field / version mismatch / sha mismatch via `StepLibraryImportInvalid` failure.

**Failure reasons (added):** `RunGroupCycle`, `RunGroupDepthExceeded`, `StepLibraryImportInvalid` — all flow through `buildFailureReport()`.

**Status:** Spec + DB layer + 19 tests done (2026-04-26). Runner, ZIP bundler, UI panel all pending.
