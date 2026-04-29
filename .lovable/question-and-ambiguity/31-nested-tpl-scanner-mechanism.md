# 31 — Nested-template-literal scanner: mechanism + scope

**Task**: Create a small automated check that greps `run-summary-types.ts` for nested template literals and reports a clear error if found.

**Ambiguity**: Two design axes the user did not specify.

## Axis 1 — Implementation mechanism

| Option | Approach | Pros | Cons |
|---|---|---|---|
| A — Pure regex grep | `rg` / `grep -P` for `` `[^`]*\$\{[^}]*` `` | One-liner; trivial to read | Regex cannot span multi-line template literals; false positives on legitimate `` `…\\`…` ``; brittle against escapes |
| **B — Tiny stateful scanner (CHOSEN)** | Linear character walk with a context stack tracking strings / comments / template / interpolation depth | Correct on multi-line templates, escapes, comments containing backticks, JSDoc with `\`code\``; reports exact `line:col`; <100ms; zero deps | ~200 LoC vs one regex |
| C — `tsc` AST traversal | Parse with `typescript` and walk for `TemplateExpression` inside `TemplateSpan.expression` | Bulletproof | Pulls in `typescript` as a runtime dep for a 3-line check; loses the "fast-fail, no install needed" property of CI Job 0a |

**Decision**: **Option B**. The stateful scanner is the smallest correct implementation that handles the four real edge cases observed in the lovable-common codebase (JSDoc backticks, line/block comments, escape sequences, multi-line templates). It also lets the pre-merge CI job run with **zero install step** — same lane as `spec-links`, `contract-checkers-wired` etc., so it returns in seconds.

## Axis 2 — File scope

| Option | Files scanned | Pros | Cons |
|---|---|---|---|
| **A — Pinned target list (CHOSEN)** | `TARGETS[]` in the script — currently just `run-summary-types.ts` | Matches the user's explicit ask ("greps run-summary-types.ts"); deterministic perf; no churn from unrelated files | New files don't get the protection until added |
| B — Repo-wide | Every `.ts/.tsx` under `standalone-scripts/` and `src/` | Maximum coverage | Likely surfaces dozens of legitimate nested templates already greenlit by `eslint-disable-next-line sonarjs/no-nested-template-literals`; would either need to honor the suppressions (re-implementing ESLint) or generate noise |
| C — Eslint-driven | Run `eslint --rule 'sonarjs/no-nested-template-literals: error'` on the target | Reuses existing rule | Defeats the "redundant guard even if eslint config is relaxed" goal — that's the whole reason for the dedicated scanner |

**Decision**: **Option A**. The user named one file. The scanner exposes a clear `TARGETS[]` array at the top of the script with a comment on how to extend it, so adding `Foo.ts` later is a one-line PR.

**Files created/edited**:
- `scripts/check-no-nested-template-literals.mjs` (new — 240 LoC, zero deps, character-level scanner with `::error::` annotations)
- `package.json` — added `check:no-nested-tpl` script
- `.github/workflows/ci.yml` — new `no-nested-template-literals` job (Job 0a0b, no install lane); added to `build-extension.needs:` so violations block merge
- `scripts/lint-staged-standalone.mjs` — also runs the scanner after staged-file ESLint pass (catches violations even when the pinned file isn't part of the commit)

**Verified**:
- Clean run on real file → exit 0, "scanned=1, zero nested template literals".
- Fault-injection (appended `` `outer ${`inner ${42}`} end` ``) → exit 1, inline `::error file=…,line=134,col=20::` annotation pointing at the inner backtick exactly.
- File restored, scanner clean again. YAML validated.

**Reversibility**: Delete the script, the package.json line, the CI job block + `needs:` entry, and the pre-commit hook addition. No dependencies, no migrations.
