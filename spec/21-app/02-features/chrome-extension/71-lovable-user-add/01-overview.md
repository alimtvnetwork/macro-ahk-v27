# Lovable User Add — Overview

**Status**: 📋 Pending (spec-only, deferred for later implementation)
**Spec revision**: v2 (2026-04-24) — adds `MembershipRole` lookup, `DefaultRoleId`, and **two-step Owner promotion** (add as Member/Editor, then PUT to Owner via the Owner Switch path).
**Project type**: Standalone script inside the macro Chrome extension
**Companion project**: `Lovable Owner Switch` (see `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/`)
**Shared module**: `Lovable Common XPath`

---

## 1. Purpose

Bulk-add new users to a Lovable workspace by email, with a chosen role
(`Admin`, `Member`, or `Owner`). Driven from a CSV uploaded by the user.

The login + session-cookie + bearer-token + sign-out machinery is identical
to `Lovable Owner Switch`. Only the per-row REST sequence differs, and the
CSV column set adds `RoleCode`.

## 2. Project identity

| Field | Value |
|---|---|
| Project name | `Lovable User Add` |
| Script slug | `lovable-user-add` |
| Lives under | `standalone-scripts/lovable-user-add/` |
| Shared XPath module | `lovable-common-xpath` (same module as `Lovable Owner Switch`) |
| Default URL targets | `https://lovable.dev/login`, `https://api.lovable.dev/*` |
| Default browser mode | Incognito (toggle exposed in popup) |

## 3. Difference vs. Lovable Owner Switch

| Aspect | Owner Switch | User Add |
|---|---|---|
| Pre-condition | Target user is already a workspace member | Target user is **not yet** a member |
| Primary REST verb / path | `PUT .../memberships/{UserId}` | `POST .../memberships` |
| Primary REST body | `{"Role":"Owner"}` | `{"Email":"<addr>","Role":"<Admin\|Member>"}` |
| When `RoleCode = Owner` | n/a (already a single PUT) | **Two-step**: POST as `Member`, then resolve `UserId`, then PUT `{"Role":"Owner"}` (delegates step 2 to the Owner Switch REST contract) |
| User ID lookup needed? | Yes (email → UserId) | Only when promoting to Owner — fetch memberships after POST to resolve the new `UserId` |
| CSV columns | LoginEmail, Password, OwnerEmail1, OwnerEmail2, Notes | LoginEmail, Password, InviteEmail, RoleCode, Notes |

## 4. End-to-end flow (one row)

1. **Pre-flight**
   - Validate row: `LoginEmail` + `InviteEmail` + resolved `RoleCode`.
   - Resolve effective password (row → fallback to common password).
   - Resolve effective role (row `RoleId` → fallback to task `DefaultRoleId`).
2. **Launch** browser (incognito if enabled), navigate to `LoginUrl`.
3. **Login** (`LoginEmailInput` → `ContinueButton` → `PasswordInput` → `LoginButton`).
4. **Confirm** session via `WorkspaceButton` XPath (retry until visible).
5. **Bearer** — read Lovable session cookie, derive bearer token (same as Macro Controller).
6. **Workspace** resolution: `GET {ApiBase}/workspaces` → resolve current `WorkspaceId` (cache it per `LoginEmail`).
7. **Add member (always Step A)**:
   ```
   POST {ApiBase}/workspaces/{WorkspaceId}/memberships
   { "Email": "<InviteEmail>", "Role": "<RoleForPostStep>" }
   ```
   where `RoleForPostStep`:
   - `Admin` if effective role = `Admin`
   - `Member` if effective role = `Member`
   - `Member` if effective role = `Owner` (Owner cannot be assigned at POST time — Step B promotes)
