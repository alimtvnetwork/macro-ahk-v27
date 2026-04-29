# Issue #09 — Dialog Closed Before Progress Bar Read

**Severity**: P0 — Check button always misses credit status
**Version**: v7.42 → v7.43
**Status**: ✅ Fixed

---

## Symptom

Check button correctly detects workspace name (Step 2) but **always reports
"Progress Bar NOT FOUND → System is IDLE"** even when the system is actively
running (progress bar visible in the project dialog).

---

## Root Cause

The Progress Bar XPath (`/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]`)
lives **inside the project dialog DOM** (the `div[6]` portal overlay). The flow was:

1. Step 1: Click Project Button → dialog opens
2. Step 2: Read workspace name from dialog → ✅ works
3. `closeProjectDialogSafe(btn)` → **dialog DOM destroyed**
4. Step 3: `findElement(ML_ELEMENTS.PROGRESS)` → ❌ element no longer exists

Step 3 was searching for an element that had already been removed from the DOM
when the dialog was closed after Step 2.

```
Timeline (BROKEN):
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ Open     │   │ Read WS  │   │ CLOSE    │   │ Read     │
  │ dialog   │ → │ name     │ → │ dialog   │ → │ progress │
  │          │   │ ✅       │   │          │   │ ❌ GONE  │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

---

## Fix

Added `keepDialogOpen` parameter to `detectWorkspaceViaProjectDialog()`.

When called from `runCheck()`, the dialog stays open after Step 2 so that
Step 3 can read the progress bar while it's still in the DOM. The dialog
is closed **after** Step 3 completes.

```
Timeline (FIXED):
  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ Open     │   │ Read WS  │   │ Read     │   │ CLOSE    │
  │ dialog   │ → │ name     │ → │ progress │ → │ dialog   │
  │          │   │ ✅       │   │ ✅       │   │          │
  └──────────┘   └──────────┘   └──────────┘   └──────────┘
```

### Changes

| File | Change |
|------|--------|
| `workspace-detection.ts` | `detectWorkspaceViaProjectDialog()` accepts `keepDialogOpen?: boolean`; returns `Promise<Element \| null>` (the button ref); `pollForWorkspaceName()` skips `closeProjectDialogSafe()` when `keepDialogOpen=true` |
| `loop-engine.ts` | `runCheck()` passes `keepDialogOpen=true`, does Step 3 while dialog is open, then calls `closeProjectDialogSafe(dialogBtn)` |

---

## Non-Regression Rules

1. **NR-09-A**: Step 3 (progress bar read) MUST execute while the project dialog is still open
2. **NR-09-B**: The dialog MUST be closed after Step 3 completes (never left open)
3. **NR-09-C**: `autoDetectLoopCurrentWorkspace` continues to close the dialog normally (keepDialogOpen=false)
4. **NR-09-D**: Any future XPath that reads from the dialog overlay (`div[6]`) must run before dialog close

---

## Cross-References

- [Check Button Spec](../../21-app/02-features/chrome-extension/60-check-button-spec.md)
- [Issue #08: workspaceFromApi Race](08-workspace-detection-race.md)
- [Check Button Overview](01-overview.md)

---

*Issue #09 — 2026-03-21*
