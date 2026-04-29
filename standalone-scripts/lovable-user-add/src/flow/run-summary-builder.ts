/**
 * User Add — run-summary builder.
 *
 * Mirror of the owner-switch builder. Per-row Actions cover the two
 * REST calls (Step A POST membership, Step B PUT promote-to-Owner).
 * Replay hints surface `WorkspaceId`/`UserId`/`StepASucceeded` so a
 * re-run can SKIP Step A on `StepBFailedMemberAdded` rows and only
 * retry the PUT (no 409 Conflict).
 *
 * No-rollback policy: `StepBFailedMemberAdded` is reported as
 * `PartiallySucceeded` (the member exists in the workspace, even
 * though promotion failed).
 */

import {
    RunSummaryRowStatus, RunSummaryScriptCode,
} from "../../../lovable-common/src/report/run-summary-types";
import type {
    RunSummary, RunSummaryAction, RunSummaryCounts, RunSummaryRow,
} from "../../../lovable-common/src/report/run-summary-types";
import { UserAddRowOutcomeCode } from "./row-types";
import { UserAddLogSeverity } from "./log-sink";
import type { UserAddRowResult } from "./row-types";
import type { UserAddLogEntry } from "./log-sink";

const statusFor = (outcome: UserAddRowOutcomeCode): RunSummaryRowStatus => {
    if (outcome === UserAddRowOutcomeCode.Succeeded) {
        return RunSummaryRowStatus.Succeeded;
    }

    if (outcome === UserAddRowOutcomeCode.StepBFailedMemberAdded) {
        return RunSummaryRowStatus.PartiallySucceeded;
    }

    return RunSummaryRowStatus.Failed;
};

const stepAAction = (result: UserAddRowResult): RunSummaryAction => {
    if (result.StepASucceeded) {
        const userId = result.UserId ?? "?";
        const wsId = result.WorkspaceId ?? "?";

        return { Code: "AddMembership", Outcome: "ok", Detail: `UserId=${userId} Workspace=${wsId}` };
    }

    return { Code: "AddMembership", Outcome: "failed", Detail: result.LastError };
};

const stepBAction = (result: UserAddRowResult): RunSummaryAction | null => {
    if (!result.StepBRan) {
        return { Code: "PromoteToOwner", Outcome: "skipped", Detail: "Role does not require promotion" };
    }

    if (result.Outcome === UserAddRowOutcomeCode.Succeeded) {
        return { Code: "PromoteToOwner", Outcome: "ok", Detail: `UserId=${result.UserId ?? "?"}` };
    }

    return { Code: "PromoteToOwner", Outcome: "failed", Detail: result.LastError };
};

const buildActions = (result: UserAddRowResult): ReadonlyArray<RunSummaryAction> => {
    const actions: RunSummaryAction[] = [stepAAction(result)];

    if (result.StepASucceeded) {
        const stepB = stepBAction(result);

        if (stepB !== null) {
            actions.push(stepB);
        }
    }

    return actions;
};

const replayHintFor = (result: UserAddRowResult): RunSummaryRow["ReplayHint"] => {
    if (result.Outcome === UserAddRowOutcomeCode.StepBFailedMemberAdded) {
        return Object.freeze({
            StepASucceeded: true,
            WorkspaceId: result.WorkspaceId,
            UserId: result.UserId,
            ReplayInstruction:
                "Re-run will SKIP Step A (member already in workspace) and retry only the PUT promote.",
        });
    }

    if (result.Outcome === UserAddRowOutcomeCode.Succeeded) {
        return Object.freeze({ ReplayInstruction: "Row complete — no replay needed" });
    }

    return Object.freeze({
        StepASucceeded: false,
        ReplayInstruction: "Re-run the entire row (Step A POST + optional Step B PUT).",
    });
};

const buildRow = (result: UserAddRowResult): RunSummaryRow => ({
    RowIndex: result.RowIndex,
    Status: statusFor(result.Outcome),
    OutcomeCode: result.Outcome,
    DurationMs: result.DurationMs,
    LastError: result.LastError,
    Actions: buildActions(result),
    ReplayHint: replayHintFor(result),
});

const countRows = (rows: ReadonlyArray<RunSummaryRow>): RunSummaryCounts => ({
    Total: rows.length,
    Succeeded: rows.filter((r) => r.Status === RunSummaryRowStatus.Succeeded).length,
    Failed: rows.filter((r) => r.Status === RunSummaryRowStatus.Failed).length,
    PartiallySucceeded: rows.filter((r) => r.Status === RunSummaryRowStatus.PartiallySucceeded).length,
});

const noticesFrom = (entries: ReadonlyArray<UserAddLogEntry>): ReadonlyArray<string> => {
    return entries
        .filter((e) => e.Severity === UserAddLogSeverity.Warn || e.Severity === UserAddLogSeverity.Error)
        .map((e) => `[${e.Severity}] [Row=${e.RowIndex ?? "-"}] [${e.Phase}] ${e.Message}`);
};

export interface UserAddSummaryInput {
    TaskId: string;
    Results: ReadonlyArray<UserAddRowResult>;
    LogEntries: ReadonlyArray<UserAddLogEntry>;
}

export const buildUserAddRunSummary = (input: UserAddSummaryInput): RunSummary => {
    const rows = input.Results.map(buildRow);

    return {
        Script: RunSummaryScriptCode.UserAdd,
        TaskId: input.TaskId,
        GeneratedAtUtc: new Date().toISOString(),
        Counts: countRows(rows),
        Rows: rows,
        Notices: noticesFrom(input.LogEntries),
    };
};