8. **Promote to Owner (Step B — only when `RoleCode = Owner`)**:
   1. `GET {ApiBase}/workspaces/{WorkspaceId}/memberships` → find membership for `InviteEmail` → extract `UserId`.
   2. `PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}` body `{"Role":"Owner"}`.
   - This step **reuses** the exact REST contract documented in
     `../70-lovable-owner-switch/03-xpaths-and-defaults.md` §"Promote member
     to Owner / Admin / Editor (member)". Implementations MUST share the
     same `LovableApiClient` class — do not duplicate.
9. **Mark row** — on 2xx (Step A and, when applicable, Step B) → `IsDone = true`. On any error → `HasError = true`, `LastError = <stack>`.
10. **Sign out** — Profile → Sign Out (same as Owner Switch).
11. Next row.

### Execution diagram

```
[Validate row]
      │
      ▼
[Open Lovable login (incognito)]
      │
      ▼
[Email → Continue → Password → Login]
      │
      ▼
[Wait for WorkspaceButton]
      │
      ▼
[Read cookie → bearer token]
      │
      ▼
[GET workspaces → resolve WorkspaceId]
      │
      ▼
[Step A: POST memberships {Email, RoleForPostStep}]
      │
      ├──── err ──► Mark HasError + log → Sign out → next row
      │
      ▼
   RoleCode == Owner ?
      │
      ├── No ──► Mark IsDone ──► Sign out → next row
      │
      └── Yes ─► [Step B-1: GET memberships → resolve new UserId]
                       │
                       ▼
                [Step B-2: PUT memberships/{UserId} {"Role":"Owner"}]
                       │
                       ├── 2xx ─► Mark IsDone
                       │
                       └── err ─► Mark HasError + log
                       │
                       ▼
                  Sign out → next row
```

## 5. CSV columns

| Column | Required | Notes |
|---|---|---|
| LoginEmail | Yes | Lovable controller account used to perform the invite |
| Password | No | Optional; falls back to common-password UI text box |
| InviteEmail | Yes | Email to add to the workspace |
| RoleCode | Conditional | Enum `Owner` / `Admin` / `Member`. If omitted, falls back to task `DefaultRoleId` chosen in the popup. If neither is set → validation fails. |
| Notes | No | Free text |

## 6. Database schema (PascalCase)

Per `mem://architecture/storage/database-naming-convention`. SQLite, project-scoped, created on first load via core SDK migration.

### Master — `UserAddTask`

| Field | Type | Notes |
|---|---|---|
| Id | Integer | PK, auto-increment |
| Name | Text | User-editable; auto-derived from filename |
| SourceFile | Text | Relative path under `uploads/` |
| CreatedAt | DateTime | UTC ISO-8601 |
| StatusId | Integer | FK → `TaskStatus.Id` |
| DefaultRoleId | Integer | FK → `MembershipRole.Id` (used when row `RoleId` is null) |

### Child — `UserAddRow`

| Field | Type | Notes |
|---|---|---|
| Id | Integer | PK, auto-increment |
| TaskId | Integer | FK → `UserAddTask.Id` |
| LoginEmail | Text | Required |
| Password | Text | Optional; nullable |
| InviteEmail | Text | Required |
| RoleId | Integer | FK → `MembershipRole.Id`; null → use task `DefaultRoleId` |
| Notes | Text | Nullable |
| IsDone | Boolean | Default `false` (pending = `!IsDone`, computed) |
| HasError | Boolean | Default `false` |
| LastError | Text | Nullable |
| ResolvedUserId | Text | Nullable; cached after Step B-1 (only populated when role = Owner) |
| WorkspaceId | Text | Nullable; cached after Step 6 |

### Lookup — `TaskStatus`

| Field | Type |
|---|---|
| Id | Integer (PK) |
| Code | Text — Enum: `Pending`, `Running`, `Completed`, `Failed` |

### Lookup — `MembershipRole`

| Field | Type |
|---|---|
| Id | Integer (PK) |
| Code | Text — Enum: `Owner`, `Admin`, `Member` |

