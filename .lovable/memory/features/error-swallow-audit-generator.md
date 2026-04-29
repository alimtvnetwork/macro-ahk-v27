
Build wiring (2026-04-27):
- `package.json` script `audit:error-swallow` runs the generator standalone.
- `build` and `build:dev` chain it after `verify-worktree-fresh` and before `vite build`, so `public/error-swallow-audit.json` is regenerated on every production/dev build.
- Failure of the generator fails the build (fail-fast, matches `mem://constraints/no-retry-policy`).
