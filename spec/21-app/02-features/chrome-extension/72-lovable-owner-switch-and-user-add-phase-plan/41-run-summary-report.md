# Per-Run Summary Report

**Scope:** `lovable-owner-switch` + `lovable-user-add` standalone scripts.
**Status:** Implemented.
**Related:** [40-failure-marking-and-replay.md](./40-failure-marking-and-replay.md)

## Purpose

After each task run, both scripts can produce a paired summary report:

- **JSON** (`renderRunSummaryAsJson`) — stable PascalCase keys for
  CI / audit pipelines and downstream tooling.
- **Markdown text** (`renderRunSummaryAsText`) — human-readable
  per-row breakdown for operators.

The report is built **purely** from the row results and log entries
the scripts already persist in SQLite — no extra state is captured.

## Module map

| Layer | File |
|---|---|
| Shared types + renderers | `standalone-scripts/lovable-common/src/report/run-summary-types.ts` |
| Owner-switch builder | `standalone-scripts/lovable-owner-switch/src/flow/run-summary-builder.ts` |
| User-add builder | `standalone-scripts/lovable-user-add/src/flow/run-summary-builder.ts` |
| Public exports | `lovable-common/src/index.ts`, `lovable-owner-switch/src/flow/index.ts`, `lovable-user-add/src/flow/index.ts` |

## Data contract

```ts
interface RunSummary {
    Script: "OwnerSwitch" | "UserAdd";
    TaskId: string;
    GeneratedAtUtc: string;             // ISO UTC
    Counts: { Total; Succeeded; Failed; PartiallySucceeded };
    Rows: ReadonlyArray<RunSummaryRow>;
    Notices: ReadonlyArray<string>;     // WARN/ERROR log lines
}

interface RunSummaryRow {
    RowIndex: number;
    Status: "Succeeded" | "Failed" | "PartiallySucceeded";
    OutcomeCode: string;                // raw enum value e.g. "PromoteFailedPartial"
    DurationMs: number;
    LastError: string | null;
    Actions: ReadonlyArray<{ Code; Outcome: "ok"|"skipped"|"failed"; Detail }>;
    ReplayHint: Record<string, string|number|boolean|null>;
}
```

## Status mapping

| Script | Outcome → Status |
|---|---|
| Owner Switch | `Succeeded` → `Succeeded`. `PromoteFailedPartial` → `PartiallySucceeded`. Everything else → `Failed`. |
| User Add | `Succeeded` → `Succeeded`. `StepBFailedMemberAdded` → `PartiallySucceeded`. Everything else → `Failed`. |

## Replay hints

The hints surface the persisted state from the **no-rollback** policy
so an operator can re-run idempotently:

- **Owner Switch partial**: `AlreadyPromotedOwners`, `FailedOwners`,
  `ReplayInstruction` ("Re-run row with OwnerEmails restricted to: …").
- **User Add `StepBFailedMemberAdded`**: `StepASucceeded=true`,
  `WorkspaceId`, `UserId`, `ReplayInstruction` ("Re-run will SKIP Step
  A and retry only the PUT promote").
- **User Add `StepAFailed`**: `ReplayInstruction` ("Re-run the entire
  row").

## Tests

- `standalone-scripts/lovable-owner-switch/src/flow/__tests__/run-summary-builder.test.ts` — 6 tests.
- `standalone-scripts/lovable-user-add/src/flow/__tests__/run-summary-builder.test.ts` — 5 tests.

## Reverting

Revert via the chat history entry that introduced this spec, or the
History tab. Files touched:
`run-summary-types.ts`, `run-summary-builder.ts` (×2), barrel
exports (×3), test files (×2), this spec.