> **Seed**: `MembershipRole` is seeded with all three rows on first run. `Member` is the canonical code for the "Editor" role (Lovable API treats them as synonyms).

### Settings — `XPathSetting`

Shared definition with Owner Switch (`KeyCode`, `Value`, `DelayMs`, `IsCustomized`). Both projects share defaults from the `lovable-common-xpath` module.

## 7. Configurable URLs and browser launch

| Key | Default |
|---|---|
| LoginUrl | `https://lovable.dev/login` |
| ApiBase | `https://api.lovable.dev` |
| OpenIncognito | `true` |

Per-step delays come from `XPathSetting.DelayMs`.

## 8. Caching (root SDK)

1. `Cache.Add(Key, Value, TtlMs?)`
2. `Cache.Read(Key)`
3. `Cache.Remove(Key)`
4. Backed by IndexedDB, namespaced per project.
5. Cache `WorkspaceId` per `LoginEmail` to skip the workspace lookup on repeat runs in the same task batch.

## 9. Frontend (Popup UI)

1. Header: project name `Lovable User Add`.
2. **File section**: Upload (CSV-only constraint with required columns), file manager listing only this project's `uploads/`, selected-file preview with row/column count.
3. **Task section**:
   - Task name (auto-filled from filename, editable)
   - Common password (optional fallback)
   - Default role select — `Admin` / `Member` / `Owner` — used when CSV omits `RoleCode`
   - Incognito toggle (default on)
   - Login URL input (advanced, collapsible)
4. **Rows table**: parsed rows with resolved-role chip, status chip per row, run-single + run-all buttons.
5. **Settings section** (collapsible): XPath + delay editor, Reset to defaults.
6. **Logs section**: tail of latest log file, copy-to-clipboard.

UI uses a clean minimal theme; all form fields explicitly labeled, required fields marked. No inline `<style>` (per `mem://standards/standalone-scripts-css-in-own-file`).

## 10. Coding rules (recap)

Same as `../70-lovable-owner-switch/05-coding-rules-recap.md`. Key points:

- PascalCase tables/columns/JSON.
- Enums for `TaskStatus`, `MembershipRole`, `XPathKeyCode`, `UploadFileType` — never magic strings.
- Class-based modules; ≤ 100 lines per file. Entry class `LovableUserAdd`. Helpers (`UserAddRunner`, `RowExecutor`, `OwnerPromotionStep`, `LovableApiClient`, `SignOutFlow`) constructor-injected.
- Functions ≤ 8 lines (max 12–15).
- No `any`, no `unknown` (except `CaughtError`); no `as` casts.
- Every try/catch logs via `RiseupAsiaMacroExt.Logger.error()`.
- No `!important`, CSS in own file, blank line before every `return`, no unjustified `requestAnimationFrame`.

## 11. Shared `LovableApiClient` contract

To prevent the two-step Owner promotion from drifting:

- `LovableApiClient` lives in **either** `lovable-common-xpath` **or** a new shared module (`lovable-common-api`, decided at implementation time).
- Both `Lovable Owner Switch` and `Lovable User Add` consume the same client.
- Methods:
  - `getCurrentWorkspaceId(): Promise<string>`
  - `listMemberships(workspaceId): Promise<Membership[]>`
  - `findUserIdByEmail(workspaceId, email): Promise<string>`
  - `addMembership(workspaceId, email, role): Promise<Membership>` — Step A
  - `promoteToOwner(workspaceId, userId): Promise<void>` — Step B-2 (the same call Owner Switch already uses)

## 12. References

- Verbatim transcript (v2 brief): `99-verbatim.md`
- Coding rules: `../70-lovable-owner-switch/05-coding-rules-recap.md`
- Shared XPaths and Owner-promote REST contract: `../70-lovable-owner-switch/03-xpaths-and-defaults.md`

---

> **Status note**: Spec-only. Do NOT implement until explicitly scheduled in `.lovable/plan.md`. The agent must NOT auto-recommend implementation.
