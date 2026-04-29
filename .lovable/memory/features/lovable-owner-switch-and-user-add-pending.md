---
name: Lovable Owner Switch + Lovable User Add (pending specs)
description: Two deferred Chrome-extension scripts spec'd 2026-04-24 — promote workspace members to Owner / bulk-add members; share lovable-common-xpath module
type: feature
---

# Memory: features/lovable-owner-switch-and-user-add-pending

Updated: 2026-04-24

## Status

📋 **Pending — spec-only, do NOT implement until user explicitly schedules.**

## What was captured

Two separate standalone-script projects inside the macro Chrome extension,
fully spec'd from a verbatim user message dated 2026-04-24:

| Project | Slug | Purpose | Final REST call |
|---|---|---|---|
| Lovable Owner Switch | `lovable-owner-switch` | Promote existing workspace members to Owner from a CSV | `PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}` body `{"Role":"Owner"}` |
| Lovable User Add | `lovable-user-add` | Bulk-add new members (Admin / Member) by email from a CSV | `POST {ApiBase}/workspaces/{WorkspaceId}/memberships` body `{"Email":..., "Role":...}` |

Both share a TypeScript module `lovable-common-xpath` for the Lovable
login/profile/sign-out XPaths and default delays.

## Spec locations

- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/01-overview.md`
- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/02-database-schema.md`
- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/03-xpaths-and-defaults.md`
- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/04-acceptance-criteria.md`
- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/05-coding-rules-recap.md`
- `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/99-verbatim.md` ← captured XPaths, REST examples, narrative
- `spec/21-app/02-features/chrome-extension/71-lovable-user-add/01-overview.md`
- `spec/21-app/02-features/chrome-extension/71-lovable-user-add/02-acceptance-criteria.md`

## Key contracts

- Both scripts run inside an incognito-by-default Chrome window, drive the
  Lovable login UI by XPath, then read the Lovable session cookie to derive
  a bearer token (same path as Macro Controller —
  `mem://auth/unified-auth-contract`).
- Per-project SQLite tables created on first load via core SDK migration.
  PascalCase enforced (`mem://architecture/storage/database-naming-convention`).
- Per-project `uploads/` folder with sequence-prefixed slug filenames
  (`01-my-list.csv`). File manager restricted to that folder.
- XPaths + delays are seeded from code defaults into `XPathSetting` and
  user-editable from the popup; Reset restores code defaults.

## Coding rules that apply (all already in memory)

- `mem://standards/class-based-standalone-scripts` — single default class entry
- `mem://standards/no-css-important` — never `!important`
- `mem://standards/standalone-scripts-css-in-own-file` — no inline `<style>`
- `mem://standards/no-error-swallowing` + `mem://standards/error-logging-via-namespace-logger.md`
- `mem://standards/blank-line-before-return`
- `mem://standards/no-type-casting` + `mem://standards/unknown-usage-policy`
- `mem://standards/code-quality-improvement` — no magic strings
- `mem://standards/no-unjustified-raf`
- `mem://standards/pre-write-check` — mandatory before first source file
- `mem://standards/formatting-and-logic` — function-length budget

## Tracking

`.lovable/plan.md` ⏳ Pending — Next Up rows added under the Owner Switch /
User Add tasks. Do not auto-recommend implementation; user explicitly said
"we will do it later".
