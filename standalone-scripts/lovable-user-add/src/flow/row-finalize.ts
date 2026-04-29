/**
 * User Add — row finalize helpers.
 *
 * Pure factories that emit the per-row log line and persist the row
 * state update. Extracted from `run-row.ts` to keep the orchestrator
 * focused on flow control and under the 100-line cap.
 *
 * Persists `Outcome`, `StepASucceeded`, `WorkspaceId`, `UserId` so
 * the SQLite store carries enough context for idempotent re-runs
 * without rolling back the partial Step A POST.
 */

import { UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry } from "./log-sink";
import type { UserAddLogSink } from "./log-sink";
import type { UserAddRowContext, UserAddRowResult } from "./row-types";
import type { UserAddRowStateStore, UserAddRowStateUpdate } from "./row-state-store";

const buildUpdate = (rowIndex: number, result: UserAddRowResult): UserAddRowStateUpdate => ({
    RowIndex: rowIndex,
    IsDone: result.IsDone,
    HasError: result.HasError,
    LastError: result.LastError,
    StepBRan: result.StepBRan,
    CompletedAtUtc: result.IsDone ? new Date().toISOString() : null,
    Outcome: result.Outcome,
    StepASucceeded: result.StepASucceeded,
    UserId: result.UserId,
    WorkspaceId: result.WorkspaceId,
});

const severityFor = (result: UserAddRowResult): UserAddLogSeverity => {
    if (result.HasError) {
        return UserAddLogSeverity.Error;
    }

    return UserAddLogSeverity.Info;
};

export const finalizeUserAddRow = (
    ctx: UserAddRowContext, sink: UserAddLogSink,
    store: UserAddRowStateStore, result: UserAddRowResult,
): UserAddRowResult => {
    sink.write(buildUserAddEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, UserAddLogPhase.Row, severityFor(result),
        `Row ${ctx.Row.RowIndex} → ${result.Outcome} in ${result.DurationMs}ms (StepB=${result.StepBRan})`,
    ));
    store.update(buildUpdate(ctx.Row.RowIndex, result));

    return result;
};
