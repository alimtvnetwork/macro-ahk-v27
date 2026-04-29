# Memory: architecture/storage/prompts-filesystem-seeding
Updated: 2026-04-02

The prompts system uses a folder-based structure in `standalone-scripts/prompts/`. Each prompt lives in its own folder named `[sequence]-[slug]` containing `info.json` (metadata) and `prompt.md` (content).

## Build Pipeline

`scripts/aggregate-prompts.mjs` reads all prompt folders and outputs to a single location:
- **`dist/prompts/macro-prompts.json`** — sole output, copied to `chrome-extension/dist/prompts/` by the Vite `viteStaticCopy` plugin

The legacy copy to `standalone-scripts/macro-controller/dist/03-macro-prompts.json` was removed (consolidated in April 2026). The `instruction.ts` prompts field is now empty since the `__MARCO_PROMPTS__` preamble injection was removed in v7.43 — prompts are fetched dynamically via the GET_PROMPTS bridge.

## Runtime Loading

The prompt-handler loads from `prompts/macro-prompts.json` via `chrome.runtime.getURL()`, computes a `count-hash36` version, and seeds/upserts into SQLite.

## UI Snapshot Cache

The prompt dropdown now caches its fully rendered HTML + filter state + scroll position + data hash in IndexedDB (`ui_snapshots` store). On re-open, the snapshot is restored instantly with event listeners re-bound — no re-render loop needed. The cache auto-invalidates when the underlying data hash changes, or on explicit save/delete operations.

## Deploy Reseed (Full Wipe)

On every boot (triggered by `run.ps1 -d` deploy), `reseedPrompts()` runs during the boot sequence:
1. Wipes ALL prompts (Prompts, PromptsToCategory, PromptsCategory tables)
2. Re-fetches `prompts/macro-prompts.json` from dist
3. Re-inserts all defaults with categories

This ensures prompts always match the latest compiled source. User-created prompts are NOT preserved across deploys. Currently 13 prompts across categories: general, versioning, code-coverage, and automation.
