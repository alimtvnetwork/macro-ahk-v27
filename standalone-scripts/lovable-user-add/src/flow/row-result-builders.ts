/**
 * User Add — row-result builders.
 *
 * Pure factories extracted from `run-row.ts` to keep that file under
 * the 100-line cap. Both functions stamp `DurationMs` from the row
 * start time so the orchestrator just passes `startedAt` through.
 *
 * Failure-marking policy (no rollback): when Step A succeeded but
 * Step B failed, callers MUST pass the captured `WorkspaceId`/`UserId`
 * so the persisted row state allows a future re-run to skip Step A.
 */

import { UserAddRowOutcomeCode } from "./row-types";
import type { UserAddRowResult } from "./row-types";

export interface RowFailureInputs {
    rowIndex: number;
    startedAt: number;
    outcome: UserAddRowOutcomeCode;
    error: string;
    stepBRan: boolean;
    stepASucceeded: boolean;
    workspaceId: string | null;
    userId: string | null;
}

export const buildRowFailure = (inputs: RowFailureInputs): UserAddRowResult => ({
    RowIndex: inputs.rowIndex, Outcome: inputs.outcome, IsDone: false, HasError: true,
    LastError: inputs.error, DurationMs: Date.now() - inputs.startedAt,
    StepBRan: inputs.stepBRan, StepASucceeded: inputs.stepASucceeded,
    WorkspaceId: inputs.workspaceId, UserId: inputs.userId,
});

export interface RowSuccessInputs {
    rowIndex: number;
    startedAt: number;
    stepBRan: boolean;
    workspaceId: string | null;
    userId: string | null;
}

export const buildRowSuccess = (inputs: RowSuccessInputs): UserAddRowResult => ({
    RowIndex: inputs.rowIndex, Outcome: UserAddRowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null,
    DurationMs: Date.now() - inputs.startedAt, StepBRan: inputs.stepBRan,
    StepASucceeded: true, WorkspaceId: inputs.workspaceId, UserId: inputs.userId,
});
