# Plan: Chrome Extension Implementation v1.0–v1.16

**Status**: COMPLETED (ongoing minor updates)
**Date Range**: 2026-02-20 → 2026-03-15
**Versions**: v1.0.0 → v1.16.0

## Summary

Built a full Chrome extension (Manifest V3) for Lovable workspace automation. 16 releases implementing the spec created in the 6-phase Chrome Extension Spec Expansion plan.

## Key Milestones

### v1.0.0 — Foundation (2026-02-20)
- Programmatic injection (no static content_scripts)
- SQLite logging (sql.js + jszip) with logs.db + errors.db
- Cookie-based authentication
- Basic popup UI with script management
- Project model with URL rules and script/config bindings
- Options page with config editor

### v1.1.0 — Auth & Credit UI (2026-03-12)
- Session-bridge authentication (background script seeds `lovable-session-id`)
- Emoji credit labels (🎁💰🔄📅⚡) with tooltips
- Shared `renderCreditBar(opts)` function
- Compact mode segmented color bars
- Removed manual bearer token paste UI

### v1.5.0 — Context Menu (2026-03-13)
- Right-click context menu with project selection, Run/Re-inject, Copy/Export Logs
- Dynamic project submenu auto-rebuilds

### v1.6.0 — User Script API (2026-03-14)
- `marco.log.*` User Script Logging API (Spec 42)
- `marco.store.*` Cross-Site Data Bridge
- Auto-injected `window.marco` SDK
- 26 unit tests

### v1.8.0–v1.9.0 — SQLite Bundle UI (2026-03-14)
- Popup Export/Import DB buttons
- Import mode selector (Merge/Replace All)

### v1.10.0–v1.12.0 — UI Polish (2026-03-14)
- Status cards simplified to single-line, clickable
- JS/Config edit buttons per script row
- Animated tooltips with framer-motion
- OS-aware modifier keys

### v1.13.0–v1.14.0 — Options Page (2026-03-14)
- Root-cause fix for missing import/export controls in extension Options
- Per-project Export DB
- Toast notifications replacing alert() dialogs
- options-projects refactor (365-line → 3 focused modules)

### v1.15.0–v1.16.0 — Data Integrity (2026-03-14–15)
- Relative progress bar scaling (Issue #38)
- SQLite schema fix: `data`→`json` column standardization (Issue #39)
- Marco logo in PopupHeader and About view

## Issues Resolved

11 issues documented: #26 (formerly #14b — probe-return-failure-v6.55), #15b, #29, #30, #31, #34, #35a/b, #36, #37, #38, #39

## Architecture Decisions

- **Storage**: chrome.storage.local (not IndexedDB) per spec decision
- **Injection**: Programmatic via `chrome.scripting.executeScript`
- **Auth**: Session-bridge (BG script → page localStorage), replacing manual bearer paste
- **Build**: Vite with manualChunks to prevent service worker code-splitting crashes
- **CSP**: `'unsafe-eval'` required for `new Function(code)` in extension context

## Files Changed
- `chrome-extension/` — entire directory (src/, tests/, scripts/, manifest.json, etc.)
- `src/components/popup/PopupHeader.tsx` — Marco logo
- `src/components/options/GlobalAboutView.tsx` — Marco logo
- `src/lib/sqlite-bundle.ts` — meta.value nullable alignment
