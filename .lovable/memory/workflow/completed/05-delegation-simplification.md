# Plan 05: Delegation Simplification & API-Driven Cycle

**Version**: v7.9.7
**Date**: 2026-02-21
**Status**: ✅ Complete

---

## Problem Statement

The MacroLoop's workspace switching relied on a complex 8-step AHK delegation flow:
1. Close DevTools → 2. Remember tab → 3. Search for Settings tab → 4. Check/inject controller → 5. Poll title for completion → 6. Return to original tab → 7. Cleanup

This was fragile (tab search failures, title marker races, clipboard conflicts) and slow (~1-4.5s per delegation).

Additionally, the loop cycle determined free credit status by opening the project dialog and checking DOM progress bars — disruptive to the user.

## Solution

### Part 1: API-Direct Move (v7.9.6–v7.9.7)
- New `performDirectMove(direction)` in `macro-looping.js` calls `moveToAdjacentWorkspace()` directly (PUT `/move-to-workspace`)
- No tab switching, clipboard signals, or title markers needed
- Both `forceSwitch()` and the loop cycle's "no credit" path use `performDirectMove()`

### Part 2: API-Driven Loop Cycle (v7.9.7)
- `runCycle()` now fetches credit data via API (`GET /user/workspaces`) instead of opening project dialog
- New `syncCreditStateFromApi()` syncs `state.hasFreeCredit` from `loopCreditState.currentWs.available`
- Double-confirm via second API fetch (2s gap) before triggering move
- DOM-based fallback (`runCycleDomFallback()`) only used when API fetch fails

### Part 3: AHK Deprecation
All old delegation code marked DEPRECATED inline (not deleted):
- `Delegate.ahk` — HandleDelegate 8-step flow
- `SignalPoll.ahk` — Clipboard/title polling
- `TabSearch.ahk` — Tab identification
- `ForceDelegateLog.ahk` — Delegation logging
- `Lifecycle.ahk` — Clipboard polling timer removed from ToggleMacroLoop

### Part 4: Credit Formula (v7.9.6)
- Available credits formula updated: `(credits_granted - credits_used) + (billing + rollover - used)`
- Both `combo.js` and `macro-looping.js` parse `credits_granted`/`credits_used` from API
- MacroLoop now tracks `freeGranted`, `freeRemaining`, `hasFree` per workspace

## Files Changed

- `macro-looping.js` — performDirectMove, syncCreditStateFromApi, runCycle (API-driven), runCycleDomFallback, credit formula
- `Lifecycle.ahk` — Removed clipboard polling
- `Delegate.ahk`, `SignalPoll.ahk`, `TabSearch.ahk`, `ForceDelegateLog.ahk` — DEPRECATED headers
- `combo.js` — Credit formula update
- `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini` — Version sync

## Resolved Issues

- S-010 (Delegate Timeout) — No longer applicable; delegate flow deprecated
- Credit display not updating from API — Now synced via `syncCreditStateFromApi()`
