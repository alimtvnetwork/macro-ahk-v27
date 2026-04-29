# Spec 90 — Namespace-Based Database Creation

**Priority**: Medium  
**Status**: Defined  
**Depends On**: Spec 67 (Project-Scoped Database)

---

## Overview

Users can create additional databases within a project using a dot-separated namespace convention. Each project starts with default databases (ProjectKv, ProjectMeta) and supports up to 25 user-created databases.

---

## Namespace Format

### Convention

Namespaces follow the **dot-separated** format matching the existing `ProjectKvStore` convention:

```
<Owner>.<Category>[.<SubCategory>]
```

### Examples

| Namespace | Purpose |
|-----------|---------|
| `MyPlugin.Config` | Plugin configuration store |
| `Scraper.Results` | Scraper output data |
| `Analytics.Events` | Event tracking database |
| `Forms.Submissions.2025` | Yearly form submissions |

### Rules

1. **Format**: Must match `^[A-Z][a-zA-Z0-9]*(\.[A-Z][a-zA-Z0-9]*){1,4}$`
   - Minimum 2 segments (e.g., `Owner.Name`)
   - Maximum 5 segments
   - Each segment starts with an uppercase letter (PascalCase)
   - Only alphanumeric characters within segments
2. **Length**: Namespace string must be 3–100 characters total
3. **Uniqueness**: Namespace + DatabaseName must be unique per project

### Reserved Prefixes

The following prefixes are reserved for system use and **cannot** be used in user-created databases:

| Prefix | Owner |
|--------|-------|
| `System.*` | Internal extension infrastructure |
| `Marco.*` | Marco extension core features |

Attempting to create a database with a reserved prefix returns a validation error.

---

## Database Limit

- **Maximum**: 25 user-created databases per project
- Default databases (ProjectKv, ProjectMeta) do not count toward this limit
- When the limit is reached, the "Create Database" button is disabled with a tooltip explaining the limit

---

## Creation UX

### Inline Form

The creation form is an expandable inline section within the Database panel, similar to the existing "Create Table" form.

### Form Fields

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| Namespace | Text input | Yes | PascalCase dot-separated, 2–5 segments, no reserved prefixes |
| Database Name | Text input | Yes | PascalCase, 1–50 chars, unique within namespace |
| Database Kind | Select | Yes | KeyValue, Relational, Config |
| Description | Text input | No | Max 200 chars |

### UX Flow

```
1. User clicks "Create Database" button
2. Inline form expands below the button
3. User enters Namespace (with live validation)
4. User enters Database Name
5. User selects Database Kind from dropdown
6. User optionally adds Description
7. User clicks "Create"
8. System validates all fields
9. System creates tables based on kind:
   - KeyValue → creates KeyValueStore table
   - Relational → creates empty schema (user adds tables later)
   - Config → creates ConfigStore table
10. System registers in ProjectDatabases
11. Table list refreshes
12. Success toast shown
```

### Validation Feedback

- Real-time inline validation as user types
- Red border + error message below field on invalid input
- Reserved prefix warning shown immediately (not just on submit)
- Duplicate namespace+name check against existing databases

---

## Database Kind Schemas

### KeyValue (auto-created tables)

```sql
CREATE TABLE IF NOT EXISTS KeyValueStore (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Namespace TEXT NOT NULL DEFAULT 'default',
    Key       TEXT NOT NULL,
    Value     TEXT,
    ValueType TEXT NOT NULL DEFAULT 'text',
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Relational

No tables auto-created. User defines schema via the Tables or Schema tabs.

### Config

```sql
CREATE TABLE IF NOT EXISTS ConfigStore (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Section   TEXT NOT NULL DEFAULT 'general',
    Key       TEXT NOT NULL,
    Value     TEXT,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(Section, Key)
);
```

---

## Registration

Every created database is registered in the `ProjectDatabases` table:

```sql
INSERT INTO ProjectDatabases (DatabaseName, Namespace, DatabaseKindId, IsDefault, Description)
VALUES ('MyStore', 'MyPlugin.Config', 1, 0, 'Custom key-value store');
```

---

## Deletion

- User-created databases can be deleted via the existing drop flow
- Default databases (IsDefault = 1) cannot be deleted — the drop button is hidden
- Deleting a database removes its tables and its ProjectDatabases registry row

---

## Acceptance Criteria

1. [ ] Namespace validation enforces PascalCase dot-separated format (2–5 segments)
2. [ ] Reserved prefixes (System.*, Marco.*) are rejected with clear error
3. [ ] Maximum 25 user-created databases per project enforced
4. [ ] Inline creation form with live validation
5. [ ] KeyValue and Config kinds auto-create their schema tables
6. [ ] Created databases registered in ProjectDatabases
7. [ ] Default databases cannot be deleted
