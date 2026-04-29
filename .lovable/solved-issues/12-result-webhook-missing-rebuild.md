# 12 — `result-webhook.ts` missing from worktree (rebuild from importers)

## Description

Build failed with:

```
✗ result-webhook.ts  (MISSING)
ENOENT: no such file or directory, stat
'/dev-server/src/background/recorder/step-library/result-webhook.ts'
```

Caught by `scripts/check-step-library-files.mjs` (prebuild guard listing the
17 expected step-library files) and the secondary
`scripts/check-result-webhook.mjs` guard (which additionally asserts the
`dispatchWebhook` named export).

## Root Cause

File deleted from the worktree with **no git history** for the path
(`git log --all --oneline -- '**/result-webhook.ts'` returned no rows).
The file was likely removed by an unattributed edit before history snapshots
were taken. Importers (`BatchRunDialog.tsx`,
`WebhookSettingsDialog.tsx`, `ReproBuildErrorPanel.tsx`,
`__tests__/webhook-fixtures.ts`) still referenced every public symbol, so the
contract was fully recoverable.

## Solution

Recreated `src/background/recorder/step-library/result-webhook.ts` by
reconstructing the public surface from:

1. Each importer's named-import lists + how the symbols were called/used.
2. Test fixtures (`webhook-fixtures.ts`) which pinned the exact field names
   for success/skipped/failure variants and the `WEBHOOK_RESULT_SCHEMA_VERSION`
   constant value.
3. Three Core memories that fix policy:
   - `mem://constraints/webhook-fail-fast` — single fetch attempt, no retry,
     no backoff, no scheduled redelivery.
   - `mem://features/webhook-result-schema-version` — v=2 stamped on every
     result; `migrateWebhookDeliveryResult` upgrades legacy v1 blobs (no
     `SchemaVersion` field) on read; unknown versions yield a
     `buildCorruptPlaceholder` failure.
   - `mem://constraints/no-supabase` — storage layer is `localStorage` only.

Public surface restored: `WEBHOOK_RESULT_SCHEMA_VERSION`,
`ALL_WEBHOOK_EVENTS`, `DEFAULT_WEBHOOK_CONFIG`, `WebhookEventKind`,
`WebhookHeader`, `WebhookConfig`, `WebhookPayload`, `WebhookDeliveryResult`
(success/skipped/failure variants), `isWebhookSuccess`/`isWebhookSkipped`/
`isWebhookFailure`, `loadWebhookConfig`/`saveWebhookConfig`,
`getDeliveryLog`/`clearDeliveryLog`/`repairDeliveryLog`,
`migrateWebhookDeliveryResult`, `buildGroupRunPayload`/
`buildBatchCompletePayload`, `dispatchWebhook` (single-attempt with
`AbortController` timeout).

## Iteration Count

1 attempt — fully derivable from already-committed signals.

## Verification

- `node scripts/check-step-library-files.mjs` → ✅ 17/17 files present.
- `node scripts/check-result-webhook.mjs` → ✅ resolves with export `dispatchWebhook`.

## Learning

- The two-tier prebuild guard (`check-step-library-files.mjs` enumerating the
  full step-library + `check-result-webhook.mjs` asserting named exports +
  known importer paths) made the failure surface immediately with exact paths
  and a clear remediation message — no Vite/Rollup mid-bundle ENOENT chase
  required. Both guards earned their keep here.
- Project-memory invariants (`webhook-fail-fast`,
  `webhook-result-schema-version`) acted as a recoverable spec: the lost file
  was rebuilt without ambiguity because policy was already pinned.

## What NOT to Repeat

- Do **not** introduce a retry queue, exponential backoff, or scheduled
  redelivery to `dispatchWebhook` — `mem://constraints/webhook-fail-fast`
  forbids it.
- Do **not** drop the `SchemaVersion` field from any persisted
  `WebhookDeliveryResult` — the migrator distinguishes "v1 legacy" (field
  absent → upgrade) from "unknown future version" (field present but unequal →
  corrupt placeholder). Removing the field collapses both paths.
- Do **not** delete this module again without first auditing
  `EXPECTED_STEP_LIBRARY_FILES` in
  `scripts/lib/step-library-file-guard.mjs` and the importers list in
  `scripts/check-result-webhook.mjs` — both are pinned and will fail loudly.

## References

- `.lovable/question-and-ambiguity/41-result-webhook-recreate.md`
- `mem://constraints/webhook-fail-fast`
- `mem://features/webhook-result-schema-version`
- `scripts/check-step-library-files.mjs`
- `scripts/check-result-webhook.mjs`
- `scripts/lib/step-library-file-guard.mjs`