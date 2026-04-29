# Issue 91: Duplicate Project Name & Workspace Detection Root Cause Analysis

**Version**: v2.104.0
**Date**: 2026-04-07
**Status**: Fixed

---

## Root Cause 1: Duplicate Project Name in Header

### What happened
The panel title bar showed the project name **twice**: once in a gold `wsNameEl` badge and once in a white `projectNameEl` span, separated by a `·` dot.

### Why it happened
During Phase 5F (panel-header extraction), both `projectNameEl` and `wsNameEl` were populated using `getDisplayProjectName()`. The `wsNameEl` was originally intended to show the **workspace** name but was repurposed to also display the project name as a fallback. The `projectNameEl` was never removed, creating duplication.

### Fix
- Removed `projectNameEl` entirely from the title bar.
- `wsNameEl` now prioritizes `state.workspaceName` → `loopCreditState.currentWs` → `getDisplayProjectName()` as fallback.
- `updateTitleBarWorkspaceName()` follows the same priority chain.

---

## Root Cause 2: Workspace Not Shown in Stopped Status

### What happened
The `[=] Stopped | Cycles: 0` status bar showed "Workspace not detected" even when workspaces were loaded from the API.

### Why it happened
`renderStoppedStatus()` reads `state.workspaceName`, which is only set by Tier 1 mark-viewed detection. If mark-viewed fails (e.g., project not recently viewed), `state.workspaceName` stays empty even though `loopCreditState.currentWs` may have been resolved.

### Fix
The status bar already correctly reads `state.workspaceName` — the real fix is ensuring the title badge and Focus Current button properly propagate `loopCreditState.currentWs` into `state.workspaceName`.

---

## Root Cause 3: Focus Current Using DOM Scraping

### What happened
`handleFocusCurrent()` fell back to `readWorkspaceFromDialog()` which scraped the Transfer dialog DOM to find the workspace name — fragile and often failing.

### Why it happened
Legacy code from before the API-based workspace detection was implemented. The DOM scraping was never removed as a primary fallback path.

### Fix
- Removed `readWorkspaceFromDialog()` entirely.
- `handleFocusCurrent()` now uses: `state.workspaceName` → `loopCreditState.currentWs` → API re-detection.
- No DOM scraping involved.

---

## Prevention
- Title bar should have a **single** name element, not two competing ones.
- Workspace resolution should always flow through the API tier, never DOM scraping.
- `state.workspaceName` should be the single source of truth, synced from `loopCreditState.currentWs` when available.

---

*RCA v2.104.0 — 2026-04-07*
