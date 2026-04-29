# Lovable Owner Switch + User Add — 20-Phase Implementation Plan

**Created**: 2026-04-24 (Asia/Kuala_Lumpur)
**Status**: 📋 Pending — execute one phase per `next` command.
**Scope**: Implements three pending specs together because they share the same
shared module, login flow, sign-out flow, and SQLite plumbing:

1. `spec/.../70-lovable-owner-switch/`
2. `spec/.../71-lovable-user-add/` (v2, two-step Owner promotion)
3. Shared module `lovable-common-xpath` + shared `LovableApiClient`

## Execution rules

- One phase per `next` invocation. No phase merges another phase's deliverables.
- Each phase ends with: code committed in tree, lint clean, plan.md row flipped to ✅.
- Coding rules from `70-lovable-owner-switch/05-coding-rules-recap.md` apply to every phase: ≤100-line files, ≤15-line functions, no `!important`, no inline `<style>`, no `as` casts, no `unknown`, no magic strings, class-based, blank line before return, namespace logger on every catch.
- After each phase: update `.lovable/plan.md` (P1..P20 row → ✅) and append a one-line note in this folder's `02-progress-log.md`.
- If a phase reveals a blocker, STOP and write a question into `03-open-questions.md` instead of guessing.

## The 20 phases

| # | Phase | Primary deliverable | Touches |
|---|---|---|---|
| P1  | Shared XPath module scaffold | `standalone-scripts/lovable-common-xpath/src/index.ts` exporting `XPathKeyCode` enum, `DefaultXPaths` map, `DefaultDelaysMs` map | new project folder, info.json, manifest entry |
| P2  | Shared `LovableApiClient` skeleton | Class with `getWorkspaces()`, `getMemberships()`, `addMembership()`, `updateMembershipRole()`, `promoteToOwner()` — no network yet, typed contracts only | `standalone-scripts/lovable-common-api/src/lovable-api-client.ts` |
| P3  | `LovableApiClient` wired to `getBearerToken()` | Real fetch calls, error → `RiseupAsiaMacroExt.Logger.error()`, no retry | same file + `lovable-api-error.ts` |
| P4  | Owner Switch project scaffold | `standalone-scripts/lovable-owner-switch/` folder, info.json, manifest, empty class entry `LovableOwnerSwitch` | new project folder |
| P5  | Owner Switch SQLite migration | Creates `OwnerSwitchTask`, `OwnerSwitchRow`, `TaskStatus`, `XPathSetting` via core SDK migration; seeds `TaskStatus` + `XPathSetting` from P1 defaults | `migrations/001-init.ts` |
| P6  | Owner Switch CSV parser + validator | Parses `LoginEmail, Password?, OwnerEmail1, OwnerEmail2?, Notes?`; validation errors surface to UI | `csv/parser.ts`, `csv/validator.ts` |
| P7  | Owner Switch popup UI shell | File upload, file manager (project `uploads/` only), task name, common password, incognito toggle, login URL, rows table — no run logic yet | `ui/popup.ts`, `ui/popup.css` |
| P8  | Owner Switch login automation | Drives `LoginEmailInput` → `ContinueButton` → `PasswordInput` → `LoginButton` → wait for `WorkspaceButton` via shared XPaths | `flow/login.ts` |
| P9  | Owner Switch promote step | Calls `LovableApiClient.promoteToOwner(workspaceId, userId)`; resolves `UserId` via `getMemberships()`; caches `Email→UserId` and `LoginEmail→WorkspaceId` via root SDK Cache | `flow/promote.ts` |
| P10 | Owner Switch sign-out + per-row state machine | Profile → SignOut → delay; updates `IsDone`/`HasError`/`LastError` in SQLite; per-task log file under `logs/` | `flow/sign-out.ts`, `flow/run-row.ts`, `logs/log-writer.ts` |
| P11 | User Add project scaffold | `standalone-scripts/lovable-user-add/` folder, info.json, manifest, empty class entry `LovableUserAdd` | new project folder |
| P12 | User Add SQLite migration + `MembershipRole` seed | Creates `UserAddTask`, `UserAddRow`, `TaskStatus`, `MembershipRole`, `XPathSetting`; seeds `MembershipRole` with `Owner, Admin, Member` | `migrations/001-init.ts` |
| P13 | User Add CSV parser + validator | Parses `LoginEmail, InviteEmail, RoleCode, Password?, Notes?`; normalizes `Editor`→`Member`; falls back to task `DefaultRoleId` when `RoleCode` empty | `csv/parser.ts`, `csv/validator.ts` |
| P14 | User Add popup UI shell | Mirrors Owner Switch popup + Default role select + per-row resolved-role chip | `ui/popup.ts`, `ui/popup.css` |
| P15 | User Add Step A — POST membership | `LovableApiClient.addMembership(workspaceId, {Email, Role})` where `Role = Admin` for Admin, `Member` for Member, `Member` for Owner rows | `flow/post-membership.ts` |
| P16 | User Add Step B — Owner promotion (reuse) | When `RoleCode = Owner`: GET memberships → resolve `UserId` for `InviteEmail` → call `LovableApiClient.promoteToOwner(...)` (the SAME method Owner Switch uses — no duplicate REST) | `flow/promote-after-add.ts` |
| P17 | User Add per-row state machine + sign-out | Step A log line + Step B log line are distinct; sign-out always runs; SQLite row flags updated | `flow/run-row.ts` |
| P18 | Shared XPath/delay editor + Reset | One UI component used by both popups; reads/writes `XPathSetting`; Reset restores defaults from `lovable-common-xpath` | `lovable-common-xpath/ui/xpath-editor.ts` (or shared UI module) |
| P19 | Logs viewer + copy-to-clipboard | Tail latest task log in popup, copy button; Step A vs Step B lines clearly distinguishable | `ui/logs-panel.ts` reused by both |
| P20 | Cross-spec audit + version bump | Verify R12 (no duplicate `promoteToOwner` REST), all coding rules pass lint, manifest + constants.ts + standalone-scripts versions unified, plan.md and memory updated | `.lovable/plan.md`, `.lovable/memory/features/lovable-user-add-v2-two-step-owner.md`, version bump |

## Acceptance criteria coverage map

| Spec AC | Phase(s) |
|---|---|
| Owner Switch AC 1–4 (upload, file manager, CSV validation, migration) | P4–P7 |
| Owner Switch AC 5–9 (login, bearer, PUT, IsDone/HasError, sign-out) | P8–P10 |
| Owner Switch AC 10–12 (XPath editor, logs, file/function size) | P18–P20 |
| User Add AC 1–6 (CSV, role enum, role fallback, migration, seed) | P11–P14 |
| User Add AC 7–9 (POST per row, Owner Step B uses shared client) | P15–P17 |
| User Add AC 10–15 (sign-out, XPath editor, logs, shared module, coding rules) | P17–P20 |

## Open questions (answer before P1)

See `03-open-questions.md`. Phases that depend on an unanswered question are
blocked until the user clarifies.
