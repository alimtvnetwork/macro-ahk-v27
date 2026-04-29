# Memory: architecture/extension-error-management
Updated: 2026-04-21 (v2.172.0)

## Multi-layered error reporting

The extension uses a multi-layered error management strategy:

1. **Non-critical fallbacks** use `console.debug` (no UI surface).
2. **Critical errors** are routed through `RiseupAsiaMacroExt.Logger.error()` and surfaced in the popup error count badge.
3. **Boot failures** are captured by `boot.ts`'s top-level `try/catch` and exposed via four signals:
   - `setBootStep("failed:<step>")` — names the failed phase
   - `setBootError(err)` — captures the underlying `Error.message` and stack
   - `chrome.storage.local.marco_last_boot_failure` — persisted `{ step, message, stack, at }` so the popup can recover the failure across SW restarts
   - `BootFailureBanner` — rich diagnostic UI (see below)

## Boot failure surfacing (v2.172.0+)

`status-handler.ts` returns `bootError: string | null` and `bootErrorStack: string | null` in `GET_STATUS`. The popup banner (`src/components/popup/BootFailureBanner.tsx`) renders:

- **Header** — failed step + cause-classified label badge (WASM load / OPFS / chrome.storage / Schema migration / Schema / unknown) + "Copy report" button.
- **Suggested fix** — numbered, cause-specific recovery steps from `getFixSteps(cause)`.
- **Stack trace** — collapsible monospace block with all frames.
- **Recent actions** — collapsible click trail (see below).

Cause classification (`classifyCause`) inspects `bootError` for keywords: `wasm`/`sql-wasm`, `opfs`/`getDirectory`/`navigator.storage`, `chrome.storage`/`quota`, `migration`/`alter table`/`create table`, `schema`.

## UI Click Trail (v2.172.0+)

`src/lib/click-trail.ts` records the last 25 user interactions (clicks, route changes, modifier-key shortcuts, popup mount events) into `sessionStorage` under `marco_ui_click_trail`. Attached once globally from `src/main.tsx` via `attachClickTrail()`. The trail is read by `BootFailureBanner` and bundled into the `Copy report` clipboard payload alongside the stack trace.

## Common db-init causes

- **WASM 404** — `wasm/sql-wasm.wasm` not present in the extension output (`chrome-extension/`). Check `viteStaticCopy` target in `vite.config.extension.ts` and the post-build `Manifest path validation` in `extension-build.ps1`.
- **OPFS unavailable** — `navigator.storage.getDirectory()` throws (rare; falls through to `chrome.storage.local`, then in-memory).
- **Schema migration failure** — A `migrateSchema()` step throws; the rollback path runs `migration.down()` and the manager remains in a degraded state.

## Report bundle format

`Copy report` produces a plain-text bundle:

```
═══════════════════════════════════════════
  Marco Boot Failure Report
  Generated: <ISO>
═══════════════════════════════════════════

Failed step:    <step>
Cause:          <label> (<kind>)
Error message:  <message>

── Suggested fix ─────────────────────────
  1. ...
  2. ...

── Stack trace ───────────────────────────
<stack>

── Recent UI actions (N) ─────────
  <ISO>  [click]  Run macro  @ button#run.btn-primary
  ...
```
