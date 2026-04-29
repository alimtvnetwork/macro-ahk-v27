---
name: Lovable User Add v2 — two-step Owner promotion
description: User Add spec amended 2026-04-24 to add Owner via POST-Member then PUT-Owner, reusing the Owner Switch REST contract via shared LovableApiClient
type: feature
---

# Memory: features/lovable-user-add-v2-two-step-owner

Updated: 2026-04-24

## Status

📋 **Pending — spec-only, do NOT implement until user explicitly schedules.**

## What changed in v2

The User Add spec (`spec/21-app/02-features/chrome-extension/71-lovable-user-add/`)
was extended from the v1 scaffold with these additions:

1. **`MembershipRole` lookup table** seeded with `Owner`, `Admin`, `Member` (Editor normalized to Member at parse time).
2. **`DefaultRoleId` on `UserAddTask`** — fallback when CSV row omits `RoleCode`.
3. **`RoleId` on `UserAddRow`** (FK → `MembershipRole`); null falls back to task default.
4. **Two-step Owner promotion** (the controlling user instruction):
   - Step A: `POST {ApiBase}/workspaces/{WorkspaceId}/memberships` with `Role = "Member"` for Owner rows (Lovable's invite endpoint cannot assign Owner directly).
   - Step B-1: `GET {ApiBase}/workspaces/{WorkspaceId}/memberships` → resolve the new `UserId` for `InviteEmail`.
   - Step B-2: `PUT {ApiBase}/workspaces/{WorkspaceId}/memberships/{UserId}` body `{"Role":"Owner"}` — **reuses the exact contract documented in `Lovable Owner Switch`** via a shared `LovableApiClient.promoteToOwner(...)` method.
5. **Shared `LovableApiClient`** (location TBD between `lovable-common-xpath` and a new `lovable-common-api` module) prevents duplication of the Owner promotion REST call.

## Why this matters

The Lovable membership API does not allow direct assignment of `Owner` at
POST time. Trying to do so will fail. The two-step path keeps the User Add
script honest about that constraint, and forces both scripts (`Lovable Owner
Switch` and `Lovable User Add`) to share the single source of truth for the
Owner promotion REST contract.

## Spec locations

- `spec/21-app/02-features/chrome-extension/71-lovable-user-add/01-overview.md` (v2 — overwritten)
- `spec/21-app/02-features/chrome-extension/71-lovable-user-add/02-acceptance-criteria.md` (v2 — overwritten)
- `spec/21-app/02-features/chrome-extension/71-lovable-user-add/99-verbatim.md` (v2 brief + Step B controlling instruction)

## Tracking

`.lovable/plan.md`:

- Owner Switch / User Add / shared `lovable-common-xpath` rows remain as Pending TODOs (do not auto-recommend implementation).
- New Review item added: **R12 — User Add v2 spec ⇄ Owner Switch REST contract drift check** — when User Add is eventually implemented, verify it imports the same `promoteToOwner(...)` method that Owner Switch uses (no duplicated PUT call).

## Cross-references (already in memory)

- `mem://features/lovable-owner-switch-and-user-add-pending` — original pending entry covering both projects
- `mem://auth/unified-auth-contract` — `getBearerToken()` is the single auth path
- `mem://architecture/storage/database-naming-convention` — PascalCase tables/columns
- `mem://standards/class-based-standalone-scripts` — single default class entry
- `mem://standards/no-css-important`, `mem://standards/standalone-scripts-css-in-own-file`,
  `mem://standards/no-error-swallowing`, `mem://standards/blank-line-before-return`,
  `mem://standards/no-type-casting`, `mem://standards/unknown-usage-policy`,
  `mem://standards/code-quality-improvement`, `mem://standards/no-unjustified-raf`,
  `mem://standards/pre-write-check`, `mem://standards/formatting-and-logic`
