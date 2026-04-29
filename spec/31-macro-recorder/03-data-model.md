# Data Model — Macro Recorder

**Version:** 1.0.0
**Updated:** 2026-04-26
**Phase:** 03 (Data Model Design)
**Authoritative ERD:** [`./03-erd.md`](./03-erd.md)

---

## Conventions Applied

This schema follows `spec/04-database-conventions/`:

- **Singular** table names (`Step`, never `Steps`)
- **PascalCase** for all tables, columns, indexes, views, JSON keys
- PK = `{TableName}Id`, always `INTEGER PRIMARY KEY AUTOINCREMENT`
- FK reuses the exact PK name (no `_id`, no `fk_`)
- Booleans use `Is`/`Has` prefix, positive-only names
- Smallest practical integer type for category-like columns: `TINYINT` for ≤127 values, `SMALLINT` otherwise
- Every `Type`/`Status`/`Kind`/`Category` column → its own normalised lookup table + matching code Enum
- Per-row audit columns (`CreatedAt`, `UpdatedAt`) on every business table; lookup tables omit them

---

## Table Catalog (Summary)

| # | Table | Purpose | Row Volume Class |
|---|-------|---------|------------------|
| 1 | `Project` | Top-level macro container owned by one user | 10² per user |
| 2 | `DataSourceKind` | Enum lookup: `Csv`, `Json` | 2 rows |
| 3 | `DataSource` | A dropped CSV/JSON file linked to a Project | 10¹ per Project |
| 4 | `SelectorKind` | Enum lookup: `XPathFull`, `XPathRelative`, `Css`, `Aria` | 4 rows |
| 5 | `Selector` | XPath / CSS expression for a Step, with optional anchor | 1..n per Step |
| 6 | `StepKind` | Enum lookup: `Click`, `Type`, `Select`, `JsInline`, `Wait` | 5 rows |
| 7 | `StepStatus` | Enum lookup: `Draft`, `Active`, `Disabled` | 3 rows |
| 8 | `Step` | One recorded interaction within a Project | 10² per Project |
| 9 | `FieldBinding` | Links a Step to a DataSource column for replay substitution | 0..1 per Step |

---

## 1. `Project`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `ProjectId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `Name` | `VARCHAR(120)` | `NOT NULL` | Display name |
| `OwnerUserId` | `UUID` | `NOT NULL`, FK → `auth.users.id` | RLS anchor |
| `IsArchived` | `TINYINT` | `NOT NULL DEFAULT 0` | Boolean stored as TINYINT (0/1) |
| `CreatedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | |
| `UpdatedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | Trigger-maintained |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxProjectOwnerUser` | `OwnerUserId` | RLS owner-scoped query |
| `IxProjectOwnerNameUnique` | `OwnerUserId, Name` (unique) | Prevent name collisions per owner |

---

## 2. `DataSourceKind` (Lookup)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `DataSourceKindId` | `TINYINT` | `PRIMARY KEY AUTOINCREMENT` | |
| `Name` | `VARCHAR(20)` | `NOT NULL UNIQUE` | `Csv`, `Json` |

**Seed Rows**

| `DataSourceKindId` | `Name` |
|---|---|
| 1 | `Csv` |
| 2 | `Json` |

**Code Enum**

```typescript
enum DataSourceKindId {
  Csv = 1,
  Json = 2,
}
```

---

## 3. `DataSource`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `DataSourceId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `ProjectId` | `INTEGER` | `NOT NULL`, FK → `Project.ProjectId` | `ON DELETE CASCADE` |
| `DataSourceKindId` | `TINYINT` | `NOT NULL`, FK → `DataSourceKind.DataSourceKindId` | |
| `FilePath` | `VARCHAR(255)` | `NOT NULL` | `/uploads/DataSources/{ProjectId}/{DataSourceId}.{Ext}` |
| `Columns` | `JSON` | `NOT NULL` | PascalCase array of column names |
| `RowCount` | `INTEGER` | `NOT NULL DEFAULT 0` | Cached at upload |
| `CreatedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxDataSourceProject` | `ProjectId` | Per-Project listing |

---

## 4. `SelectorKind` (Lookup)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `SelectorKindId` | `TINYINT` | `PRIMARY KEY AUTOINCREMENT` | |
| `Name` | `VARCHAR(20)` | `NOT NULL UNIQUE` | |

**Seed Rows**

| `SelectorKindId` | `Name` |
|---|---|
| 1 | `XPathFull` |
| 2 | `XPathRelative` |
| 3 | `Css` |
| 4 | `Aria` |

**Code Enum**

```typescript
enum SelectorKindId {
  XPathFull = 1,
  XPathRelative = 2,
  Css = 3,
  Aria = 4,
}
```

---

