# Lovable Owner Switch — Acceptance Criteria

1. User can upload a CSV and see it under `uploads/` with sequence prefix and slug name (`01-my-list.csv`, `02-my-list.csv`).
2. File manager lists only this project's `uploads/` folder and supports single + multi-select.
3. CSV validation rejects files missing `LoginEmail` or `OwnerEmail1`.
4. SQLite tables `OwnerSwitchTask`, `OwnerSwitchRow`, `TaskStatus`, `XPathSetting` are created on first load via core SDK migration.
5. Running a row opens incognito Chrome (when toggle on), logs into Lovable, and confirms login by waiting on `WorkspaceButton`.
6. Bearer token is read from the Lovable session cookie without re-prompting the user.
7. `PUT /workspaces/{WorkspaceId}/memberships/{UserId}` is sent with body `{"Role":"Owner"}` for each Owner email in the row.
8. On success, the row is marked `IsDone = true`; on failure, `HasError = true` and `LastError` populated with the full stack.
9. Sign-out sub-flow runs after every row, regardless of success/failure (Profile → wait for Sign Out → click → delay).
10. XPaths and delays are editable in the popup UI and persisted to SQLite; Reset restores code defaults.
11. Logs are written per task (under `logs/`) and viewable + copy-to-clipboard from the popup.
12. No file exceeds 100 lines; no function exceeds 15 lines; no `any` / `unknown` in the codebase (per `mem://standards/unknown-usage-policy`).
13. No `!important`; no inline `<style>`; CSS lives in `css/lovable-owner-switch.css` (per `mem://standards/no-css-important` + `mem://standards/standalone-scripts-css-in-own-file`).
14. Single default class `LovableOwnerSwitch`; helpers (`OwnerSwitchRunner`, `RowExecutor`, `SignOutFlow`, `LovableApiClient`) constructor-injected (per `mem://standards/class-based-standalone-scripts`).
15. All selectors, class names, event names, role values, status values come from enums — no magic strings (per `mem://standards/code-quality-improvement`).
16. No `as` casts and no `as unknown` (per `mem://standards/no-type-casting`).
17. Every `try/catch` logs via `RiseupAsiaMacroExt.Logger.error()` with file path, missing item, and reason — never swallows (per `mem://standards/error-logging-via-namespace-logger.md` + `mem://standards/no-error-swallowing`).
18. Every `return` is preceded by a blank line (per `mem://standards/blank-line-before-return`).
