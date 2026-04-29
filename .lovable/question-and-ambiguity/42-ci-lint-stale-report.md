# 42 — CI lint failure report (already-fixed in worktree)

**Date (KL):** 2026-04-29
**Trigger:** User pasted CI log: 11 sonarjs/max-lines warnings across 9 files
(`run-summary-types.ts`, `run-owner-emails.test.ts`, `run-promote.ts`,
`run-row.test.ts`, `run-summary-builder.test.ts`, `run-row.ts`,
`startup-persistence.ts`, `save-prompt-insertion.test.ts`,
`section-open-tabs.ts`).

## Investigation

Reproduced the exact CI command locally:

```
npx eslint standalone-scripts --max-warnings=0 --format=stylish
```

Result: **exit 0, zero output** — every cited warning is already absent from the
current worktree.

Targeted re-run on just the 9 cited files: also exit 0, zero output.

## Conclusion

The failing CI run was against an older commit (or a stale runner cache).
No source change required. Recommended action to user: re-run the workflow on
the latest commit; if still failing, clear the GitHub Actions cache for the
`lint-standalone` job (key prefix `runner.os-nm-lint-`).

## Why log this

Documents a no-op decision so a future AI does not re-attempt to "fix"
already-fixed warnings (which would risk gratuitously re-touching the
8 legacy files demoted to `warn` in `eslint.config.js` lines 147–161).