## 5. `Selector`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `SelectorId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `StepId` | `INTEGER` | `NOT NULL`, FK → `Step.StepId` | `ON DELETE CASCADE` |
| `SelectorKindId` | `TINYINT` | `NOT NULL`, FK → `SelectorKind.SelectorKindId` | |
| `Expression` | `TEXT` | `NOT NULL` | The XPath/CSS string |
| `AnchorSelectorId` | `INTEGER` | `NULL`, FK → `Selector.SelectorId` | Self-FK; only set when `SelectorKindId = XPathRelative` |
| `IsPrimary` | `TINYINT` | `NOT NULL DEFAULT 0` | One primary per Step |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxSelectorStep` | `StepId` | Resolve Step → selectors |
| `IxSelectorAnchor` | `AnchorSelectorId` | Anchor reverse-lookup |

**Constraints**

- `CHECK (AnchorSelectorId IS NULL OR SelectorKindId = 2)` — anchors only valid for `XPathRelative`
- Partial unique index: `(StepId) WHERE IsPrimary = 1` — exactly one primary selector per Step

---

## 6. `StepKind` (Lookup)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `StepKindId` | `TINYINT` | `PRIMARY KEY AUTOINCREMENT` | |
| `Name` | `VARCHAR(20)` | `NOT NULL UNIQUE` | |

**Seed Rows**

| `StepKindId` | `Name` |
|---|---|
| 1 | `Click` |
| 2 | `Type` |
| 3 | `Select` |
| 4 | `JsInline` |
| 5 | `Wait` |

**Code Enum**

```typescript
enum StepKindId {
  Click = 1,
  Type = 2,
  Select = 3,
  JsInline = 4,
  Wait = 5,
}
```

---

## 7. `StepStatus` (Lookup)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `StepStatusId` | `TINYINT` | `PRIMARY KEY AUTOINCREMENT` | |
| `Name` | `VARCHAR(20)` | `NOT NULL UNIQUE` | |

**Seed Rows**

| `StepStatusId` | `Name` |
|---|---|
| 1 | `Draft` |
| 2 | `Active` |
| 3 | `Disabled` |

**Code Enum**

```typescript
enum StepStatusId {
  Draft = 1,
  Active = 2,
  Disabled = 3,
}
```

---

## 8. `Step`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `StepId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `ProjectId` | `INTEGER` | `NOT NULL`, FK → `Project.ProjectId` | `ON DELETE CASCADE` |
| `StepKindId` | `TINYINT` | `NOT NULL`, FK → `StepKind.StepKindId` | |
| `StepStatusId` | `TINYINT` | `NOT NULL DEFAULT 1`, FK → `StepStatus.StepStatusId` | Default = `Draft` |
| `OrderIndex` | `INTEGER` | `NOT NULL` | Sparse integer (gaps OK), reordered client-side |
| `VariableName` | `VARCHAR(80)` | `NOT NULL` | PascalCase, unique per Project |
| `Label` | `VARCHAR(160)` | `NOT NULL` | Closest label/aria/placeholder text snapshot |
| `InlineJs` | `TEXT` | `NULL` | Body for `StepKindId = JsInline` only |
| `IsBreakpoint` | `TINYINT` | `NOT NULL DEFAULT 0` | Pause replay before executing |
| `CapturedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | |
| `UpdatedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | Trigger-maintained |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxStepProject` | `ProjectId` | Per-Project listing |
| `IxStepProjectOrder` | `ProjectId, OrderIndex` | Ordered fetch |
| `IxStepProjectVarUnique` | `ProjectId, VariableName` (unique) | Enforce variable uniqueness per Project |

**Constraints**

- `CHECK (InlineJs IS NULL OR StepKindId = 4)` — `InlineJs` only valid for `JsInline` steps

---

## 9. `FieldBinding`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `FieldBindingId` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | |
| `StepId` | `INTEGER` | `NOT NULL UNIQUE`, FK → `Step.StepId` | `ON DELETE CASCADE`; one binding per Step |
| `DataSourceId` | `INTEGER` | `NOT NULL`, FK → `DataSource.DataSourceId` | `ON DELETE RESTRICT` |
| `ColumnName` | `VARCHAR(80)` | `NOT NULL` | PascalCase; must exist in `DataSource.Columns` (validated app-side) |
| `CreatedAt` | `TIMESTAMP` | `NOT NULL DEFAULT now()` | |

**Indexes**

| Index | Columns | Purpose |
|---|---|---|
| `IxFieldBindingDataSource` | `DataSourceId` | "Where is this column used?" |

---

## Replay Resolution Order (Phase 09 Contract Preview)

For each `Step` in `OrderIndex` ascending:

1. Skip if `StepStatusId = Disabled`.
2. Resolve primary `Selector` for the Step (`IsPrimary = 1`). If `XPathRelative`, walk `AnchorSelectorId` chain to a resolvable ancestor.
3. If `FieldBinding` exists, read the row from `DataSource.FilePath` (offset = current replay row), look up `ColumnName`, and substitute the value into the action.
4. Dispatch by `StepKindId`. For `JsInline`, evaluate `InlineJs` in the sandbox.
5. If `IsBreakpoint = 1`, pause before executing.

Full contract is finalised in Phase 09.

---

## Cross-References

| Reference | Location |
|---|---|
| ERD | [`./03-erd.md`](./03-erd.md) |
| DB conventions (golden rules) | `../04-database-conventions/00-overview.md` |
| Naming conventions | `../04-database-conventions/01-naming-conventions.md` |
| Schema design (key sizing, FKs) | `../04-database-conventions/02-schema-design.md` |
| Glossary | [`./01-glossary.md`](./01-glossary.md) |
| Phase plan | [`./02-phases.md`](./02-phases.md) |
| Performance constraints (PERF-R1, R2) | `../32-app-performance/01-performance-findings.md` |
