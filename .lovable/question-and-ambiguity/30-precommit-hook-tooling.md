# 30 — Pre-commit hook tooling: husky vs native git hook

**Task**: Enable a pre-commit hook to run ESLint for `standalone-scripts/**` files so nested template literal issues (and other lint diagnostics) are caught before pushing.

**Ambiguity**: Two well-known approaches; user did not specify.

| Option | Stack | Pros | Cons |
|---|---|---|---|
| A — `husky` + `lint-staged` | Industry default; rich CLI | Familiar to most contributors; handles partially-staged files (auto-stash); composable across hook types | Adds 2 new deps (~250 KB); introduces `.husky/` directory + dotfiles; `prepare` script writes into `node_modules/.bin/husky` which has had multiple breaking changes (v4→v8→v9) |
| **B — Native git hook + tiny node runner (CHOSEN)** | Zero new deps; `prepare` lifecycle writes `.git/hooks/pre-commit` invoking `node scripts/lint-staged-standalone.mjs` | Matches existing project pattern (every other tooling script is vanilla node + git: `clean-build.mjs`, `cached-build.mjs`, `typecheck-app.mjs`, `audit-error-swallow.mjs`); zero supply-chain surface; idempotent installer with `SKIP_GIT_HOOKS=1` escape hatch; supports linked worktrees (gitdir file) | Does NOT auto-stash partial-stage changes — if a file is partially staged, ESLint sees the working-tree version; acceptable trade-off given the standalone-scripts churn pattern (whole-file edits) |
| C — `simple-git-hooks` | One small dep (~30 KB) | Smaller than husky | Still a third-party dep; same goal achievable in 90 lines of node |

**Decision**: **Option B**. Three reinforcing reasons:
1. **Zero-dep philosophy.** Every existing tooling script is vanilla node + git/spawn — adding husky breaks the pattern for marginal benefit.
2. **Idempotent + safe.** Installer skips silently when `.git/` is missing or read-only (Nix sandbox case verified), and re-installs every `pnpm install` via `prepare`.
3. **Hot-path scope is narrow.** The hook only lints staged `standalone-scripts/**/*.{ts,tsx}` files — fast (sub-second on small commits), surgical, and identical ruleset to the CI `lint-standalone` job (`--max-warnings=0`).

**Files created/edited**:
- `scripts/install-git-hooks.mjs` (new — idempotent installer; gitfile/worktree-aware; writable-probe for read-only sandboxes)
- `scripts/lint-staged-standalone.mjs` (new — staged-file filter → ESLint runner; supports `--all` for manual full-sweep)
- `package.json` — added `prepare`, `hooks:install`, `hooks:lint-staged`, `hooks:lint-all-standalone` scripts

**Verified**: Installer wrote `pre-commit` into the linked-worktree hooks dir; runner lints all 60+ standalone TS files clean in `--all` mode.

**Reversibility**: Delete the two scripts, remove the four package.json entries, and `rm <gitdir>/hooks/pre-commit`. No data migration, no config changes elsewhere.
