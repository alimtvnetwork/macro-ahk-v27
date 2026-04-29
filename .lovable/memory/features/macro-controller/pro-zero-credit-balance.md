---
name: features/macro-controller/pro-zero-credit-balance
description: ✅ DONE 2026-04-27 — when WorkspacePlan === PRO_ZERO, fetch /credit-balance and use total_granted/total_remaining/total_billing_period_used; cache in IndexedDB ≥10min + async SQLite Workspaces upsert; right-click copies both JSONs
type: feature
status: ✅ COMPLETE (2026-04-27)
spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md
---

## Status: ✅ COMPLETE (2026-04-27)

All 10 implementation steps landed. Module lives in `standalone-scripts/macro-controller/src/pro-zero/` (27 files).

## What shipped

- **Enums** — `WorkspacePlan`, `CreditGrantType`, `CreditBalanceFetchStatus`, `CreditBalanceLogEvent`, `MacroCreditSource`.
- **Typed shapes** — `WorkspaceInfoTyped`, `WorkspaceMembership`, `CreditBalanceResponseTyped`, `ExpiringGrant`, `GrantTypeBalanceTyped`, `MacroCreditSummary`, `CreditBalanceFetchResult`.
- **Constants** — endpoint templates, header keys, redaction placeholder in `pro-zero-constants.ts`.
- **Mapper** — `workspace-plan-mapper.ts` is the **sole** owner of the raw `"pro_0"` string.
- **Client** — `pro-zero-credit-balance-client.ts` + `pro-zero-sdk-adapter.ts` execute the GET via SDK, returning typed `CreditBalanceFetchResult`.
- **Cache** — `pro-zero-balance-cache.ts` (IndexedDB, TTL configurable via `Settings.proZeroCreditBalanceCacheTtlMinutes`, default 10 min).
- **Persistence** — `pro-zero-workspaces-store.ts` upserts workspace + credit JSON into the existing `marco.kv` Workspaces namespace (async, never blocks).
- **Orchestration** — `pro-zero-credit-summary.ts` runs cache → fetch → persist → summary; hard-fails with typed error on any failure (no fallback).
- **Enrichment** — `pro-zero-enrichment.ts` overwrites `WorkspaceCredit.totalCredits/available/totalCreditsUsed/billingAvailable` and stashes verbatim balance JSON in `PRO_ZERO_BALANCE_JSON_FIELD`.
- **Integration** — `credit-parser.ts` calls `applyProZeroEnrichment()`; `credit-fetch.ts` background-refreshes in `processSuccessData` and awaits in `doFetchLoopCreditsAsync`.
- **Context menu** — `ws-context-menu.ts` "Copy JSON" on a `pro_0` row exports `{ Workspace, CreditBalance }`.
- **Settings UI** — `settings-modal.ts` exposes the cache-TTL field.
- **Logging** — `pro-zero-logger.ts` + `pro-zero-redaction.ts` route every event through `RiseupAsiaMacroExt.Logger`; `Authorization` header always redacted.

## Verification

- Typecheck: clean across macro-controller scope.
- Tests: **197 / 197** passing.
- Standards greps (`as `, `: unknown`, `catch \{`, `!important`, magic `"pro_0"` outside mapper): clean.

## Reference

Full spec: `spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md`
