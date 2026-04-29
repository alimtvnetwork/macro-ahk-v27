# Step Group Library — ERD

**Version:** 1.0.0
**Updated:** 2026-04-26
**Companion to:** [`./16-step-group-library.md`](./16-step-group-library.md)

```mermaid
erDiagram
    Project ||--o{ StepGroup : "owns"
    StepGroup ||--o{ StepGroup : "contains (parent → child, max depth 8)"
    StepGroup ||--o{ Step : "contains"
    StepKind ||--o{ Step : "classifies"
    StepGroup ||--o{ Step : "called by RunGroup (TargetStepGroupId)"

    Project {
        INTEGER ProjectId PK
        TEXT    ProjectExternalId "UUID, unique"
        VARCHAR Name
        TEXT    CreatedAt
        TEXT    UpdatedAt
    }

    StepGroup {
        INTEGER StepGroupId PK
        INTEGER ProjectId FK
        INTEGER ParentStepGroupId FK "NULL = root"
        VARCHAR Name "unique among siblings (case-insensitive)"
        TEXT    Description
        INTEGER OrderIndex
        TINYINT IsArchived
        TEXT    CreatedAt
        TEXT    UpdatedAt
    }

    StepKind {
        TINYINT StepKindId PK
        VARCHAR Name "Click|Type|Select|JsInline|Wait|RunGroup"
    }

    Step {
        INTEGER StepId PK
        INTEGER StepGroupId FK
        INTEGER OrderIndex
        TINYINT StepKindId FK
        VARCHAR Label
        TEXT    PayloadJson
        INTEGER TargetStepGroupId FK "required iff StepKindId = RunGroup, same Project only"
        TINYINT IsDisabled
        TEXT    CreatedAt
        TEXT    UpdatedAt
    }
```

**Invariants enforced in DB**

- `TrgStepGroupNoSelfParent` — a group cannot be its own parent.
- `TrgStepGroupSameProjectParent` — parent must belong to same Project.
- `TrgStepGroupMaxDepth8` — reject inserts that produce depth ≥ 9.
- `CkStepRunGroupTarget` — `TargetStepGroupId` is `NOT NULL` iff the
  step is a `RunGroup`, else must be `NULL`.
- `TrgStepRunGroupSameProject` — `TargetStepGroupId`'s project must
  match the calling group's project (no cross-project calls).

**Invariants enforced in runtime (`StepLibraryRunner`)**

- `RunGroupCycle` — a group already on the active call stack cannot be
  re-entered.
- `RunGroupDepthExceeded` — call depth > 16 → fail.
