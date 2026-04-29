/**
 * Owner Switch — run-summary builder.
 *
 * Pure function: takes the per-row results + log entries that the
 * scripts already persist and produces a `RunSummary` ready for the
 * shared JSON / text renderers in lovable-common.
 *
 * Per-row Actions are derived from `PromotedOwners` (one entry per
 * OwnerEmail attempted). Replay hints surface the persisted
 * partial-state so an operator can re-run only the failed owners.
 *
 * No-rollback policy (mem://constraints/no-retry-policy): the builder
 * mirrors `PromoteFailedPartial` distinctly so the summary clearly
 * separates "nothing was changed" from "some owners were promoted".
 */

import {
    RunSummaryRowStatus, RunSummaryScriptCode,
} from "../../../lovable-common/src/report/run-summary-types";
import type {
    RunSummary, RunSummaryAction, RunSummaryCounts, RunSummaryRow,
} from "../../../lovable-common/src/report/run-summary-types";
import { RowOutcomeCode } from "./row-types";
import { LogSeverity } from "./log-sink";
import type { PromotedOwnerRecord, RowExecutionResult } from "./row-types";
import type { LogEntry } from "./log-sink";

const statusFor = (outcome: RowOutcomeCode): RunSummaryRowStatus => {
    if (outcome === RowOutcomeCode.Succeeded) {
        return RunSummaryRowStatus.Succeeded;
    }

    if (outcome === RowOutcomeCode.PromoteFailedPartial) {
        return RunSummaryRowStatus.PartiallySucceeded;
    }

    return RunSummaryRowStatus.Failed;
};

const actionFor = (record: PromotedOwnerRecord): RunSummaryAction => {
    if (record.Promoted) {
        return { Code: "PromoteToOwner", Outcome: "ok", Detail: record.OwnerEmail };
    }

    const failedStep = record.FailedStep ?? "PromoteToOwner";
    const error = record.Error ?? "unknown error";

    return {
        Code: failedStep, Outcome: "failed",
        Detail: `${record.OwnerEmail}: ${error}`,
    };
};

const replayHintFor = (result: RowExecutionResult): RunSummaryRow["ReplayHint"] => {
    const promoted = result.PromotedOwners
        .filter((r) => r.Promoted).map((r) => r.OwnerEmail);
    const failed = result.PromotedOwners
        .filter((r) => !r.Promoted).map((r) => r.OwnerEmail);

    return Object.freeze({
        AlreadyPromotedOwners: promoted.join(",") || "",
        FailedOwners: failed.join(",") || "",
        ReplayInstruction: failed.length === 0
            ? "Row complete — no replay needed"
            : `Re-run row with OwnerEmails restricted to: ${failed.join(", ")}`,
    });
};

const buildRow = (result: RowExecutionResult): RunSummaryRow => ({
    RowIndex: result.RowIndex,
    Status: statusFor(result.Outcome),
    OutcomeCode: result.Outcome,
    DurationMs: result.DurationMs,
    LastError: result.LastError,
    Actions: result.PromotedOwners.map(actionFor),
    ReplayHint: replayHintFor(result),
});

const countRows = (rows: ReadonlyArray<RunSummaryRow>): RunSummaryCounts => ({
    Total: rows.length,
    Succeeded: rows.filter((r) => r.Status === RunSummaryRowStatus.Succeeded).length,
    Failed: rows.filter((r) => r.Status === RunSummaryRowStatus.Failed).length,
    PartiallySucceeded: rows.filter((r) => r.Status === RunSummaryRowStatus.PartiallySucceeded).length,
});

const noticesFrom = (entries: ReadonlyArray<LogEntry>): ReadonlyArray<string> => {
    return entries
        .filter((e) => e.Severity === LogSeverity.Warn || e.Severity === LogSeverity.Error)
        .map((e) => `[${e.Severity}] [Row=${e.RowIndex ?? "-"}] [${e.Phase}] ${e.Message}`);
};

export interface OwnerSwitchSummaryInput {
    TaskId: string;
    Results: ReadonlyArray<RowExecutionResult>;
    LogEntries: ReadonlyArray<LogEntry>;
}

export const buildOwnerSwitchRunSummary = (input: OwnerSwitchSummaryInput): RunSummary => {
    const rows = input.Results.map(buildRow);

    return {
        Script: RunSummaryScriptCode.OwnerSwitch,
        TaskId: input.TaskId,
        GeneratedAtUtc: new Date().toISOString(),
        Counts: countRows(rows),
        Rows: rows,
        Notices: noticesFrom(input.LogEntries),
    };
};
