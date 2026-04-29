# Pending Work — Deferred Items

**Last Updated**: 2026-04-23
**Extension Version**: v2.225.0

---

## Active Pending Items (actionable)

_None — TS Migration V2 backlog cleared. See "Recently Completed" below._

## Deferred — Do NOT Pick Automatically

Per `mem://preferences/deferred-workstreams` (2026-04-23):

| # | Item | Reason |
|---|------|--------|
| D1 | React Component Tests (target 900+) | Deferred by user — skip in `next` rotation |
| D2 | E2E Verification — React UI (Step 10) | Manual Chrome testing avoided |
| D3 | Prompt Click E2E Verification (Issues 52/53) | Manual Chrome testing avoided |
| D4 | P Store Marketplace (Issue 82) | Discuss-later mode |
| D5 | Cross-Project Sync & Shared Library | Depends on D4 (P Store) |

These items must NOT be surfaced as recommended next actions until the user explicitly reopens them.

## Recently Completed (v2.225.0 — 2026-04-23)

| Item | Reference |
|------|-----------|
| **TS Migration V2 Phase 03 — React Feasibility (S-051)** re-evaluated; decision **NOT PROCEEDING** (UIManager 58 lines, UI total 15,223 lines — under 20K-line revisit threshold) | `spec/21-app/02-features/macro-controller/ts-migration-v2/03-react-feasibility.md` (re-assessment appended) |
| **TS Migration V2 Phase 05 — JSON Config Pipeline (S-048)** verified + activity-log routing + 7 unit tests | `standalone-scripts/macro-controller/src/config-validator.ts`, `shared-state.ts`, `__tests__/config-validator.test.ts` |
| **TS Migration V2 Phase 02 — Class Architecture (S-046)** verified complete | `standalone-scripts/macro-controller/src/core/` (MacroController + 5 managers) |
| **TS Migration V2 Phase 04 — Performance & Logging (S-047)** verified complete | `dom-cache.ts`, `log-manager.ts`, `CreditAsyncState`, `LogFlushState`, `ui/settings-tab-panels.ts` |
| Installer spec §5 — deferred-delete + canonical-artifact-naming contract | `spec/14-update/01-generic-installer-behavior.md` |
| Home-screen feature implementation (14 modules) | `src/content-scripts/home-screen/` |
| Home-screen wired into content-script entry | `src/content-scripts/message-relay.ts` |
| MacroController bridge: official `CreditsApi.getState()` exposed | `standalone-scripts/macro-controller/src/api-namespace.ts`, `macro-looping.ts` |
| Bridge contract addendum spec | `spec/21-app/01-chrome-extension/home-screen-modification/11-macro-controller-bridge-contract.md` |
| Home-screen test coverage: 24/24 (13 pure + 11 DOM-integration) | `src/content-scripts/home-screen/__tests__/` |
| Version bump 2.224.0 → 2.225.0 across all 6 authoritative files | manifest, constants, shared-state, 3× instruction.ts |
