---
name: Standalone build cache
description: scripts/cached-build.mjs content-hashes src+tsconfig+vite+lockfile; CI uses actions/cache@v4 keyed on same inputs; tsc incremental enabled; ~6× local speedup, ~640× on tsc+vite portion alone
type: feature
---
# Standalone build cache

Two-layer cache for `standalone-scripts/*` builds (sdk, xpath, macro-controller, payment-banner-hider, lovable-common, lovable-owner-switch, lovable-user-add).

## Layer 1 — content-hash wrapper (`scripts/cached-build.mjs`)

Wraps the `tsc + vite + post-snapshot` portion of each `pnpm run build:<name>` chain. Pre-guards (`check-axios-version`, `compile-instruction`, `check-instruction-json-casing`, prompts/less/templates/seed-manifest/version-sync) stay outside the cache because they are cheap and have side effects beyond `dist/`.

**Cache key inputs (deterministic order, SHA-256, truncated to 24 hex):**
1. Every file under `standalone-scripts/<name>/src/**`
2. tsconfig file (canonical or legacy: e.g. `tsconfig.sdk.json` for marco-sdk)
3. vite config file (canonical or legacy)
4. `standalone-scripts/<name>/package.json`
5. `standalone-scripts/<name>/instruction.ts`
6. Root `pnpm-lock.yaml`
7. Build command + `--mode` flag
8. Optional `--extra-input=<path>` flags

**Layout:** `.cache/standalone-builds/<name>/<hash>/dist/` plus `<hash>.json` manifest.

**Behaviour:** HIT → `cp -r` cached `dist/` over `standalone-scripts/<name>/dist/` in <10ms, skip tsc + vite entirely. MISS → run inner command, snapshot resulting `dist/` into cache. Fail-fast: build error → no cache write.

**Bypass envs (no retry, no probabilistic recovery):**
- `STANDALONE_BUILD_NO_CACHE=1` → always rebuild, never write
- `STANDALONE_BUILD_FORCE=1` → ignore HIT, rebuild, overwrite

**Measured speedup (lovable-common, 32 source files):** 3734ms → 617ms wall-clock (6.0×); the `tsc + vite` inner portion alone went 3199ms → 5ms (~640×).

## Layer 2 — TS incremental

Every standalone tsconfig (`tsconfig.{sdk,xpath,macro.build,payment-banner-hider,lovable-common,lovable-owner-switch,lovable-user-add}.json`) has `incremental: true` + `tsBuildInfoFile: .cache/tsbuildinfo/<name>.tsbuildinfo`. Even on cache MISS this trims tsc time by reusing the previous run's type-check graph.

## Layer 3 — CI cache integration

Each of the 8 standalone build jobs in `.github/workflows/ci.yml` has a `Cache standalone build · <name>` step (using `actions/cache@v4`) inserted **immediately before** the `pnpm run build:<name>` step. It caches both `.cache/standalone-builds/<name>` and `.cache/tsbuildinfo/<name>.tsbuildinfo`. Cache key uses `hashFiles(...)` over the same input set as the script. The script then re-validates per-input on restore — even partial/stale CI restores still produce correct builds (script falls through to MISS for any per-input mismatch).

## Orchestrator wiring (`scripts/build-standalone.mjs`)

`PARALLEL_JOBS` now invokes the wrapper per-project (one cached step per job) instead of the previous `npx tsc → npx vite → node post-script` triplet. Inner shell command preserves the original behaviour exactly so cache MISSES are byte-equivalent to the pre-cache pipeline.

## Maintenance

- Adding a new standalone script: register it in the registry (preflight will tell you the 7 files), then wrap `build:<name>` with `node scripts/cached-build.mjs --name=<name> -- sh -c "<original tsc+vite chain>"`, and inject a CI cache step using `/tmp/inject-cache.mjs` (one-shot helper) or by hand following the pattern.
- Cache eviction: hashed-by-content, so stale entries are inert. To purge locally: `rm -rf .cache/standalone-builds .cache/tsbuildinfo`. CI cache TTL is GitHub's default (7 days untouched).
