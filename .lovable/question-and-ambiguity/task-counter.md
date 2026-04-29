# No-Questions Mode — Task Counter

> **Window opened:** 2026-04-26
> **Window size:** 40 tasks
> **Spec:** `.lovable/prompts/04-no-questions.md`
> **Exit phrase:** `ask question if any understanding issues`

Append one row per completed task while the window is open. When the
running count reaches **40**, normal question-asking resumes and a
closing summary is added at the bottom of this file.

Timestamps use **Asia/Kuala_Lumpur** per `mem://localization/timezone`.

## Log

| # | Date (KL) | Task summary | Ambiguity log |
|---|-----------|--------------|---------------|
| 1 | 2026-04-28 | Persist No-Questions Mode spec to `.lovable/prompts/04-no-questions.md`, create `.lovable/prompts.md` index, create this counter file. | none |
| 2 | 2026-04-28 | Add clean-build option (`scripts/clean-build.mjs` + `scripts/run-with-env.mjs` + 4 npm scripts) to wipe all build caches and force fresh filesystem reads. | [28 — Clean-build scope](./28-clean-build-scope.md) |
| 3 | 2026-04-28 | Add CI typecheck gate (`scripts/typecheck-app.mjs` + `pnpm run typecheck` + `typecheck-app` job in ci.yml, wired into `build-extension` `needs:`) covering `tsconfig.app.json` + `tsconfig.node.json`. | [29 — Typecheck App scope](./29-typecheck-app-gate-scope.md) |
| 4 | 2026-04-28 | Enable pre-commit ESLint hook for `standalone-scripts/**` (zero-dep native git hook via `scripts/install-git-hooks.mjs` + `scripts/lint-staged-standalone.mjs`; auto-installed by `prepare` lifecycle; worktree-aware). | [30 — Pre-commit hook tooling](./30-precommit-hook-tooling.md) |
| 5 | 2026-04-28 | Add nested-template-literal scanner (`scripts/check-no-nested-template-literals.mjs` + `pnpm run check:no-nested-tpl` + new `no-nested-template-literals` CI job + pre-commit hook integration), pinned to `run-summary-types.ts`. | [31 — Nested-tpl scanner mechanism](./31-nested-tpl-scanner-mechanism.md) |
| 6 | 2026-04-28 | Promote `sonarjs/no-nested-template-literals` to `error` in `eslint.config.js`; add `no-useless-concat: error`; demote 8 legacy files to `warn` so new code gets the hard gate. | [32 — Template lint rule scope](./32-template-lint-rule-scope.md) |
| 7 | 2026-04-28 | Document the refactor contract (`detailSuffix` empty-or-fragment pattern + `head` array `.join("\n")` pattern) as an in-file JSDoc block above the text renderers in `run-summary-types.ts`, with ✅/❌ examples and snapshot-test reminder. | [33 — Refactor doc placement](./33-refactor-doc-location.md) |
| 8 | 2026-04-28 | Add `eslint-run-summary-types` Preflight CI job (`--max-warnings=0`) pinned to `standalone-scripts/lovable-common/src/report/run-summary-types.ts` + `pnpm run lint:run-summary-types` npm script; wired into `build-extension.needs:` to catch ESLint *config drift* the scanner cannot see. | [34 — ESLint pin on run-summary-types.ts](./34-eslint-pin-run-summary-types.md) |
| 9 | 2026-04-28 | Fix uppercase `.md` CI failure: rename `spec/31-macro-recorder/LlmGuide.md` → `llm-guide.md` and `.lovable/question-and-ambiguity/README.md` → `readme.md`; update 4 spec + 2 prompt filename references; preserve the `LlmGuide` identifier in code/H1/glossary. | [35 — Uppercase .md rename](./35-uppercase-md-rename.md) |
| 10 | 2026-04-28 | Close 4 contract gaps in `scripts/validate-instruction-schema.mjs` `main()`: per-project requires `src/instruction.ts` (exit 2), per-project missing `dist/` exits 2 immediately, repo-wide zero-discovery exits 2, top-level try/catch exits 3 on uncaught throws + GH annotation on summary failure. | [36 — Validator main() completeness](./36-validator-main-completeness.md) |
| 11 | 2026-04-28 | Enrich `validate-instruction-schema.mjs` violation messages with received-value preview, nearest-parent identity hint (via `Name/Key/File/Id/Code/Url` walk), Levenshtein did-you-mean for enum + unknown-key typos, present-keys preview on missing-required, and allowed-keys list on closed-schema violations. | [37 — Validator violation message format](./37-validator-message-format.md) |
| 12 | 2026-04-29 | Add `SchemaVersion` contract: new `standalone-scripts/types/instruction/primitives/schema-version.{ts,json}` (pattern `/^\d+\.\d+$/`, supported `["1.0"]`); `validate-instruction-schema.mjs` loads JSON mirror at startup and gates `SchemaVersion` via new `kind:"schemaVersion"` validator node with three error paths (wrong-type, bad-pattern, unsupported-version + did-you-mean). Verified 4 mutation scenarios + 7-project happy path. | [38 — SchemaVersion contract](./38-schema-version-contract.md) |
| 13 | 2026-04-29 | **Refused** request to add visible in-app log of `readme.txt` writes (date/time + final text). Triple-violates `mem://constraints/readme-txt-prohibitions` SP-1..SP-7 (timestamps + write hooks + content mirroring). No code changes. | [39 — readme.txt write log refused](./39-readme-txt-write-log-refused.md) |
| 14 | 2026-04-29 | **Refused** request to add settings/env vars to control `readme.txt` words + date format (dd-MMM-YYYY) + 12-hr time. Violates SP-1/SP-2 (date/time on readme.txt) + SP-5/SP-6 (formatters) + SP-3/SP-4 ("generated" readme.txt). No code changes. | [40 — readme.txt format settings refused](./40-readme-txt-format-settings-refused.md) |
| 15 | 2026-04-29 | Recreate missing `src/background/recorder/step-library/result-webhook.ts` (deleted from worktree, no git history). Reconstructed full module from importer signatures + test fixtures: `WEBHOOK_RESULT_SCHEMA_VERSION=2`, `WebhookConfig`/`WebhookHeader`/`WebhookEventKind`, success/skipped/failure variants + type guards, `dispatchWebhook` (single-attempt, fail-fast per `mem://constraints/webhook-fail-fast`), `loadWebhookConfig`/`saveWebhookConfig`/`getDeliveryLog`/`clearDeliveryLog`/`repairDeliveryLog`, `migrateWebhookDeliveryResult` (v1→v2 upgrade + corrupt-placeholder), `buildGroupRunPayload`/`buildBatchCompletePayload`. Both prebuild guards (`check-step-library-files.mjs` + `check-result-webhook.mjs`) green. | none — all signatures derivable from importers |
| 16 | 2026-04-29 | CI lint failure report (11 sonarjs/max-lines warnings across 9 standalone files) triaged. Local `npx eslint standalone-scripts --max-warnings=0` (exact CI command) exits 0 with zero output → all 11 warnings already fixed in current worktree. Conclusion: failing CI run was against an older commit; no code change required. Reported back to user with re-run guidance. | none — already-fixed; investigation only |

## Notes

- The counter started retroactively at **1** with this very task,
  which is the first task to FORMALLY persist the No-Questions Mode
  spec to disk (prior tasks under the window logged their
  ambiguities directly to `.lovable/question-and-ambiguity/` but
  did not increment a counter, because no counter file existed
  yet). Subsequent tasks increment from 2.
- 24 tasks remaining in the window after task 16.