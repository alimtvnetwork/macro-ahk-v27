# 36 — Validator main(): which "incompleteness" did the user mean?

**Original task:** "Fix the validator script's incomplete main() block
so it fully validates and exits with the correct status code for each
project and for repo-wide scans."

## Point of confusion

The repo has 4 candidates matching "validator script":

| Script | Has `main()`? | Per-project + repo-wide modes? |
|--------|---------------|--------------------------------|
| `scripts/validate-instruction-schema.mjs` | ✅ | ✅ both |
| `scripts/validate-registry-report-schema.mjs` | ❌ (top-level) | repo-wide only |
| `scripts/verify-worktree-fresh.mjs` | ✅ | repo-wide only |
| `scripts/prebuild-clean-and-verify.mjs` | ✅ | repo-wide only |

The phrase "**for each project and for repo-wide scans**" matches only
`validate-instruction-schema.mjs`, which is the only script whose CLI
takes an optional folder argument vs scanning every standalone project.
Decision: target that file.

## What "incomplete" actually meant

`main()` was syntactically complete (parseable, callable) and the happy
path passed. But it had **four real contract gaps** vs the docstring +
the user's "correct status code … for each project and repo-wide" bar:

1. **Per-project mode accepted any directory.** A folder without
   `src/instruction.ts` was treated as a project, looped through, and
   exited 0 with `Scanned: 1 project(s), 0 artifact(s)` — a false
   green. Now exits 2 with a clear message.
2. **Per-project mode flattened "missing dist/" into exit 1.** The
   header docstring (lines 38-39) literally says "project lacks dist/
   artifacts → exit 2". Now exits 2 immediately in per-project mode;
   repo-wide mode still folds the failure into the exit-1 summary so
   one un-built sibling doesn't mask other projects' real schema
   violations.
3. **Repo-wide discovery of zero projects exited 0.** A sparse-checkout
   or misconfigured CI clone that lost `standalone-scripts/*/src/`
   would silently pass. Now exits 2 with a layout-broken message.
4. **No top-level error guard.** An uncaught throw inside `main()`
   (future schema refactor, fs race, malformed JSON the parser missed)
   would crash with whatever exit code Node felt like — sometimes 0
   on CI runners that swallow promise rejections. Now wrapped in a
   try/catch that exits 3 with a `::error` annotation.

Also added: GitHub Actions summary annotation on the failure path so
the PR check shows the count without scrolling the log.

## Considered alternatives

| # | Option | Why not |
|---|--------|---------|
| A | Replace exit codes with throws | Breaks the documented exit-code contract that downstream CI jobs depend on (build-extension `needs:` parses these). |
| B | Make `main()` async + propagate via process.exitCode | Same exit codes work; chose try/catch because the rest of the file is sync and the schema is in-memory (no I/O budget worth awaiting). |
| C | Fold per-project missing-dist into exit 1 (status quo) | Contradicts the header docstring, and a CI step that says "validate this one project" expects a deterministic 0/2 answer, not a 1 that means "unrelated build step is missing". |

Chose to honour the docstring exit-code contract verbatim and add the
zero-project safeguard the user implicitly asked for ("repo-wide scans").

## Verification

All four scenarios verified locally:

```
1. Repo-wide happy path                        → exit 0  (7 projects, 14 artifacts)
2. Per-project happy path (xpath)              → exit 0  (1 project, 2 artifacts)
3. Per-project folder not found                → exit 2  ("Project folder not found")
4. Per-project folder without src/instruction  → exit 2  ("Not a standalone project")
```

Per-project missing-`dist/` (exit 2) and repo-wide zero-discovery
(exit 2) cannot be exercised without temporarily deleting build
artifacts; their code paths are short and reviewed.
