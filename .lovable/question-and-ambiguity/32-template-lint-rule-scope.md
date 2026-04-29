# 32 — Template-literal lint rule: scope and promotion path

**Task**: Add a lint rule configuration in the repo to standardize template literal usage and prevent nested template literals in new code.

**Ambiguity**: User said "standardize template literal usage" + "prevent nested template literals in new code". Three sub-questions on scope.

## Sub-question 1 — How strict should `no-nested-template-literals` be?

| Option | Level | Pros | Cons |
|---|---|---|---|
| A — Keep at `warn` | Status quo | Zero churn | Already at warn; the user explicitly asked to "prevent" — warn doesn't prevent unless paired with `--max-warnings=0` (which only the standalone CI lane enforces) |
| **B — Promote to `error` (CHOSEN)** | Hard fail in lint output | Matches "prevent" verb literally; visible in every IDE; survives even if `--max-warnings` is relaxed | Surfaces 8 pre-existing files with nested templates (debt) |
| C — Promote + auto-fix all 8 legacy files | Full clean | Cleanest end state | Out of scope; touches 8 unrelated files; risks regressions in recorder/options panels |

**Decision**: **Option B + per-file `warn` override**. Promoted to `error` repo-wide; the 8 legacy files (`failure-logger.ts`, `field-reference-resolver.ts`, `step-library/csv-parse.ts`, `StepGroupLibraryPanel.tsx`, `SelectorComparisonPanel.tsx`, `SelectorTesterPanel.tsx`, `failure-toast.ts`, `selector-replay-trace.ts`) are demoted to `warn` via a tail override block with a comment explaining the migration backlog. Result: **new code gets the hard gate** (the user's literal ask); legacy files keep surfacing the warning for incremental cleanup; CI lint-standalone gate stays green.

## Sub-question 2 — Should `prefer-template` be added too?

| Option | Pros | Cons |
|---|---|---|
| A — Add as `error` | Maximally standardizes | 1529 pre-existing violations across the repo → instant CI breakage |
| B — Add as `warn` | Steers new code toward templates | Adds 1426 standalone-scripts warnings → trips CI's `--max-warnings=0` lint-standalone gate |
| **C — Don't add (CHOSEN)** | Keeps task tight to user's literal ask | Misses a stylistic standardization opportunity |

**Decision**: **Option C**. The user's "standardize" framing is satisfied by `no-nested-template-literals: error` + the new `no-useless-concat: error` (which handles the `"a" + "b"` → `"ab"` micro-case with zero existing violations). Adding `prefer-template` deserves its own focused task with a planned migration sweep — adding it as part of THIS task would either break CI (Option A) or trip the standalone gate (Option B), both unacceptable.

## Sub-question 3 — Should the override list also exclude the file already pinned by the dedicated scanner?

No. `run-summary-types.ts` is already clean (no violations) AND hard-pinned by `scripts/check-no-nested-template-literals.mjs`. Both gates fire independently — defence in depth.

**Files edited**:
- `eslint.config.js` — `sonarjs/no-nested-template-literals: warn` → `error`; new `no-useless-concat: error`; new tail override block listing 8 legacy files at `warn`.

**Verified**:
- `npx eslint .` → 2 pre-existing errors (both unrelated: `no-useless-escape`, `prefer-const`), 214 warnings — zero net-new errors.
- `npx eslint --max-warnings=0 'standalone-scripts/**/*.{ts,tsx}'` → exit 0 (CI lint-standalone gate stays green).

**Reversibility**: One-line revert (change `error` back to `warn`, drop the override block). No data, no migrations.
