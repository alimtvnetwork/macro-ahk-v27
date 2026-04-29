# Plan: Transfer Button Fix & UI Enhancements (v4.9)

**Status**: COMPLETED
**Date Completed**: 2026-02-17

## Objective
Fix the Transfer button detection bug and add UI improvements to both controller panels.

## Completed Tasks

### Bug Fix
- [x] **Transfer button XPath detection** - The XPath `/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[3]/div[6]/div[2]/button` was brittle and broke when lovable.dev changed its DOM structure. Replaced single XPath lookup with `findTransferButton()` which tries 4 methods:
  1. Configured XPath (original behavior)
  2. Text-based button scan (buttons with "Transfer" text)
  3. Heading proximity search (find "Transfer" heading, walk up to find nearest button)
  4. ARIA label matching (`aria-label`, `title` attributes)
- [x] Updated both `clickTransferButton()` and `createControllerUI()` to use the robust finder

### Startup Improvements
- [x] **Logs folder cleanup on startup** - Added to `Automator.ahk` before `LoadConfig()`: deletes and recreates `logs/` folder so every session starts with fresh logs

### UI Keyboard Shortcuts
- [x] **ComboSwitch UI** - Already had `Ctrl+Alt+Up/Down` for switching projects and `Ctrl+Alt+H` for hide
- [x] **MacroLoop UI** - Added `Ctrl+Alt+Up` (toggle loop up), `Ctrl+Alt+Down` (toggle loop down), `Ctrl+Alt+H` (show/hide panel)

### Hide/Minimize
- [x] **ComboSwitch UI** - Already had `[ - ]` minimize and `[ x ]` hide with `Ctrl+Alt+H` restore
- [x] **MacroLoop UI** - Added `[ - ]` minimize (collapses body, keeps header), `[ + ]` expand, `[ x ]` hide (completely hidden), `Ctrl+Alt+H` restore

### Floating/Draggable Behavior
- [x] **ComboSwitch UI** - Added drag via header bar. On first drag, panel detaches from DOM flow and becomes `position:fixed` floating window. Click (no drag) still toggles minimize.
- [x] **MacroLoop UI** - Same floating/draggable behavior. Header is drag handle. Click vs drag distinguished by 5px movement threshold.

## Files Modified
- `combo.js` - Added `findTransferButton()`, updated `clickTransferButton()` and `createControllerUI()`, added drag handlers
- `macro-looping.js` - Rewrote `createUI()` with titleRow drag, hide/minimize, keyboard shortcuts
- `Automator.ahk` - Added logs folder cleanup before `LoadConfig()`
