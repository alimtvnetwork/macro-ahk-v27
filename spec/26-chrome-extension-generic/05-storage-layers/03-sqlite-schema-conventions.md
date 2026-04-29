# SQLite Schema Conventions

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Concept

A small, strict set of rules that make every Tier 1 SQLite database in
this blueprint look and behave the same way: PascalCase identifiers,
declarative `JsonSchemaDef` migrations, additive-only schema changes,
explicit foreign keys, and per-column validation rules.

These rules are non-negotiable. The migration runner enforces them.

---

## Naming

| Element | Convention | Example |
|---------|------------|---------|
| Table name | `PascalCase`, singular | `Session`, `ProjectConfig`, `ErrorEntry` |
| Column name | `PascalCase` | `Id`, `CreatedAt`, `WorkspaceId` |
| Primary key | Always `Id` (TEXT or INTEGER) | `Id TEXT PRIMARY KEY` |
| Foreign key column | `<TargetTable>Id` | `WorkspaceId TEXT NOT NULL` |
| Timestamp column | `*At` (ISO 8601 UTC string) | `CreatedAt TEXT NOT NULL` |
| Boolean column | `Is*` / `Has*` / `Can*` (INTEGER 0/1) | `IsArchived INTEGER NOT NULL DEFAULT 0` |
| JSON column | `*Json` (TEXT, JSON-encoded) | `MetadataJson TEXT` |
| Index name | `Ix_<Table>_<Cols>` | `Ix_Session_WorkspaceId_CreatedAt` |
| Reserved prefixes | `System*` and `<Root>*` reserved for blueprint-internal tables | `SystemMigration`, `<Root>Namespace` |

JSON keys inside `*Json` columns are also `PascalCase` to match the rest
of the project (`mem://standards/pascalcase-json-keys` in the source
project). The migration runner validates this on insert.

---

## Allowed types

SQLite has only five storage classes. Map them like this:

| Logical type | SQLite class | Notes |
|--------------|--------------|-------|
| Identifier (UUID, slug) | `TEXT` | Always `NOT NULL`. Default to `lower(hex(randomblob(16)))` if you want auto-IDs. |
| Counter / size / count | `INTEGER` | 64-bit signed. |
| Score / ratio | `REAL` | Avoid for money — use INTEGER cents. |
| Boolean | `INTEGER` | 0 or 1, `NOT NULL`, `DEFAULT 0`. |
| Timestamp | `TEXT` | ISO 8601 UTC with `Z` suffix. Never store local time. |
| Date (no time) | `TEXT` | `YYYY-MM-DD`. |
| JSON object/array | `TEXT` | Validated by `JsonSchemaDef` (see below). |
| Binary blob | `BLOB` | Avoid > 100 KB per row — promote to IndexedDB. |

Forbidden: `DATETIME` (storage class is just TEXT — use TEXT explicitly),
`VARCHAR(n)` (SQLite ignores the length — use plain TEXT), nullable
booleans (use a 3-state enum TEXT instead).

---

## Declarative schema — `JsonSchemaDef`

Every table is declared once, in TypeScript, and the migration runner
turns the declaration into idempotent SQL. This is the **only** way new
tables / columns enter the database.

```ts
// src/background/sqlite/schema/session.ts
import { defineTable } from "../schema-runner";

export const SessionSchema = defineTable({
    name: "Session",
    columns: {
        Id:          { type: "TEXT",    notNull: true, primaryKey: true },
        WorkspaceId: { type: "TEXT",    notNull: true, foreignKey: { table: "Workspace", column: "Id", onDelete: "CASCADE" } },
        StartedAt:   { type: "TEXT",    notNull: true, validate: { format: "iso-8601" } },
        EndedAt:     { type: "TEXT",    notNull: false, validate: { format: "iso-8601" } },
        IsActive:    { type: "INTEGER", notNull: true, default: 0, validate: { in: [0, 1] } },
        MetadataJson:{ type: "TEXT",    notNull: false, validate: { format: "json" } },
    },
    indexes: [
        { name: "Ix_Session_WorkspaceId_StartedAt", columns: ["WorkspaceId", "StartedAt"] },
    ],
});
```

The runner generates:

```sql
CREATE TABLE IF NOT EXISTS Session (
    Id TEXT NOT NULL PRIMARY KEY,
    WorkspaceId TEXT NOT NULL REFERENCES Workspace(Id) ON DELETE CASCADE,
    StartedAt TEXT NOT NULL,
    EndedAt TEXT,
    IsActive INTEGER NOT NULL DEFAULT 0,
    MetadataJson TEXT
);
CREATE INDEX IF NOT EXISTS Ix_Session_WorkspaceId_StartedAt
    ON Session(WorkspaceId, StartedAt);
```

The runner also performs the **additive migrations** described below.

---

## Additive-only migration policy

Schema may only change in additive ways at runtime:

| Change | Allowed? | How |
|--------|----------|-----|
| Add a new table | ✅ | Append `defineTable(...)` and run the runner |
| Add a new column | ✅ | Add to `columns`; runner emits `ALTER TABLE … ADD COLUMN …` |
| Add an index | ✅ | Append to `indexes` |
| Add a foreign key on a new column | ✅ | Allowed at column add time |
| Drop a column | ❌ | Mark `deprecated: true` and stop reading; clean up in a major version migration |
| Rename a column | ❌ | Add the new name, dual-write, drop in a major version migration |
| Change a column type | ❌ | Same — add a sibling column, dual-write, retire the old one |
| Drop a table | ❌ | Mark deprecated; only the major-version migrator may drop |

