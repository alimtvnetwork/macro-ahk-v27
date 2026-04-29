# Memory: features/macro-controller/rename-system
Updated: 2026-03-19

> **Note**: Do NOT sync rename changes to the AHK copy in `skipped/`. The `skipped/` folder is read-only per project policy.

## Bulk Rename System (v7.32)

### API Method
- Uses **PATCH** first for workspace rename, with automatic **PUT fallback** on 405
- Request body always includes `default_monthly_member_credit_limit: -1` (required for non-pro workspaces; harmless for pro)
- Token fallback retry pattern on 401/403 (same as credits/move)
- Rate limit (429) handled with 2s retry

### Floating Draggable Panel
- Replaces modal dialog — no overlay, user can interact with other UI while renaming
- Draggable via title bar, resizable, has close button
- Named event handlers with proper cleanup on panel close (no memory leaks)
- Shows: prefix (checkbox), template, suffix (checkbox), delay slider, token refresh, preview, ETA, stop/apply buttons

### Numbering Variables
Three variable types, all zero-padded by character count:
- `$$$` → 001, 002, 003... (dollar)
- `###` → 001, 002, 003... (hash)
- `***` → 001, 002, 003... (star, requires 2+ chars)

Each variable type has its own independent start number. Variables work in prefix, template, AND suffix fields. Multiple variable types can be mixed in the same field (e.g. `$$$-###` → `001-001`). Start number UI controls appear dynamically only when the variable is detected in any field.

### Async Worker Pattern
- Configurable delay between operations: 100ms–10,000ms (default 750ms, slider in UI)
- Cancellation via Stop button (sets `RENAME_CANCELLED` flag, checked before each `doNext`)
- Progress updates in Apply button text during operation
- After completion/cancellation, panel stays open and re-enables Apply

### ETA Display
- **Pre-start**: Static estimate based on `count × delay`
- **During rename**: Rolling-average ETA using last 5 actual operation times (request duration + delay)
- Displays avg ms/op when rolling data is available, falls back to delay-based estimate
- Updates on each completed operation; hidden when done

### Undo / History System
- Successful renames are recorded in `loopRenameHistory[]` (stack of `{ timestamp, entries: [{ wsId, oldName, newName }] }`)
- Max stack depth: 20 operations (`RENAME_HISTORY_MAX`)
- Persisted to `localStorage` key `ml_rename_history`
- Restored from localStorage on script load
- **Undo** reverses the last batch by swapping oldName ↔ newName and calling `renameWorkspace()` for each
- Undo does NOT push itself to history (prevents infinite undo chains)
- `↩️ Undo` button visibility auto-managed by `updateUndoBtnVisibility()`
- Global APIs: `window.__loopUndoRename()`, `window.__loopRenameHistory()`

### Token Refresh
- 🔄 Refresh Token button reads session cookie and writes to localStorage
- Shows current auth source label
