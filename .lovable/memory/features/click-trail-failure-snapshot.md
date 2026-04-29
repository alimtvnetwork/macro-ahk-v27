---
name: Click Trail Failure Snapshot
description: Click trail and boot failure persisted across popup reopens so the "Recent actions" banner section always matches the failure that caused degraded mode
type: feature
---

# Click Trail Failure Snapshot (v2.176.0+)

## Problem

`BootFailureBanner` showed `readClickTrail()` (live sessionStorage), so as the user clicked around the popup after the failure, the "Recent actions" list drifted away from the actions that actually preceded the boot failure. Reopening the popup also lost the boot context if the service worker had restarted and `GET_STATUS` raced ahead of boot diagnostics being repopulated.

## Solution — two persistence layers

### 1. Boot side (`src/background/boot.ts`)

`persistBootFailure()` writes a richer payload to `chrome.storage.local.marco_last_boot_failure`:

```ts
{
  step, message, stack, at,
  failureId,            // `failed:<step>|<message-prefix-80>`
  context: BootErrorContext | null  // SQL / migration step
}
```

`failureId` is a stable fingerprint so the popup can detect "same failure I already snapshotted" across popup re-opens AND service-worker restarts. `context` is included so degraded-mode UI can render the failing-operation block even when GET_STATUS races against a fresh SW boot.

### 2. Popup side (`src/lib/click-trail.ts`)

Adds frozen-snapshot helpers, all keyed on `failureId`:

- `freezeClickTrail(failureId)` — copies the live trail into `sessionStorage[FROZEN_KEY_PREFIX + failureId]`, idempotent (first capture wins). Evicts when more than `MAX_FROZEN_SNAPSHOTS` (5) snapshots accumulate.
- `readFrozenClickTrail(failureId)` — returns the stored snapshot or `null`.
- `clearFrozenClickTrails()` — drops all snapshots after explicit reload.

Frozen snapshots use `sessionStorage` (per-tab, survives popup re-opens within the same browser session). The SW-side persistence (`chrome.storage.local`) survives SW restarts.

### 3. Hook glue (`src/hooks/use-popup-data.ts`)

`hydrateBootFailureSnapshot()` runs as part of `refresh()`:

1. Reads `chrome.storage.local.marco_last_boot_failure`.
2. If present, sets `persistedFailure` AND either reads the existing frozen trail or freezes the live trail under `payload.failureId`.
3. Fallback when only live status reports failure (no persisted record yet): synthesises a fingerprint from `bootStep|bootError.slice(0,80)` and freezes against that.

The hook now also exposes `effectiveBootStep / Error / ErrorStack / ErrorContext` — overlaying live `GET_STATUS` on top of `persistedFailure` so the banner survives SW restarts.

### 4. Banner (`src/components/popup/BootFailureBanner.tsx`)

- New optional prop `frozenTrail?: ClickTrailEntry[] | null`.
- Prefers frozen trail over live `readClickTrail()` when supplied.
- Header label switches to `Recent actions (N) — snapshot at failure` when frozen.
- Plain-text report annotates the section with `— snapshot at failure` vs `— live`.

## Storage layout

| Layer                     | Key                                          | Lifetime              |
| ------------------------- | -------------------------------------------- | --------------------- |
| `chrome.storage.local`    | `marco_last_boot_failure`                    | Across SW restarts    |
| `sessionStorage` (popup)  | `marco_ui_click_trail`                       | Live trail (rolling)  |
| `sessionStorage` (popup)  | `marco_ui_click_trail_frozen:<failureId>`    | Per-failure snapshot  |
