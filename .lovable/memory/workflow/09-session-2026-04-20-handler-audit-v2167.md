# Session 2026-04-20 — Handler Audit (v2.167.0)

> **Goal:** Audit prompt-handler, library-handler, settings-handler, project-handler, project-config-handler, script-config-handler, updater-handler, and run-stats-handler for `handler-guards` adoption. Drive the audit by relying on the new SQLite Proxy (v2.165.0) to surface any latent undefined-bind sites with precise column names.

## Audit Matrix

| Handler                     | SQLite? | Risk surface                                                     | Action |
|-----------------------------|---------|------------------------------------------------------------------|--------|
| `settings-handler.ts`       | ❌       | chrome.storage.local only                                        | None — out of scope |
| `project-handler.ts`        | ❌       | chrome.storage.local; per-project SQLite goes through wrapper    | None |
| `project-config-handler.ts` | ✅       | `m.project / m.section / m.key` already validated; values via `?? ""` | None — already guarded |
| `script-config-handler.ts`  | ❌       | chrome.storage.local only                                        | None |
| `run-stats-handler.ts`      | ❌       | chrome.storage.local only                                        | None |
| `prompt-handler.ts`         | ✅ many  | `handleSavePrompt` UPDATE took raw `prompt.name/text/version`; `handleDeletePrompt` / `handleReorderPrompts` had no entry validation; `Number(promptIds[i])` could become NaN | **Hardened** |
| `library-handler.ts`        | ✅ many  | `handleSaveSharedAsset`, `handleSaveAssetLink`, `handleSaveProjectGroup` had no entry validation; `?? null` was already used for nullable columns | **Hardened entry points + bind coercion** |
| `updater-handler.ts`        | ✅ many  | `handleCreateUpdater` (`name`, `scriptUrl`) and `ensureUpdaterCategory` (`name`) had no entry validation | **Hardened entry points** |

## Hardening Applied (v2.167.0)

### `prompt-handler.ts`
- Imported `bindOpt`, `requireField`, `missingFieldError`, `HandlerErrorResponse`.
- `insertPromptRow`: replaced `prompt.name || "Untitled"`-style coalescing with `bindOpt(prompt.name) ?? "Untitled"` for both INSERT and UPDATE paths.
- `handleSavePrompt`: INSERT path now uses `bindOpt()` for name/text/version.
- `handleDeletePrompt`: returns `HandlerErrorResponse` when `promptId` is missing or not numeric (instead of `Number(undefined) === NaN` reaching SQLite).
- `handleReorderPrompts`: validates `promptIds` is an array, skips invalid IDs in the loop instead of binding NaN.

### `library-handler.ts`
- Imported guards.
- `handleSaveSharedAsset`: validates `asset.Name`, `asset.Type`, `asset.Slug`, `asset.ContentJson` at entry. Coerces `asset.Version` via `bindOpt() ?? "1.0.0"`.
- `handleSaveAssetLink`: validates `link.SharedAssetId` and `link.ProjectId` are numbers. Routes `LinkState`, `PinnedVersion`, `LocalOverrideJson` through `bindOpt()`.
- `handleSaveProjectGroup`: validates `group.Name`. Routes `SharedSettingsJson` through `bindOpt()`.

### `updater-handler.ts`
- Imported `bindOpt`, `requireField`.
- `handleCreateUpdater`: validates `data.name` and `data.scriptUrl`. Routes `versionInfoUrl`, `instructionUrl`, `changelogUrl` through `bindOpt()` (replaces `?? null`).
- `ensureUpdaterCategory`: validates `name` non-empty before binding.

## Out-of-Scope Files

The remaining handlers (`settings-handler`, `project-handler`, `script-config-handler`, `run-stats-handler`) do not perform any SQLite writes — they persist exclusively to `chrome.storage.local`. They cannot trigger a `BindError` and therefore need no `handler-guards` adoption. `project-config-handler` already validates its required fields at the top of every handler.

## Defence-in-Depth Status After v2.167.0

1. **Layer 1 — Entry-point validation (`handler-guards.ts`):** Adopted by 10 SQLite-backed handlers (was 7).
2. **Layer 2 — SDK-side defaulting (KV namespace):** Unchanged from v2.162.0.
3. **Layer 3 — `wrapDatabaseWithBindSafety` Proxy:** Unchanged. Still the safety net of last resort, now exercised by every handler.

## Verification

- `npx eslint src/background/handlers/{prompt,library,updater}-handler.ts` → zero warnings.
- `npx tsc --noEmit -p tsconfig.json` → zero errors.
- Version unified at v2.167.0 across `manifest.json`, `constants.ts`, and all standalone scripts (`macro-controller`, `marco-sdk`, `xpath`).

## Next Logical Step

Add vitest unit tests for `assertBindable` and `wrapDatabaseWithBindSafety` so the BindError column inference is locked in regardless of future handler refactors.