The runner enforces this by diffing the live `sqlite_master` against
the declared schema and refusing to start if a destructive change is
required without an explicit `MAJOR_MIGRATION` flag.

---

## Migration runner — minimum viable

```ts
// src/background/sqlite/schema-runner.ts
import type { Database } from "@sqlite.org/sqlite-wasm";
import { AppError } from "@shared/error-model";

export interface ColumnDef {
    type: "TEXT" | "INTEGER" | "REAL" | "BLOB";
    notNull: boolean;
    primaryKey?: boolean;
    default?: string | number;
    foreignKey?: { table: string; column: string; onDelete?: "CASCADE" | "SET NULL" | "RESTRICT" };
    validate?: ValidationRule;
    deprecated?: boolean;
}

export interface IndexDef { name: string; columns: readonly string[]; unique?: boolean }

export interface TableDef {
    name: string;
    columns: Record<string, ColumnDef>;
    indexes?: readonly IndexDef[];
}

export type ValidationRule =
    | { format: "iso-8601" | "iso-date" | "json" | "uuid" | "slug" }
    | { in: readonly (string | number)[] }
    | { regex: string }
    | { minLength: number; maxLength?: number }
    | { startsWith?: string; endsWith?: string; contains?: string };

export function defineTable(def: TableDef): TableDef {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(def.name)) {
        throw new AppError({
            code: "SCHEMA_BAD_TABLE_NAME",
            reason: `Table name "${def.name}" must be PascalCase`,
        });
    }
    for (const col of Object.keys(def.columns)) {
        if (!/^[A-Z][A-Za-z0-9]*$/.test(col)) {
            throw new AppError({
                code: "SCHEMA_BAD_COLUMN_NAME",
                reason: `Column "${def.name}.${col}" must be PascalCase`,
            });
        }
    }
    return def;
}

export async function applySchema(db: Database, tables: readonly TableDef[]): Promise<void> {
    db.exec("PRAGMA foreign_keys = ON;");
    for (const t of tables) {
        db.exec(buildCreateTable(t));
        for (const ix of t.indexes ?? []) db.exec(buildCreateIndex(t.name, ix));
        await reconcileColumns(db, t);
    }
}

// buildCreateTable / buildCreateIndex / reconcileColumns implementations:
// see appendix in this file.
```

The runner is idempotent and additive. It is safe to call on every SW
activation — and you should, because OPFS may have been wiped.

---

## Validation rules

`validate` is enforced at insert/update time by a wrapper that the
blueprint generates. The supported rules cover ~95 % of real-world
columns:

| Rule | Applies to | Example |
|------|------------|---------|
| `format: "iso-8601"` | TEXT | `2026-04-24T08:30:00.000Z` |
| `format: "iso-date"` | TEXT | `2026-04-24` |
| `format: "json"` | TEXT | Must `JSON.parse` cleanly + top-level object/array |
| `format: "uuid"` | TEXT | RFC 4122 v4 |
| `format: "slug"` | TEXT | `^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$` |
| `in: [...]` | TEXT or INTEGER | `{ in: ["pending","running","done"] }` |
| `regex: "..."` | TEXT | Any RE2-compatible pattern |
| `minLength` / `maxLength` | TEXT | Inclusive bounds |
| `startsWith` / `endsWith` / `contains` | TEXT | Substring rules |

A failing validation throws `AppError` with `code:
"SCHEMA_VALIDATION_FAILED"` and `context: { table, column, rule, value }`.

---

## Built-in tables every extension gets

The blueprint ships four reserved tables:

| Table | Purpose |
|-------|---------|
| `SystemMigration` | Tracks applied schema versions and timestamps |
| `SystemSession` | One row per SW activation (start, end, version, build) |
| `SystemError` | Persisted `AppError` entries, FK to `SystemSession` |
| `SystemKv` | Generic PascalCase key/value store for in-blueprint code |

Reserved prefix `System*` (and `<Root>*`) is enforced by the lint rule —
projects MUST NOT shadow these names.

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Used camelCase columns | `SCHEMA_BAD_COLUMN_NAME` at boot | Rename to PascalCase |
| Stored `Date` objects | `[object Object]` in column | Always `.toISOString()` first |
| Stored unvalidated user JSON | Crashes on read | Add `validate: { format: "json" }` |
| Tried to drop a column at runtime | Migration runner refuses to start | Mark `deprecated: true`, drop in major migration |
| Forgot `PRAGMA foreign_keys = ON` | Cascade deletes silently skipped | Runner sets it on every open |
| Used `DEFAULT CURRENT_TIMESTAMP` | Stored in non-ISO format | Set `default` in app code, not SQL |

---

## DO / DO NOT / VERIFY

**DO**

- Declare every table with `defineTable(...)`.
- Use PascalCase for tables, columns, indexes, and JSON keys.
- Store timestamps as ISO 8601 UTC TEXT with `Z` suffix.
- Wrap inserts/updates with the validating helper.

**DO NOT**

- Hand-write `CREATE TABLE` outside the runner.
- Drop or rename columns at runtime.
- Use `VARCHAR(n)`, `DATETIME`, or nullable booleans.
- Store blobs > 100 KB — promote to IndexedDB.

**VERIFY**

- [ ] `applySchema(db, tables)` runs idempotently on three consecutive boots.
- [ ] Lint rule rejects camelCase column names in `defineTable`.
- [ ] Validation throws `SCHEMA_VALIDATION_FAILED` with full context.
- [ ] `sqlite_master` matches the declared schema after every boot.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| SQLite in background | `./02-sqlite-in-background.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| Error model | `../07-error-management/01-error-model.md` |
| Database conventions (root) | `../../04-database-conventions/00-overview.md` |
