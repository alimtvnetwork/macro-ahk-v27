# 29 — Typecheck App gate: scope and projects to cover

**Task**: Add a CI gate that always runs TypeScript typecheck and fails the build immediately on any type errors like `ParseDeliveryBaseResult` mismatches.

**Ambiguity**: User cited `ParseDeliveryBaseResult` as the exemplar, but `rg` finds zero references in the repo — symbol either lives in a removed/renamed file or is a synthetic example. Real question: which TypeScript projects should the new gate cover?

| Option | Scope | Pros | Cons |
|---|---|---|---|
| A — App only | `tsconfig.app.json` (src/**) | Smallest blast radius; mirrors what user "probably meant" given `ParseDelivery*` sounds like webhook code in `src/` | Misses `tsconfig.node.json` (vite/scripts) — same class of bug just one folder away |
| **B — Solution-style (CHOSEN)** | Every project referenced by root `tsconfig.json` (currently `tsconfig.app.json` + `tsconfig.node.json`) | Matches the existing `typecheck-standalone` pattern (covers ALL standalone tsconfigs in one job); future-proof — when a new project is added to `tsconfig.json` `references[]`, just add one entry to PROJECTS[] in the wrapper | Slightly slower (~2s extra for node tooling) |
| C — All tsconfigs in repo | App + node + 7 standalone tsconfigs | Single source of truth, no orphans | Duplicates `typecheck-standalone` work; would need to either delete the existing job or accept double-run |

**Decision**: **Option B**. The existing `typecheck-standalone` job already covers `standalone-scripts/**` projects via four direct `tsc -p` calls; the **gap** the user is describing is the main `src/**` tree, which only `tsconfig.app.json` covers — and `tsconfig.node.json` should ride along since it shares the same root tsconfig and the same class of regression risk. Wrapping both in a single `scripts/typecheck-app.mjs` keeps future additions to one PROJECTS[] array.

**Files created/edited**:
- `scripts/typecheck-app.mjs` (new — sequential, fail-fast wrapper writing per-project `.cache/tsbuildinfo/<name>.tsbuildinfo`)
- `package.json` — added `typecheck`, `typecheck:app`, `typecheck:node` scripts
- `.github/workflows/ci.yml` — added `typecheck-app` job (Job 0b2), wired into `build-extension`'s `needs:` so type errors block merges

**Verified**: `pnpm run typecheck` passes locally (app 18.6s, node 1.7s, both clean). YAML validated.

**Reversibility**: One-line revert in `build-extension` `needs:` removes the gate without affecting any other job; deleting the job block + script is fully additive removal.
