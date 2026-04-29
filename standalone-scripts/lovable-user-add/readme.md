# Lovable User Add

Chrome-extension automation that bulk-adds members to Lovable workspaces
from a CSV. Two-step per row:

1. **Step A** — POST membership at the configured default role
   (`MembershipRole`: Owner / Admin / Member; `Editor` is normalized to
   `Member` at parse time per Q3).
2. **Step B** — If the row's role is `Owner`, promote via the shared
   `LovableApiClient.promoteToOwner(workspaceId, userId)` (R12 invariant
   — same call site as Owner Switch).

## Phase status

| Phase | Description | Status |
|-------|-------------|--------|
| P11 | Project scaffold (`info.json`, `instruction.ts`, empty entry class) | ✅ |
| P12 | SQLite migration + `MembershipRole` seed | ⏳ |
| P13 | CSV parser + validator (Editor→Member) | ⏳ |
| P14 | Popup UI shell + default-role select | ⏳ |
| P15 | Step A — POST membership | ⏳ |
| P16 | Step B — Owner promotion (shared `promoteToOwner`) | ⏳ |
| P17 | Per-row state machine + sign-out | ⏳ |

## Dependencies

- `lovable-common` (shared XPaths, delays, `LovableApiClient`)
- `marco-sdk` (Logger, Cache, SQLite migrations)

## CSV contract (preliminary — finalised at P13)

Columns: `WorkspaceUrl, MemberEmail, Role?, Notes?`. Role defaults to
the popup's "Default role" select when omitted.

See `spec/21-app/02-features/chrome-extension/72-lovable-owner-switch-and-user-add-phase-plan/`
for full requirements and acceptance criteria.
