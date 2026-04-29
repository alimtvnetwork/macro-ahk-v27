# Plan: Comprehensive Logging & Code Quality Overhaul (v4.9)

**Status**: COMPLETED
**Date Completed**: 2026-02-17
**Version**: 4.8 -> 4.9

## Objective
Establish comprehensive logging, naming conventions, and code quality standards across all AHK and JS files.

## Completed Tasks

### AHK Files Overhauled
- [x] **Utils.ahk** - Added `GetCallerInfo()` for dynamic caller detection via `Error("trace").Stack` parsing, `SubLog()` for indented sub-actions, `LogKeyPress()` using `FormatHotkeyLabel()`
- [x] **HotkeyFormat.ahk** - Clean with is/has naming conventions
- [x] **Config.ahk** - Comprehensive logging for each section loaded with SubLog for values
- [x] **JsInject.ahk** - Every key press logged via `LogKeyPress()` before `Send()`, WARNING comments listing all keys sent
- [x] **Combo.ahk** - Full logging, is/has naming, WARNING comments about side effects
- [x] **MacroLoop.ahk** - Full logging, WARNING comments listing all keyboard shortcuts sent
- [x] **Automator.ahk** - Full logging on hotkey registration, tray menu clicks, Esc handler
- [x] **Gmail.ahk** - Already had logging standards applied
- [x] **AutoLoop.ahk** - Already had logging standards applied

### JS Files Overhauled
- [x] **combo.js** - Enhanced with `[functionName]` in every log, `logSub()` for indented sub-actions, `logWarn()` with orange color, is/has boolean naming

## Standards Established
1. Every action logged BEFORE executing
2. Key presses logged via `LogKeyPress()` with human-readable format
3. If/else branches have logs
4. Sub-actions indented with tabs for hierarchy
5. Function name included in logs dynamically via `GetCallerInfo()`
6. Never remove any log
7. `is`/`has` prefix for all boolean variables
8. No `not` in if statements - invert to meaningful variable names
9. WARNING comments on functions that call shortcuts/external things
10. Use `FormatHotkeyLabel()` for human-readable key display
11. Logs folder cleared on startup for fresh logs
