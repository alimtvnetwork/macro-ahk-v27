# Lovable Common — Standalone Script

**Version**: 1.0.0
**Author**: Riseup Asia LLC
**Type**: Shared library (consumed at runtime by `lovable-owner-switch` and `lovable-user-add`)

## Purpose

Single source of truth for:

1. Lovable login / profile / sign-out **XPaths** (`XPathKeyCode` enum + `DefaultXPaths` map).
2. **Default per-step delays** (`DefaultDelaysMs`).
3. **`LovableApiClient`** (added in phase P2 / P3 — not in this scaffold).
4. The shared **XPath + delay editor** UI component (added in P18).

Both Lovable scripts must consume this module — no duplicated XPaths or
duplicated REST calls. See plan task R12 for the no-drift rule.

## Phase status

| Phase | Status | Deliverable |
|---|---|---|
| **P1** | ✅ this commit | `XPathKeyCode`, `DefaultXPaths`, `DefaultDelaysMs`, `XPathEntry` typed exports + project scaffold (`info.json`, `instruction.ts`) |
| P2 | ⏳ | `LovableApiClient` skeleton (typed, no network) |
| P3 | ⏳ | Wire `LovableApiClient` to `getBearerToken()` + namespace logger on every catch |
| P18 | ⏳ | Shared XPath/delay editor UI component + Reset to defaults |

## Public API (P1)

```ts
import {
    XPathKeyCode,
    DefaultXPaths,
    DefaultDelaysMs,
    type XPathEntry,
} from "lovable-common";
```

| Export | Shape |
|---|---|
| `XPathKeyCode` | string enum — `LoginEmailInput`, `ContinueButton`, `PasswordInput`, `LoginButton`, `WorkspaceButton`, `SettingsButton`, `ProfileButton`, `SignOutButton` |
| `DefaultXPaths` | `Readonly<Record<XPathKeyCode, string>>` — frozen map of code-side defaults |
| `DefaultDelaysMs` | `Readonly<Record<XPathKeyCode, number>>` — wait-after-action defaults in ms |
| `XPathEntry` | typed shape for `XPathSetting` SQLite rows (PascalCase fields) |

## Coding rules followed

- File ≤ 100 lines (largest is `default-xpaths.ts` at ~22 lines).
- No `as` casts, no `unknown`, no magic strings (every XPath keyed by enum).
- `Object.freeze` on default maps to prevent mutation.
- No CSS yet (P18 will add CSS in its own file per `mem://standards/standalone-scripts-css-in-own-file`).
- No `requestAnimationFrame`, no try/catch yet — none needed in P1.
