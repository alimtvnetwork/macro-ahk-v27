# Plan: Workspace State Synchronization Fix (v7.9–v7.9.2)

**Status**: COMPLETED
**Date Completed**: 2026-02-21
**Version**: v7.9 → v7.9.2

## Summary
Fixed workspace state synchronization across all UI sections in both controllers after combo switch, API move, and background credit refresh operations.

## Issues Fixed

### 1. NOW/Status Line Not Updating After Switch (v7.9)
- **Root Cause**: `waitForConfirmButton` success handler only set `__wsCurrentName` but didn't re-render the status element
- **Fix**: Explicit status element innerHTML update with targetLabel

### 2. Header and Workspace List Not Syncing (v7.9)
- **Root Cause**: `updateCreditDisplay()` and `renderWorkspaceList()` not called after switch/move
- **Fix**: Immediate calls to both after state update

### 3. API Move (Move Button) Not Syncing UI (v7.9)
- **Root Cause**: `moveToWorkspace()` success handler in combo.js didn't update `__wsCurrentName` or refresh UI
- **Fix**: Added state update + full UI refresh (header, status, workspace list)

### 4. Workspace State Clobber — The Root Bug (v7.9.2)
- **Root Cause**: `autoDetectCurrentWorkspace()` had 3 fallback paths that unconditionally set `__wsCurrentName = perWs[0]` on ANY API failure/mismatch, overwriting the correct state set by user actions 2 seconds earlier
- **Fix**: All 6 fallback paths (3 per controller) now preserve existing state if set. "Known-Good State Wins" principle.
- **Spec**: `specs/spec-issues-v7.9-workspace-state-clobber.md`

## Principle Established
**"Known-Good State Wins"** — User-action-set state is authoritative. Background API polls may only update state if no higher-priority source has set it.

## Files Changed
- `combo.js` (switch handler, move handler, autoDetectCurrentWorkspace fallbacks)
- `macro-looping.js` (move handler, autoDetectCurrentWorkspace fallbacks)
- `specs/spec-issues-v7.9-workspace-state-clobber.md` (RCA document)
