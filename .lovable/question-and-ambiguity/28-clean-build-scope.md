# 27 — Clean-build scope: how aggressive to purge?

**Task**: Add a clean-build option that clears caches and forces fresh
filesystem reads so missing-file errors can't appear from stale previous runs.

**Ambiguity**: Which cache layers to wipe? Three plausible scopes:

| Option | What it clears | Pros | Cons |
|---|---|---|---|
| A — Minimal | Only `.cache/standalone-builds/` | Fastest; only touches the layer the user complained about | Leaves stale `*.tsbuildinfo` and `node_modules/.vite/` which can themselves cause "missing file" / "module not found" phantoms |
| **B — Thorough (CHOSEN)** | All build caches: `.cache/standalone-builds`, `.cache/tsbuildinfo`, root `*.tsbuildinfo`, `node_modules/.vite`, `node_modules/.cache`, every `standalone-scripts/*/dist`, root `dist/` | Guarantees the next build is a true clean build from source; matches user's stated goal of eliminating *any* stale-file class of error; sub-second cost on SSD | Adds ~15s rebuild time vs warm cache (acceptable — opt-in via `pnpm run clean` / `build:clean`) |
| C — Nuclear | Option B plus `node_modules/` | Eliminates pnpm-link / phantom-dep cases too | Forces a full `pnpm install` (60s+); user said "caches", not "deps" — out of scope |

**Decision**: **Option B (Thorough)**. The user's framing ("missing-file errors can't appear from stale previous runs") explicitly targets the entire stale-state class, not just the standalone snapshot layer. tsbuildinfo and Vite's dep cache are well-known sources of phantom missing-file errors, so excluding them would partially defeat the request. Excluding `node_modules/` keeps the operation under a few seconds and respects the implicit boundary of "build caches" vs "dependency installation". The opt-in env var `STANDALONE_BUILD_NO_CACHE=1` is also exported into chained `build:clean` / `build:standalone:clean` runs as defence in depth.

**Files created/edited**:
- `scripts/clean-build.mjs` (new)
- `scripts/run-with-env.mjs` (new — replaces missing `cross-env` dep)
- `package.json` — added `clean`, `clean:dry`, `build:clean`, `build:standalone:clean`

**Reversibility**: Fully reversible. The clean script only deletes regenerable artifacts; sources, configs, and `node_modules/` are untouched. If Option B turns out too aggressive, narrowing the `STATIC_TARGETS` array in `clean-build.mjs` is a one-line change.
