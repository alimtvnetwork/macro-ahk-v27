# Failure Marking and Replay (No Rollback Policy)

**Scope:** `lovable-owner-switch` + `lovable-user-add` standalone scripts.
**Decision date:** 2026-04-26 (operator direction during chat session).
**Status:** Implemented.

## Policy

When a promotion or membership-add fails midway through a row, the
scripts **DO NOT** attempt to undo prior successful API calls. Instead
they:

1. **Mark** the row's outcome with a distinct enum value that captures
   the partial state.
2. **Persist** enough context (already-promoted owners / Step A IDs)
   into the SQLite row-state store for an idempotent re-run.
3. **Log** an explicit WARN line stating "No rollback performed".

Re-execution is operator-driven (mem://constraints/no-retry-policy
forbids automatic retry within a run).

## owner-switch

| Concept | Where |
|---|---|
| Outcome enum value | `RowOutcomeCode.PromoteFailedPartial` (when at least one OwnerEmail in the row was promoted before another failed) vs. `PromoteFailed` (no owner was promoted) — `standalone-scripts/lovable-owner-switch/src/flow/row-types.ts` |
| Per-OwnerEmail breakdown | `RowExecutionResult.PromotedOwners: ReadonlyArray<PromotedOwnerRecord>` |
| `PromotedOwnerRecord` fields | `OwnerEmail`, `Promoted: boolean`, `FailedStep: string \| null`, `Error: string \| null` |
| Persisted columns (added to `RowStateUpdate`) | `Outcome`, `PromotedOwners` (JSON) |
| Failed-step capture | `runPromote` tags thrown errors with `step ∈ { ResolveWorkspace, ResolveUserId, PromoteToOwner }` so `PromoteRowResult.FailedStep` is populated |
| WARN log | `run-owner-emails.ts` → `logNoRollback(...)` (only when `succeeded.length > 0`) |
| Re-run behavior | A re-run can read `PromotedOwners` and skip any `OwnerEmail` with `Promoted = true`, retrying only the failed entry. |

## user-add

| Concept | Where |
|---|---|
| Outcome enum value | `UserAddRowOutcomeCode.StepBFailedMemberAdded` (Step A POST ok, Step B PUT failed) vs. `StepAFailed`/`StepBFailed` |
| Persisted columns (added to `UserAddRowStateUpdate`) | `Outcome`, `StepASucceeded`, `WorkspaceId`, `UserId` |
| Replay key | `StepASucceeded = true` ⇒ re-run skips POST (avoids 409 Conflict), uses persisted `WorkspaceId`/`UserId` to retry only PUT |
| WARN log | `run-row.ts` → `logNoRollback(...)` (only on `StepBFailedMemberAdded` path) |

## Why no rollback?

- **owner-switch**: the only realistic "rollback" target is restoring an
  already-promoted Owner back to Admin/Member. The `MembershipRoleApiCode`
  contract supports this PUT, but operator policy prefers manual
  reconciliation (auditable) over silent state churn.
- **user-add**: rollback would require a DELETE membership endpoint that
  is intentionally not exposed by `LovableApiClient` (R12 — single PUT
  call site). Leaving the member in place is non-destructive.

## Tests

- `standalone-scripts/lovable-owner-switch/src/flow/__tests__/run-owner-emails.test.ts`
  (3 tests: partial, single-owner failure, all-success).
- `standalone-scripts/lovable-user-add/src/flow/__tests__/run-row.test.ts`
  (3 tests: Step B fail, Step A fail, happy path).

## Reverting

Revert via chat history (the message that introduced this spec) or the
History tab. The change touches: `row-types.ts`, `row-state-store.ts`,
`row-finalize.ts`, `run-row.ts`, `run-owner-emails.ts`, `run-promote.ts`
(owner-switch); `row-types.ts`, `row-state-store.ts`, `row-finalize.ts`,
`row-result-builders.ts`, `run-row.ts` (user-add); plus the two test
files and this spec.
