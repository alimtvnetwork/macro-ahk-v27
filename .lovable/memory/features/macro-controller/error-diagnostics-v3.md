# Memory: features/macro-controller/error-diagnostics-v3
Updated: 2026-03-22

## Enriched Error Toasts
The `showToast` function accepts an extended `ToastOpts` with a `requestDetail` field containing `{ method, url, headers, body, status, responseBody }`. When the copy button (📋) is clicked, the full request/response context is included in the clipboard text — including a redacted bearer token (first 12 chars + `...REDACTED`). Headers are redacted in diagnostic logs to protect sensitive authentication data. The copy text prefix includes the version number: `[MacroLoop v1.56.0 ERROR @ HH:MM:SS]`.

## Toast Anti-Freeze (v1.56)
- Max visible toasts reduced from 5 → 3
- Error toast auto-dismiss reduced from 30s → 15s
- Normal toast auto-dismiss reduced from 12s → 10s
- Toast log messages truncated to 150 chars to reduce activity log bloat
- These changes prevent UI freeze during bulk rename 403 cascades

## Recent Errors Panel
A collapsible "Recent Errors" section below JS Logs in `tools-sections-builder.ts`. It:
- Stores notification-level errors in a `recentErrors[]` array (max 50, FIFO)
- Renders each error with timestamp, message, and request details
- Provides "Copy All" and "Download" buttons for bulk export
- Errors are pushed from `showToast()` when level === 'error' or 'warn'

## Data Flow
`showToast(msg, level, { requestDetail })` → pushes to `recentErrors[]` → `updateRecentErrorsUI()` renders in panel.
`workspace-rename.ts` passes `requestDetail` with redacted auth label when calling `showToast`.
