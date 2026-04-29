# 09 | Post-Move Workspace Fixes & Shortcut Standardization | v7.9.30–v7.9.34

## Summary

This workflow covers a series of interconnected fixes for workspace name corruption after API-driven moves, and keyboard shortcut standardization. Three issue write-ups (#08, #09, #10) were produced.

## Root Cause Analysis

### Issue #08 (v7.9.32): Post-move XPath reads stale DOM
After a successful `PUT /move-to-workspace`, a 2s-delayed `autoDetectCurrentWorkspace()` opened the Project Dialog, which still showed the **old** workspace name. XPath read this stale value and overwrote the authoritative state.

### Issue #09 (v7.9.34): Indirect XPath via credit refresh pipeline
v7.9.32 removed the direct XPath call but missed the **indirect** path: `fetchLoopCredits()` → `parseLoopApiResponse()` → `autoDetectLoopCurrentWorkspace()` → XPath. The credit pipeline re-triggered detection and corrupted state again.

### Issue #10 (v7.9.33): Unreachable keyboard handler
`Alt+Up/Down` handler was placed **after** `if (!isCtrlAlt) return;` guard in combo.js, making it structurally unreachable (dead code).

## Changes Implemented

### v7.9.30: Simplified detection (removed mark-viewed API)
- Removed `POST /projects/{id}/mark-viewed` from both controllers (returned nothing useful)
- Simplified to 3-tier: XPath Dialog → Default → Guard flag

### v7.9.31: Post-move workspace sync + Quick Paste Save
- Added post-move XPath verification (later identified as the root cause of #08)
- Force move shortcuts changed to Alt+Shift+Up/Down
- Quick Paste Save button on token expiry

### v7.9.32: Fix #08 — Removed post-move XPath detection
- API success is authoritative; no DOM verification needed
- Set `state.workspaceFromApi = true` after successful move
- Force move shortcuts changed to Alt+Up/Down

### v7.9.33: Fix #10 — Shortcut handler placement + standardization
- Moved force-move check BEFORE `isCtrlAlt` guard
- Standardized: **Ctrl+Up/Down** (force move), **Ctrl+Left/Right** (combo switch)

### v7.9.34: Fix #09 — Authoritative API guard in autoDetect functions
- Added guard at top of `autoDetectLoopCurrentWorkspace()` and `autoDetectCurrentWorkspace()`
- If `workspaceFromApi` is true and name matches known workspace → skip XPath entirely
- Traced ALL call paths to the problematic function (lesson from incomplete v7.9.32 fix)

## New Engineering Standards
1. **Post-Mutation No DOM Re-Detect**: After API success, skip DOM-based workspace detection
2. **Trace ALL Call Paths**: Don't just fix the direct caller — trace indirect paths too
3. **Keyboard Handler Placement**: New handlers BEFORE early-return guards

## Validation
- All three issues verified resolved via manual testing
- Workspace name persists correctly after force moves in both controllers

## Conclusion
The iterative nature of this fix (3 versions to fully resolve) reinforced the importance of tracing complete call chains. The authoritative guard pattern is now a permanent architectural element.
