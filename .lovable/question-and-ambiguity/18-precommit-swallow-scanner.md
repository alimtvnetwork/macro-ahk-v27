# 18 — Pre-commit scanner: husky hook vs npm `check:` script

## Context
User asked: "Implement an automated pre-commit scan that flags empty
catch blocks and promise `.catch(() => {})` patterns so missing logs
can't slip in again."

The repo has **no husky / lint-staged / git hooks** today. The
established pattern is `scripts/check-*.mjs` runners wired to
npm scripts (~30 such checks in package.json, e.g.
`check:result-webhook`, `check:failure-log-schema`,
`check:no-bg-dynamic-import`). They are run by CI and locally via
`npm run check:*`.

## Options

### A. Add husky + lint-staged + a true git pre-commit hook
- Pros: literal "pre-commit" semantics; runs automatically on
  `git commit`.
- Cons: introduces a new dev toolchain (husky + lint-staged in
  devDeps), a `prepare` script, and a hooks dir; the user's
  internal git tooling (per Lovable rules: "Never run stateful git
  commands") is managed by the platform — adding an unsupported
  hook layer risks breakage and divergence from the existing
  `check:*` convention. Scope creep.

### B. Ship a `scripts/check-no-swallowed-errors.mjs` runner +
       `npm run check:no-swallowed-errors` script, matching the
       existing pattern; CI / future husky setup can call it
- Pros: identical to every other guard in the repo; instantly
  composable with `npm-run-all` and CI; zero new devDeps; user's
  existing CI workflow can wire it as a required check (the
  "pre-commit" guarantee comes from CI gating PRs, which is how
  every other `check:*` script enforces things today); easy to add
  a husky hook later without changing the scanner.
- Cons: doesn't literally fire on `git commit` until CI or a hook
  invokes it.

## Recommendation
**Option B.** Matches every existing guard. Honors the
"Linting: Zero ESLint warnings/errors; modular architecture" core
rule, and slots into the same enforcement chain as
`check:result-webhook`, `check:failure-log-schema`, etc. Adds
unit tests under `scripts/__tests__/` to mirror the pattern of
`check-failure-log-schema.test.mjs`.

## Decision
Proceeding with Option B. Will:
1. Add `scripts/check-no-swallowed-errors.mjs` — flags
   `} catch {}` / `} catch (e) {}` / empty catch bodies and
   `.catch(() => {})` / `.catch(() => null)` etc. across `src/`
   and `standalone-scripts/`.
2. Wire `check:no-swallowed-errors` into package.json scripts.
3. Add `scripts/__tests__/check-no-swallowed-errors.test.mjs`.
4. Document the rule + waiver mechanism (`// eslint-allow-swallow:
   <reason>` inline comment).
