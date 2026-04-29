# 34 — ESLint pin on run-summary-types.ts: scope & wiring

**Original task:** "Add an eslint step in CI that runs on
`run-summary-types.ts` and fails if `sonarjs/no-nested-template-literals`
regresses."

## Point of confusion

We already have a custom scanner job (`no-nested-template-literals`,
ambiguity #31) targeting the same file. The user is now asking for a
*real ESLint* gate. Two ambiguities:

1. **Replace or add?** Should the custom scanner be replaced by ESLint,
   or should both run side-by-side?
2. **Scope.** Run ESLint on just this one file, or on the whole
   `standalone-scripts/lovable-common/src/report/` folder, or on every
   file the rule is `error` for?

## Considered options

| # | Option | Pros | Cons |
|---|--------|------|------|
| A | Replace scanner with ESLint job | One source of truth | Loses the no-install <100ms preflight — install takes ~30s in CI |
| B | Add ESLint job alongside scanner, single-file scope | Belt-and-braces; scanner stays fast preflight; ESLint catches *config drift* (e.g. someone moves the file into the legacy `warn` override block) | Two jobs to maintain |
| C | Run project-wide ESLint instead | Already exists as `lint-standalone` job | Doesn't *pin* this specific file; a future `warn` override would silently mask a regression |

## Decision

**Proceeded with Option B.** The scanner and ESLint catch different
failure modes:

- **Scanner** catches a new nested backtick getting added to the file.
- **ESLint job** catches *config drift* — someone disabling the rule
  project-wide, or adding `run-summary-types.ts` to the legacy-file
  `warn` override block in `eslint.config.js`. The scanner alone would
  still pass in that case, hiding the regression.

Implementation:
- New job `eslint-run-summary-types` (Preflight section) installs deps
  and runs `pnpm run lint:run-summary-types` →
  `eslint --max-warnings=0 standalone-scripts/lovable-common/src/report/run-summary-types.ts`.
- Wired into `build-extension.needs:` so a regression blocks merge.
- New npm script `lint:run-summary-types` so devs can reproduce
  locally with one command.

`--max-warnings=0` is the critical flag: it ensures that even if the
file is moved into a `warn` override (instead of `error`), CI still
fails. Without that flag, a `warn`-level violation would exit 0.

## Verification

- `npx eslint --max-warnings=0 standalone-scripts/lovable-common/src/report/run-summary-types.ts`
  → exit 0, zero output.
- Job listed in `build-extension.needs:` between
  `no-nested-template-literals` and `contract-checkers-wired`.
