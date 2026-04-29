/**
 * Owner Switch — row-result builder helpers.
 *
 * Pure factories. Extracted from `run-row.ts` so that file stays under
 * the 100-line cap and each finalize/branch path remains clear.
 *
 * Persists `Outcome` + `PromotedOwners` so a re-run can deterministically
 * skip OwnerEmails that already succeeded inside a row that overall
 * failed (no rollback policy — failure marking only).
 */

import { LogPhase, LogSeverity, buildEntry } from "./log-sink";
import type { LogSink } from "./log-sink";
import type { RowExecutionContext, RowExecutionResult } from "./row-types";
import type { RowStateStore, RowStateUpdate } from "./row-state-store";

const buildUpdate = (rowIndex: number, result: RowExecutionResult): RowStateUpdate => ({
    RowIndex: rowIndex,
    IsDone: result.IsDone,
    HasError: result.HasError,
    LastError: result.LastError,
    CompletedAtUtc: result.IsDone ? new Date().toISOString() : null,
    Outcome: result.Outcome,
    PromotedOwners: result.PromotedOwners,
});

export const finalizeRow = (
    ctx: RowExecutionContext,
    sink: LogSink,
    store: RowStateStore,
    result: RowExecutionResult,
): RowExecutionResult => {
    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Row,
        result.HasError ? LogSeverity.Error : LogSeverity.Info,
        `Row ${ctx.Row.RowIndex} → ${result.Outcome} in ${result.DurationMs}ms`,
    ));
    store.update(buildUpdate(ctx.Row.RowIndex, result));

    return result;
};
