---
name: macro-controller-settings-modal
description: ⚙️ Settings cog button + modal in panel header. Edits expiryGracePeriodDays + refillWarningThresholdDays per JSON config; persisted in chrome.storage.local with override-priority resolver
type: feature
---

# Macro Controller Settings Modal (v2.218.0)

A `⚙️` icon in the panel header opens a floating modal for editing two
`__MARCO_CONFIG__.creditStatus.lifecycle` keys at runtime:

| Key                              | Used by                                         |
|----------------------------------|-------------------------------------------------|
| `expiryGracePeriodDays`          | `workspace-status.ts` — Expired→FullyExpired escalation |
| `refillWarningThresholdDays`     | `workspace-status.ts` — About-To-Refill pill window     |

## Persistence model — chrome.storage.local override

Per user choice. Storage key: `marco_settings_overrides_v1`.

The base JSON config (`__MARCO_CONFIG__`) remains the source of truth. The
override layer is overlaid only when a field is explicitly present and valid
(`number`, `>= 0`, finite). Empty input → field is removed from the override
so the JSON value (or named-constant default) takes over.

**Resolution priority** (`workspace-lifecycle-config.ts → getWorkspaceLifecycleConfig`):

1. `chrome.storage.local` override (settings-store cache)
2. `window.__MARCO_CONFIG__.creditStatus.lifecycle.<key>`
3. `DEFAULT_EXPIRY_GRACE_PERIOD_DAYS` / `DEFAULT_REFILL_WARNING_THRESHOLD_DAYS` constants

## Files

| File | Role |
|------|------|
| `settings-store.ts` | Async load/save + in-memory cache + change-notifier |
| `settings-modal.ts` | Floating modal: 2 inputs, Save/Reset/Cancel, inline validation |
| `settings-button.ts` | `⚙️` button factory used by panel header |
| `workspace-lifecycle-config.ts` | Overlays overrides on top of JSON config |
| `ui/panel-header.ts` | Mounts cog button between remix split and auth badge |
| `startup.ts` | Preloads overrides + subscribes for live UI re-render on save |

## UI behavior

- **Each field shows 3 values**: Effective (live), JSON (read-only), Default
- **Empty input** → reverts that field to JSON / default (not stored as `0`)
- **Save** → persists to `chrome.storage.local`, fires `onSettingsChange`,
  triggers `updateUI()` so workspace pills re-render with new thresholds
- **Reset** → clears `marco_settings_overrides_v1` entirely (full revert)
- **Validation** → non-negative finite number; bad input shows inline error,
  modal stays open, no save attempted
- **Esc / backdrop click / ✕** → dismiss when not submitting

## Lifecycle on startup

```
bootstrap()
  → loadSettingsOverrides()           // async, non-blocking
  → onSettingsChange(updateUI)        // re-render on save
  → ...rest of UI init proceeds in parallel
```

The first paint of the workspace list may use raw JSON values for ~10 ms
before the override loads from `chrome.storage.local`; once loaded, any
subsequent `updateUI()` call (resync, observer tick, etc.) picks up the
override automatically. Saving via the modal explicitly triggers
`updateUI()` so users see immediate effect.

## Edge cases handled

- chrome.storage.local unavailable (e.g., page context) → Save throws clear
  error; modal shows it inline, never silently fails
- Stored value of wrong type → `sanitize()` drops it; resolver falls back
- Negative or NaN input → blocked at parse with `"<label> must be a non-negative number"`
- Listener throws during change broadcast → caught + logged, other listeners still fire
- Modal opened twice → re-mounts handlers fresh, no stale Esc listeners
- User toggles override empty → field is `undefined` in storage, JSON wins again

## Acceptance criteria covered

| AC | Verified |
|----|----------|
| Cog visible in header | ✅ Mounted between remix split and auth badge |
| Modal shows 2 inputs with current value | ✅ Pre-filled from `getSettingsOverrides()` |
| Save persists across reload | ✅ `chrome.storage.local.set` + cache update |
| Reset reverts to JSON config | ✅ `clearSettingsOverrides()` writes `{}` |
| Empty input reverts that field | ✅ `parseInput('')` returns `undefined` → dropped |
| UI updates after save | ✅ `onSettingsChange(updateUI)` subscriber |
| Validation blocks negative/NaN | ✅ `parseInput()` throws, modal shows error |
