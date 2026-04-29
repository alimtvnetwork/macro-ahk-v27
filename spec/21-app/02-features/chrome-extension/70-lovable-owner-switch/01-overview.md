# Lovable Owner Switch — Overview

**Status**: 📋 Pending (spec-only, deferred for later implementation)
**Project type**: Standalone script inside the macro Chrome extension
**Companion project**: `Lovable User Add` (see `spec/21-app/02-features/chrome-extension/71-lovable-user-add/`)
**Shared module**: `Lovable Common XPath` (see §02)
**Date authored**: 2026-04-24

---

## 1. Purpose

Promote one or more existing workspace members to the **Owner** role on
[lovable.dev](https://lovable.dev) in bulk, driven from a CSV uploaded by the user.
The script logs in as a controller account (using credentials from the CSV),
reads the Lovable session cookie to obtain a bearer token, calls the membership
endpoint with `{"Role":"Owner"}`, and signs out — repeating for every row.

## 2. Project identity

| Field | Value |
|---|---|
| Project name | `Lovable Owner Switch` |
| Script slug | `lovable-owner-switch` |
| Lives under | `standalone-scripts/lovable-owner-switch/` |
| Shared XPath module | `lovable-common-xpath` (TypeScript, reused by `Lovable User Add`) |
| Default URL targets | `https://lovable.dev/login`, `https://api.lovable.dev/*` |
| Default browser mode | Incognito (toggle exposed in popup) |

## 3. End-to-end flow (one row)

1. **Pre-flight** — validate row (LoginEmail + at least one OwnerEmail), resolve effective password (row → fallback to common-password text box).
2. **Launch browser** — incognito if enabled, navigate to `LoginUrl`.
3. **Login** — fill `LoginEmailInput`, click `ContinueButton`, wait for `PasswordInput`, fill, click `LoginButton`.
4. **Confirm session** — wait for `WorkspaceButton` XPath (retry until visible).
5. **Read bearer** — pull Lovable session cookie, derive bearer token (same approach as Macro Controller).
6. **Resolve workspace** — `GET {ApiBase}/workspaces` → pick `WorkspaceId`.
7. **Resolve memberships** — `GET {ApiBase}/workspaces/{WorkspaceId}/memberships` → list users.
8. **For each `OwnerEmailN`**:
   1. Find membership by email → `UserId`
   2. Cache `{Email → UserId}` in IndexedDB via root SDK
   3. `PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}` with body `{"Role":"Owner"}`
9. **Mark row** — on 2xx → `IsDone = true`; on error → `HasError = true`, `LastError = <stack>`.
10. **Sign out** — click `ProfileButton`, wait for `SignOutButton`, click, delay.
11. **Next row**.

## 4. File layout (planned)

```
standalone-scripts/lovable-owner-switch/
├── src/
│   ├── index.ts                  # Entry — single default class LovableOwnerSwitch
│   ├── enums/                    # KeyCode, Status, Role, FileType
│   ├── core/                     # OwnerSwitchRunner, RowExecutor, SignOutFlow
│   ├── data/                     # OwnerSwitchTaskRepo, OwnerSwitchRowRepo, XPathSettingRepo
│   ├── ui/                       # Popup tabs, file picker, settings editor (no inline CSS)
│   ├── api/                      # LovableApiClient (memberships, workspaces)
│   └── instruction.ts            # ProjectInstruction manifest
├── css/
│   └── lovable-owner-switch.css  # All styling — never inline, never !important
└── uploads/                      # Per-project upload bucket (created at runtime)
```

## 5. Acceptance criteria

See `04-acceptance-criteria.md`.

## 6. References

- Verbatim transcript: `99-verbatim.md`
- Database schema: `02-database-schema.md`
- Default XPaths + delays: `03-xpaths-and-defaults.md`
- Coding rules (recap): `05-coding-rules-recap.md`

---

> **Status note**: This spec is captured for future implementation. Do NOT
> implement until the user explicitly schedules it (tracked in `.lovable/plan.md`
> as a Pending TODO).
