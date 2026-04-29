/**
 * User Add — per-row state machine entry.
 *
 * Two-step chain per row: Step A (POST membership) → if Owner per
 * `shouldRunStepB`, run Step B (PUT promote). Each step writes its
 * own log line via `UserAddLogPhase.StepA` / `UserAddLogPhase.StepB`
 * so the P19 logs viewer can distinguish them without parsing text.
 *
 * **No rollback on Step B failure (per operator direction):** when
 * Step A succeeds and Step B fails, the member added by Step A is
 * left in place. The row is persisted with `Outcome =
 * StepBFailedMemberAdded`, `StepASucceeded = true`, and the captured
 * `WorkspaceId`/`UserId` so a re-run can skip Step A and only retry
 * the PUT promote (no 409 Conflict).
 *
 * Sign-out is task-level (`run-task-sign-out.ts`), not per-row.
 *
 * Single attempt per step, no retry (mem://constraints/no-retry-policy).
 */

import { runStepA } from "./run-step-a";
import { runStepB } from "./run-step-b";
import { shouldRunStepB } from "./should-run-step-b";
import { finalizeUserAddRow } from "./row-finalize";
import { buildRowFailure, buildRowSuccess } from "./row-result-builders";
import { UserAddRowOutcomeCode } from "./row-types";
import { UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry } from "./log-sink";
import type { UserAddLogSink } from "./log-sink";
import type { UserAddRowContext, UserAddRowResult } from "./row-types";
import type { UserAddRowStateStore } from "./row-state-store";
import type { StepAResult } from "./step-a-types";

const noteEditorNormalization = (ctx: UserAddRowContext, sink: UserAddLogSink): void => {
    if (!ctx.Row.WasEditorNormalized) {
        return;
    }

    sink.write(buildUserAddEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, UserAddLogPhase.Row, UserAddLogSeverity.Info,
        `Row ${ctx.Row.RowIndex} role normalized: Editor → Member (Q3)`,
    ));
};

const logStep = (
    ctx: UserAddRowContext, sink: UserAddLogSink, phase: UserAddLogPhase,
    severity: UserAddLogSeverity, message: string,
): void => {
    sink.write(buildUserAddEntry(ctx.Task.TaskId, ctx.Row.RowIndex, phase, severity, message));
};

const logNoRollback = (
    ctx: UserAddRowContext, sink: UserAddLogSink, workspaceId: string, userId: string,
): void => {
    logStep(ctx, sink, UserAddLogPhase.StepB, UserAddLogSeverity.Warn,
        `No rollback performed (per policy). Member ${ctx.Row.MemberEmail} (UserId=${userId}) ` +
        `remains in workspace ${workspaceId}. Re-run will SKIP Step A and only retry the PUT promote.`);
};

const isStepASuccess = (stepA: StepAResult): boolean => {
    return stepA.Error === null && stepA.Membership !== null && stepA.WorkspaceId !== null;
};

const handleStepAFailure = (
    ctx: UserAddRowContext, sink: UserAddLogSink, store: UserAddRowStateStore,
    startedAt: number, errorMessage: string,
): Promise<UserAddRowResult> => {
    logStep(ctx, sink, UserAddLogPhase.StepA, UserAddLogSeverity.Error, `Step A failed: ${errorMessage}`);
    return finalizeUserAddRow(ctx, sink, store, buildRowFailure({
        rowIndex: ctx.Row.RowIndex, startedAt,
        outcome: UserAddRowOutcomeCode.StepAFailed,
        error: errorMessage,
        stepBRan: false, stepASucceeded: false, workspaceId: null, userId: null,
    }));
};

const runStepBPhase = async (
    ctx: UserAddRowContext, sink: UserAddLogSink, store: UserAddRowStateStore,
    startedAt: number, workspaceId: string, userId: string,
): Promise<UserAddRowResult> => {
    const stepB = await runStepB(ctx.Api, { WorkspaceId: workspaceId, UserId: userId });

    if (stepB.Error !== null) {
        logStep(ctx, sink, UserAddLogPhase.StepB, UserAddLogSeverity.Error, `Step B promote failed: ${stepB.Error}`);
        logNoRollback(ctx, sink, workspaceId, userId);
        return finalizeUserAddRow(ctx, sink, store, buildRowFailure({
            rowIndex: ctx.Row.RowIndex, startedAt,
            outcome: UserAddRowOutcomeCode.StepBFailedMemberAdded,
            error: stepB.Error, stepBRan: true, stepASucceeded: true,
            workspaceId, userId,
        }));
    }

    logStep(ctx, sink, UserAddLogPhase.StepB, UserAddLogSeverity.Info, "Step B PUT promote ok");
    return finalizeUserAddRow(ctx, sink, store, buildRowSuccess({
        rowIndex: ctx.Row.RowIndex, startedAt, stepBRan: true, workspaceId, userId,
    }));
};

export const runUserAddRow = async (
    ctx: UserAddRowContext, sink: UserAddLogSink, store: UserAddRowStateStore,
): Promise<UserAddRowResult> => {
    const startedAt = Date.now();
    noteEditorNormalization(ctx, sink);

    if (ctx.Row.RoleCode === null) {
        return handleStepAFailure(ctx, sink, store, startedAt,
            "RoleCode missing on row and no DefaultRoleCode applied");
    }

    const stepA = await runStepA(ctx.Api, {
        WorkspaceUrl: ctx.Row.WorkspaceUrl, MemberEmail: ctx.Row.MemberEmail,
        RoleCode: ctx.Row.RoleCode,
    });

    if (!isStepASuccess(stepA) || stepA.Membership === null || stepA.WorkspaceId === null) {
        return handleStepAFailure(ctx, sink, store, startedAt,
            stepA.Error ?? "Step A returned null membership");
    }

    logStep(ctx, sink, UserAddLogPhase.StepA, UserAddLogSeverity.Info,
        `Step A POST membership ok (UserId=${stepA.Membership.UserId})`);

    if (!shouldRunStepB(ctx.Row.RoleCode)) {
        return finalizeUserAddRow(ctx, sink, store, buildRowSuccess({
            rowIndex: ctx.Row.RowIndex, startedAt, stepBRan: false,
            workspaceId: stepA.WorkspaceId, userId: stepA.Membership.UserId,
        }));
    }

    return runStepBPhase(ctx, sink, store, startedAt, stepA.WorkspaceId, stepA.Membership.UserId);
};
