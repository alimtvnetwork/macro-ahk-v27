# 41 — Recreate missing `result-webhook.ts`

**Date (KL):** 2026-04-29
**Trigger:** Build failed via `check-step-library-files.mjs` — `src/background/recorder/step-library/result-webhook.ts` missing (ENOENT). No git history for the file (worktree-only loss).

## Decision (no user choice required)

Reconstructed the module from already-committed signals:

1. **Importer signatures** — exact named imports/types pulled from
   `BatchRunDialog.tsx`, `WebhookSettingsDialog.tsx`, `ReproBuildErrorPanel.tsx`,
   and `__tests__/webhook-fixtures.ts` enumerated every required public symbol.
2. **Project-memory invariants** drove the implementation choices:
   - `mem://constraints/webhook-fail-fast` → single fetch, no retry, no backoff,
     no scheduled redelivery.
   - `mem://features/webhook-result-schema-version` →
     `WEBHOOK_RESULT_SCHEMA_VERSION = 2` on every persisted result;
     `migrateWebhookDeliveryResult` upgrades legacy v1 blobs (no `SchemaVersion`
     field) on read; unknown versions become a `buildCorruptPlaceholder` failure
     entry.
   - `mem://constraints/no-supabase` → storage uses `localStorage` only.

## Public surface (recreated)

- Constants: `WEBHOOK_RESULT_SCHEMA_VERSION`, `ALL_WEBHOOK_EVENTS`,
  `DEFAULT_WEBHOOK_CONFIG`.
- Types: `WebhookEventKind`, `WebhookHeader`, `WebhookConfig`, `WebhookPayload`,
  `WebhookDeliveryResult` (success/skipped/failure variants).
- Guards: `isWebhookSuccess`, `isWebhookSkipped`, `isWebhookFailure`.
- Storage: `loadWebhookConfig`, `saveWebhookConfig`, `getDeliveryLog`,
  `clearDeliveryLog`, `repairDeliveryLog` (returns `{ Removed, Kept, Errors }`).
- Migration: `migrateWebhookDeliveryResult(input: unknown): WebhookDeliveryResult`.
- Payload builders: `buildGroupRunPayload`, `buildBatchCompletePayload`.
- Dispatch: `dispatchWebhook(event, payload, options?)` — single-attempt fetch
  with `AbortController` timeout from `cfg.TimeoutMs`; appends one entry to the
  rolling 20-entry log; returns the recorded result.

## Verification

Both prebuild guards green:
- `node scripts/check-step-library-files.mjs` → ✅ 17/17 files present.
- `node scripts/check-result-webhook.mjs` → ✅ resolves with export `dispatchWebhook`.

## Follow-ups (none blocking)

- If a future commit restores the original file from elsewhere, diff and
  reconcile any minor drift (corrupt-placeholder phrasing is matched to
  `WebhookSettingsDialog.tsx`'s `CORRUPT_PLACEHOLDER_PREFIX = "Corrupt webhook log entry"`).