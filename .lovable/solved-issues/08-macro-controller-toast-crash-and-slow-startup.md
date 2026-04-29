# Macro Controller: Toast Crash + Slow Startup

## Issue 1: `o.toast is not a function` (Critical) — FIXED

### Symptoms
```
[Marco] Script default-macro-looping error: o.toast is not a function
Stack: TypeError: o.toast is not a function
    at te (marco-injected-main.js:220:212)
```

### Root Cause

**Type mismatch between SDK and Controller.**

| Layer | Code | Shape |
|-------|------|-------|
| **SDK** (`marco-sdk-template.ts:107`) | `notify: __marcoNotify` | **plain function** `(message, level, durationMs)` |
| **Controller** (`toast.ts:49-56`) | `m.notify.toast(...)` / `m.notify.dismissAll()` | expects **object** `{ toast, dismissAll, onError, getRecentErrors, _setStopLoopCallback, _setVersion }` |

### Fix Applied

Restructured `window.marco.notify` in SDK template from a plain function to a closure-based object with `.toast()`, `.dismissAll()`, `.onError()`, `._setStopLoopCallback()`, etc.

**File**: `src/background/marco-sdk-template.ts` (lines 107-130)

---

## Issue 2: Slow Script Loading (Performance) — FIXED

### Symptoms
- 2-5s blank/stale panel before UI appears
- "UI recovery failed — forcing full re-bootstrap" on re-injection

### Root Cause

The bootstrap was a **serial waterfall**: UI creation waited for token resolution (up to 4s) + API calls before rendering anything.

```
[OLD — serial]
ensureTokenReady(4000ms max)     ← polls every 250ms
  └─► fetchLoopCreditsAsync      ← HTTP round-trip
  └─► Tier 1 mark-viewed fetch   ← another HTTP round-trip
  └─► createUI()                 ← UI only now appears
```

### Fix Applied — UI-First Strategy (v7.42+)

```
[NEW — UI-first]
createUI()                       ← UI visible at t=0
startWorkspaceObserver()         ← observer starts immediately
ensureTokenReady(2000ms)         ← reduced from 4s, async background
  └─► fetchLoopCredits + Tier1   ← parallel
  └─► autoDetect workspace       ← hydrate into existing UI
  └─► updateUI()                 ← data appears in already-visible panel
```

**File**: `standalone-scripts/macro-controller/src/startup.ts` (bootstrap function)

### Changes
1. `createUI()` moved before any async work — panel renders at t=0
2. Token timeout reduced from 4000ms → 2000ms
3. No UI timeout fallback needed (UI already rendered)
4. Loading toast changed from "initializing..." to "loading workspace..."

### Related Memory
- `.lovable/memory/features/macro-controller/startup-initialization.md`
- `.lovable/memory/features/macro-controller/initialization-flow-v2.md`
- `spec/04-macro-controller/ts-migration-v2/01-initialization-fix.md`
