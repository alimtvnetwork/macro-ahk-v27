# Lovable User Add — Acceptance Criteria

**Spec revision**: v2 (2026-04-24)

1. CSV with columns `LoginEmail, InviteEmail, RoleCode` (+ optional `Password`, `Notes`) is accepted; missing required columns rejected with a clear validation error.
2. `RoleCode` is validated against enum `MembershipRoleCode = { Owner, Admin, Member }`. `Editor` is normalized to `Member` at parse time (Lovable API convention).
3. If a row's `RoleCode` is empty, the task `DefaultRoleId` is used. If neither is set, validation fails with a clear message.
4. SQLite tables `UserAddTask`, `UserAddRow`, `TaskStatus`, `MembershipRole`, `XPathSetting` are created on first load via core SDK migration.
5. `MembershipRole` is seeded on first run with rows `Owner`, `Admin`, `Member`.
6. Login flow, session-cookie bearer derivation, workspace resolution, and sign-out behave identically to `Lovable Owner Switch`.
7. **Step A — POST membership** is sent for every row:
   ```
   POST {ApiBase}/workspaces/{WorkspaceId}/memberships
   { "Email": "<InviteEmail>", "Role": "<RoleForPostStep>" }
   ```
   where `RoleForPostStep` = `Admin` for Admin rows, `Member` for Member rows, and `Member` for Owner rows (Owner is not directly assignable at POST time).
8. **Step B — Owner promotion** runs **only** when `RoleCode = Owner`, and consists of:
   1. `GET {ApiBase}/workspaces/{WorkspaceId}/memberships` to resolve the new `UserId` for `InviteEmail`.
   2. `PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}` with body `{"Role":"Owner"}`.
   This call MUST go through the same `LovableApiClient.promoteToOwner(...)` method used by `Lovable Owner Switch` — no duplicate REST code.
9. On Step A success and (when applicable) Step B success → row marked `IsDone = true`. On any failure in either step → `HasError = true`, `LastError` populated with the full stack, and execution stops for that row before sign-out.
10. Sign-out runs after every row regardless of success/failure (Profile → wait for Sign Out → click → delay).
11. XPaths and delays are editable in the popup UI and persisted to SQLite; Reset restores code defaults from `lovable-common-xpath`.
12. `WorkspaceId` is cached per `LoginEmail` via the root SDK so back-to-back rows in the same task skip the workspace lookup.
13. Logs are written per task (under `logs/`) and viewable + copy-to-clipboard from the popup. Step A and Step B emit distinct log lines so failures are unambiguous.
14. The shared `lovable-common-xpath` module is consumed by both `Lovable Owner Switch` and `Lovable User Add` — no duplicated XPaths or default delays.
15. Coding rules from `../70-lovable-owner-switch/05-coding-rules-recap.md` apply unchanged: no `!important`, no inline `<style>`, no `as` casts, no `unknown`, no magic strings, ≤100-line files, ≤15-line functions, class-based, blank line before return, pre-write standards check, no unjustified `requestAnimationFrame`, every try/catch logs via `RiseupAsiaMacroExt.Logger.error()`.
