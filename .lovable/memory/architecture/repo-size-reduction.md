---
name: repo-size-reduction
description: pnpm store + node_modules CI caching, .gitignore hygiene, and ANALYZE-gated bundle visualizer to keep repo and CI footprint small
type: architecture
---

## Repo Size Reduction Strategy (applied 2026-04-20)

### CI caching (`.github/workflows/ci.yml`)
Every job (setup, build-sdk, build-xpath, build-macro-controller, build-prompts, build-extension) caches:
1. **pnpm content-addressable store** at `$(pnpm store path)` keyed on `**/pnpm-lock.yaml` + `**/package-lock.json` hash
2. **node_modules** (root + `standalone-scripts/*/node_modules`) with per-job key prefix `nm-<job>-` plus shared restore-key fallback

Install command is `pnpm install --prefer-offline --no-frozen-lockfile` — network-free when cached.

`fetch-depth: 1` on every checkout (was 0 only on setup) — shallow clones save bandwidth across all 6 jobs.

`pnpm/action-setup@v4` is invoked with `run_install: false` so caching steps run BEFORE install.

Expected impact: cached CI runs install in ~10s instead of ~2min per job × 6 jobs.

### Bundle visualizer gating (`vite.config.extension.ts:402`)
The `rollup-plugin-visualizer` (`bundle-report.html`, ~1-3 MB per build) is now gated behind `process.env.ANALYZE === "1"`. Default builds skip it. Run `ANALYZE=1 pnpm run build:extension` to generate the report.

### .gitignore (READ-ONLY in this project)
The project's `.gitignore` is marked read-only and could not be edited. The user must manually add: `.vite/`, `**/.vite/`, `stats.html`, `bundle-report.html`, `**/bundle-report.html`, `.pnp.*`, `**/.pnp.*`, `**/dist/`, `coverage/`, `**/coverage/`, `**/__snapshots__/*.snap.bak`, `.release/`, `diagnostic-*.zip`, `**/diagnostic-*.zip`.

### Local pnpm store
`powershell.json` already sets `pnpmStorePath: ".pnpm-store"`. For dev machines, prefer same-drive store so `package-import-method=hardlink` can be used instead of cross-drive `copy` mode. See `scripts/ps-modules/pnpm-config.ps1` Configure-PnpMode for cross-drive detection logic.
