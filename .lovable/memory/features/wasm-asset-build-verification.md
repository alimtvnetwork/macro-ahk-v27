---
name: WASM Asset Build Verification
description: Build-time and runtime guards ensuring sql-wasm.wasm is present, non-empty, and loadable so db-init never fails silently
type: feature
---

# WASM Asset Build Verification (v2.173.0+)

## Problem

After the `dist/ → chrome-extension/` build output move, `Boot failed at step: db-init` started appearing in the popup with no further detail. Suspected root causes:
- `wasm/sql-wasm.wasm` not copied to the new output dir
- `web_accessible_resources` rewritten by `copyManifest` plugin and missing the WASM entry
- WASM binary corrupted, empty, or incompatible with the installed sql.js JS shim

## Three-Layer Defense

### 1. Build-time hard guard — `verifyWasmAsset` plugin (vite.config.extension.ts)
Runs in `closeBundle` (after viteStaticCopy + copyManifest). Checks `chrome-extension/wasm/sql-wasm.wasm`:
- If present → no-op
- If missing but source exists in `node_modules/sql.js/dist/` → self-heals by copying directly
- If both missing → throws HARD ERROR with exact paths and reason

### 2. Source-of-truth manifest (manifest.json)
`copyManifest` no longer overwrites `web_accessible_resources`. The source `manifest.json` is authoritative for resource lists (wasm + content scripts + project assets). Previously the rewrite dropped content-script entries silently — a separate latent regression that's now fixed.

### 3. Runtime diagnostics — `loadSqlJs()` in src/background/db-manager.ts
Each failure mode in the WASM load chain has a distinct, actionable error message:
- **HEAD 404 / HEAD threw / HEAD 0 bytes** → tagged `[WASM_FILE_MISSING_404]` → banner classifies as `kind: "wasm-missing"` with dedicated 5-step fix (v2.174.0+)
- **fetch threw** → "WASM file not in chrome-extension/wasm/ — check viteStaticCopy"
- **fetch HTTP non-2xx** → "Not in web_accessible_resources or not copied"
- **arrayBuffer() threw** → "Failed to read response body"
- **0 bytes** → "File exists but is empty — rebuild"
- **initSqlJs() threw** → "Binary corrupted or incompatible with sql.js JS shim — run pnpm install"

## Surfacing

All runtime errors propagate up through `boot.ts` → `setBootError(err)` → `chrome.storage.local.marco_last_boot_failure` → `GET_STATUS.bootError + bootErrorStack` → `BootFailureBanner` cause classification.

The `verifyWasmPresence()` upfront HEAD check (v2.174.0+) runs before the body fetch so a packaging miss produces a fast, distinctive error path classified as `wasm-missing` rather than the generic `wasm` bucket.
