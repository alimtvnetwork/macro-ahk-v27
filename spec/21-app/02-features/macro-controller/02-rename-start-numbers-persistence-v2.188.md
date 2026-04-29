# Spec: Bulk Rename — Per-Variable Start Numbers UI + Persistence

**Version target**: v2.189.0
**Owner area**: `standalone-scripts/macro-controller/src/ui/bulk-rename.ts`,
`standalone-scripts/macro-controller/src/ui/bulk-rename-fields.ts`,
`standalone-scripts/macro-controller/src/rename-preset-store.ts`,
`standalone-scripts/macro-controller/src/rename-template.ts`
**Related**: `spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md`,
`spec/21-app/02-features/chrome-extension/41-bulk-workspace-rename.md`,
`.lovable/memory/features/macro-controller/rename-system.md`

---

## 1. Problem

The Bulk Rename dialog already documents three numbering variables:

- `$$$` (yellow)
- `###` (primary/violet)
- `***` (green)

The hint line says "zero-padded by count ($$$ → 001). Works in prefix, template, suffix."

However, the per-variable **Start Number** inputs that control where each
sequence begins (e.g. start `$$$` at `129`, start `###` at `1`, start `***`
at `5`) are broken in two ways:

### Bug 1 — Start-number inputs are visually rendered but functionally inert

In `bulk-rename.ts → _buildRenameInputs`:

```ts
const startDollar = 1, startHash = 1, startStar = 1;
const getStartNums = () => ({ dollar: startDollar, hash: startHash, star: startStar });
```

These are plain `const` locals. The `<input type="number">` fields that
`_detectVarsAndRenderStarts` injects into `#rename-start-nums` are never wired
to update them. User edits are silently discarded; the live preview always
uses `1,1,1`; the actual rename PUT calls always start at `1`.

### Bug 2 — Inputs are rebuilt on every keystroke, destroying typed values

`_detectVarsAndRenderStarts` is called from `updatePreview`, which fires on
every `oninput` of the prefix/template/suffix fields. It rewrites
`container.innerHTML = html`, which replaces the start-number `<input>`s and
**resets them to `startDollar/startHash/startStar` (always `1`)**. So even if
a user clicks a start-number field and types `129`, the next keystroke in the
template field wipes it back to `1`.

### Bug 3 — Start numbers are not persisted to / restored from IndexedDB

`_readUiToPreset` reads `inputs.getStartNums()` (always `{1,1,1}`) and writes
those values into the `RenamePreset` record in IndexedDB. `_populateUiFromPreset`
explicitly notes:

```ts
// Start numbers are populated via the variable detection on updatePreview
```

…but variable detection re-renders with hard-coded `1`s, so the loaded
preset's `startDollar / startHash / startStar` are silently discarded.

The `RenamePreset` schema in `rename-preset-store.ts` **already** has these
three fields — only the UI plumbing is missing.

---

## 2. Goals

1. Each numbering variable detected anywhere in prefix / template / suffix
   shows its own Start Number `<input type="number">`, defaulting to `1`,
   minimum `0`.
2. Editing a start-number input:
   - Updates the live Preview immediately.
   - Survives keystrokes in any other field (no innerHTML wipeout).
3. Start numbers are written to IndexedDB whenever the preset is saved
   (explicit save, dialog close, or preset switch — same auto-save points
   already used for prefix/template/suffix/delay).
4. Start numbers are restored from IndexedDB when:
   - A preset is loaded (preset switch, dialog open, "Default" fallback).
   - Even when the corresponding variable isn't currently in the template
     yet — re-typing `$$$` later must re-display the **previously saved**
     start value, not a fresh `1`.
5. The runtime rename engine (`applyRenameTemplate`) already accepts a
   `Record<string, number>` for per-variable starts — no change required
   there. We just must pass real values.

## 3. Non-Goals

- No change to the variable syntax (`$$$`, `###`, `***`) or zero-padding
  semantics.
- No change to the rename API, undo history, circuit-breaker, or delay
  logic.
- No new UI controls beyond the three start-number inputs that already
  appear conditionally.
- No migration of legacy presets — existing records already carry
  `startDollar / startHash / startStar` (defaulting to `1`); they will
  simply start being honored.

---

## 4. Design

### 4.1 State model

Replace the three `const` locals in `_buildRenameInputs` with a single
mutable record kept in closure scope:

```ts
const startNums: { dollar: number; hash: number; star: number } = {
  dollar: 1, hash: 1, star: 1,
};
const getStartNums = () => ({ ...startNums });
const setStartNum = (key: 'dollar' | 'hash' | 'star', value: number) => {
  startNums[key] = Number.isFinite(value) && value >= 0 ? value : 0;
};
```

`getStartNums()` returns a copy so callers can't mutate it accidentally.

### 4.2 Render strategy — preserve user input across re-renders

`_detectVarsAndRenderStarts` currently does `container.innerHTML = html`
on every keystroke. Two alternative strategies:

**Option A — read before re-render**: snapshot input values into `startNums`
right before the wipe, then re-render with the latest values.

**Option B — diff render**: only add/remove the inputs whose detected state
changed, leaving existing `<input>` elements (and their values) in the DOM.

We choose **Option A** for simplicity: it requires the smallest change to
the existing function and matches the rest of the dialog's "rebuild on
every keystroke" pattern. Concretely, before writing `innerHTML`, do:

```ts
_snapshotStartNumInputsInto(startNums); // read current DOM values
```

After writing `innerHTML`, re-attach `oninput` handlers that update
`startNums` and call `updatePreview()`.

Net behavior:
- Typing in template `→` snapshot reads `129` from `#rename-start-dollar`
  if it's there `→` rerenders with `value="129"` `→` user sees `129`
  preserved.
- Adding `***` to template re-runs detection, finds `hasStar = true`,
  injects the `**` input with the persisted `startNums.star` value
  (which is `1` by default but may be a previously-loaded preset value).

### 4.3 Persist + restore

`_readUiToPreset` already writes `startDollar / startHash / startStar`
from `inputs.getStartNums()`. Once §4.1 + §4.2 are correct, this
automatically persists the right numbers to IndexedDB on every auto-save.

`_populateUiFromPreset` must be updated to:

```ts
inputs.setStartNums({
  dollar: preset.startDollar ?? 1,
  hash:   preset.startHash   ?? 1,
  star:   preset.startStar   ?? 1,
});
inputs.updatePreview(); // triggers _detectVarsAndRenderStarts which now
                        // reads from the populated startNums closure
```

`RenameInputsResult` gains a `setStartNums(partial)` method.

### 4.4 Auto-save trigger

The auto-save trigger set already includes:
- Dialog close (`closeBtnTitle.onclick`).
- Preset switch (`onSwitch`).
- Explicit save button (`onSave`).
- Apply button (existing).

We must **also** ensure typing in a start-number input does not skip the
debounced auto-save. Since auto-save fires on dialog close / preset switch
(not per-keystroke today), no new trigger is required; the next save event
will pick up the freshest `startNums`.

### 4.5 Preview math

`applyRenameTemplate(template, prefix, suffix, starts, j, originalName)`
already handles `Record<string, number>` for `starts`. After the fix,
`starts = getStartNums() = { dollar: 129, hash: 1, star: 5 }` (example),
and `index = j` (0-based row index), so:
- Row 0 → `$$$` renders `129`
- Row 1 → `$$$` renders `130`
- etc.

This matches the user's screenshot expectation
(`P0129 R Mar D5v004 → P00010001 R Mar26 D3` was the wrong baseline; with
proper start numbers the user can produce e.g. `P00129...` series).

---

## 5. Implementation Plan

| Step | File | Change |
|------|------|--------|
| 1 | `bulk-rename.ts` | Replace 3 `const` locals with mutable `startNums` record + `setStartNums`/`getStartNums` accessors. |
| 2 | `bulk-rename.ts` | Add `_snapshotStartNumInputsInto(startNums)` helper; call it at the top of `_detectVarsAndRenderStarts` before writing innerHTML. |
| 3 | `bulk-rename.ts` | After innerHTML write, attach `oninput` listeners on the three possible inputs that call `setStartNum(...)` + `updatePreview()`. |
| 4 | `bulk-rename.ts` | Extend `RenameInputsResult` with `setStartNums(partial: Partial<{dollar; hash; star}>)`. |
| 5 | `bulk-rename.ts` | In `_populateUiFromPreset`, call `inputs.setStartNums({dollar: preset.startDollar, hash: preset.startHash, star: preset.startStar})` BEFORE `updatePreview()`. |
| 6 | `bulk-rename-fields.ts` | (Optional) Add `inputmode="numeric"` and clamp helper — already `min="0"` on the input. |
| 7 | (No change) `rename-template.ts` | Already correctly handles per-variable starts. |
| 8 | (No change) `rename-preset-store.ts` | Schema already has the three fields. |

## 6. Versioning

Bump from `2.188.0` → `2.189.0` via `node scripts/bump-version.mjs 2.189.0`.
Run `node scripts/check-version-sync.mjs` after.

## 7. Validation

- **Manual**: Open dialog → type `P$$$` in template → start-dollar input
  appears → type `129` → preview shows `P0129, P0130, P0131…`. Add `###`
  to suffix → start-hash input appears with `1`. Type in template → start
  values must NOT reset.
- **Persistence**: Set start-dollar to `129`, close dialog, reopen → `129`
  still in input. Switch presets → values change accordingly. Switch back
  → `129` restored.
- **Type-check**: `npx tsc -p standalone-scripts/macro-controller/tsconfig.json --noEmit`.
- **Version sync**: `node scripts/check-version-sync.mjs` returns `0`.

## 8. Open Questions (for user confirmation)

See chat — three small UX questions before implementation.
