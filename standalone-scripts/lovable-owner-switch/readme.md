# Lovable Owner Switch

Chrome-extension automation that switches workspace ownership on
[lovable.dev](https://lovable.dev) by:

1. Logging in as the current owner (CSV row).
2. Calling `LovableApiClient.promoteToOwner(workspaceId, userId)` for each
   target email (resolved via `getMemberships()`).
3. Signing out and moving to the next row.

## Phase status

| Phase | Description | Status |
|-------|-------------|--------|
| P4 | Project scaffold (`info.json`, `instruction.ts`, empty entry class) | ✅ |
| P5 | SQLite migration + seeds | ⏳ |
| P6 | CSV parser + validator | ⏳ |
| P7 | Popup UI shell | ⏳ |
| P8 | Login automation | ⏳ |
| P9 | Promote step (uses shared client) | ⏳ |
| P10 | Sign-out + per-row state machine | ⏳ |

## Dependencies

- `lovable-common` (shared XPaths, delays, `LovableApiClient`)
- `marco-sdk` (Logger, Cache, SQLite migrations)

## CSV contract

Columns: `LoginEmail, Password?, OwnerEmail1, OwnerEmail2?, Notes?`.

See `spec/21-app/02-features/chrome-extension/70-lovable-owner-switch/`
for full requirements and acceptance criteria.
