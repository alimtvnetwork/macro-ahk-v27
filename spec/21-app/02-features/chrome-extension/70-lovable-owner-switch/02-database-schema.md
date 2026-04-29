# Lovable Owner Switch — Database Schema

All identifiers PascalCase per `mem://architecture/storage/database-naming-convention`.
SQLite, project-scoped, created on first load via core SDK migration.

---

## Master table — `OwnerSwitchTask`

| Field | Type | Notes |
|---|---|---|
| Id | Integer | Primary key, auto-increment |
| Name | Text | User-editable; auto-derived from filename |
| SourceFile | Text | Relative path under `uploads/` |
| CreatedAt | DateTime | UTC ISO-8601 |
| StatusId | Integer | FK → `TaskStatus.Id` |

## Child table — `OwnerSwitchRow`

| Field | Type | Notes |
|---|---|---|
| Id | Integer | Primary key, auto-increment |
| TaskId | Integer | FK → `OwnerSwitchTask.Id` |
| LoginEmail | Text | Required |
| Password | Text | Optional; nullable; fallback to common-password UI field |
| OwnerEmail1 | Text | Required |
| OwnerEmail2 | Text | Nullable |
| Notes | Text | Nullable |
| IsDone | Boolean | Default `false` (pending = `!IsDone`, computed) |
| HasError | Boolean | Default `false` |
| LastError | Text | Nullable |
| ResolvedUserId1 | Text | Nullable; cached after lookup |
| ResolvedUserId2 | Text | Nullable; cached after lookup |
| WorkspaceId | Text | Nullable; cached after lookup |

## Lookup table — `TaskStatus`

| Field | Type |
|---|---|
| Id | Integer (PK) |
| Code | Text — Enum: `Pending`, `Running`, `Completed`, `Failed` |

## Settings table — `XPathSetting`

| Field | Type | Notes |
|---|---|---|
| Id | Integer | PK |
| KeyCode | Text | Enum identifier (e.g. `LoginEmailInput`) |
| Value | Text | XPath expression |
| DelayMs | Integer | Wait after action |
| IsCustomized | Boolean | If true, do not overwrite on Reset unless explicit |

---

## Migration semantics

- All tables created on first component load via core SDK migration.
- Reset action restores `XPathSetting.Value` and `DelayMs` from the seed
  defaults in `03-xpaths-and-defaults.md` only for rows where
  `IsCustomized = false`, unless the user confirms a hard reset.
