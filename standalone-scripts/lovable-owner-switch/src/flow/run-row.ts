/**
 * Owner Switch — per-row state machine (entry).
 *
 * Resolves password (Row.Password ?? Task.CommonPassword), runs login →
 * owner-promotions → sign-out, finalizes row state. Fail-fast on
 * login/promote (Q8); sign-out failure is best-effort (Q6 default).
 *
 * Failure-marking policy (no rollback): when a promotion fails midway,
 * the row is marked with `PromoteFailedPartial` (if any prior owner in
 * the same row was promoted) or `PromoteFailed` (if none) and the
 * per-OwnerEmail breakdown is persisted via `RowStateStore` for
 * idempotent re-execution.
 */

import { runLogin } from "./run-login";
import { runSignOut } from "./run-sign-out";
import { runOwnerEmails } from "./run-owner-emails";
import { finalizeRow } from "./row-finalize";
import { RowOutcomeCode } from "./row-types";
import { LogPhase, LogSeverity, buildEntry } from "./log-sink";
import type { LogSink } from "./log-sink";
import type { PromotedOwnerRecord, RowExecutionContext, RowExecutionResult } from "./row-types";
import type { RowStateStore } from "./row-state-store";

const resolvePassword = (ctx: RowExecutionContext): string | null => {
    return ctx.Row.Password ?? ctx.Task.CommonPassword;
};

const failResult = (
    ctx: RowExecutionContext, startedAt: number, outcome: RowOutcomeCode,
    error: string, promotedOwners: ReadonlyArray<PromotedOwnerRecord>,
): RowExecutionResult => ({
    RowIndex: ctx.Row.RowIndex, Outcome: outcome,
    IsDone: false, HasError: true, LastError: error,
    DurationMs: Date.now() - startedAt, PromotedOwners: promotedOwners,
});

const succeedResult = (
    ctx: RowExecutionContext, startedAt: number,
    promotedOwners: ReadonlyArray<PromotedOwnerRecord>,
): RowExecutionResult => ({
    RowIndex: ctx.Row.RowIndex, Outcome: RowOutcomeCode.Succeeded,
    IsDone: true, HasError: false, LastError: null,
    DurationMs: Date.now() - startedAt, PromotedOwners: promotedOwners,
});

const noteSignOut = (ctx: RowExecutionContext, sink: LogSink, error: string | null): void => {
    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.SignOut,
        LogSeverity.Warn, `Sign-out best-effort failed: ${error ?? "unknown"}`,
    ));
};

const promoteOutcomeCode = (records: ReadonlyArray<PromotedOwnerRecord>): RowOutcomeCode => {
    const anyPromoted = records.some((r) => r.Promoted);

    return anyPromoted ? RowOutcomeCode.PromoteFailedPartial : RowOutcomeCode.PromoteFailed;
};

export const runRow = async (
    ctx: RowExecutionContext, sink: LogSink, store: RowStateStore,
): Promise<RowExecutionResult> => {
    const startedAt = Date.now();
    const password = resolvePassword(ctx);

    if (password === null) {
        return finalizeRow(ctx, sink, store, failResult(
            ctx, startedAt, RowOutcomeCode.PasswordMissing,
            "Password missing on row and no CommonPassword fallback", [],
        ));
    }

    const login = await runLogin({
        Credentials: { LoginEmail: ctx.Row.LoginEmail, Password: password },
        LoginUrl: ctx.Task.LoginUrl,
    }, ctx.XPathOverrides);

    if (login.Error !== null) {
        return finalizeRow(ctx, sink, store, failResult(
            ctx, startedAt, RowOutcomeCode.LoginFailed, login.Error, [],
        ));
    }

    const owners = await runOwnerEmails(ctx, sink);

    if (owners.Failure !== null) {
        await runSignOut(ctx.XPathOverrides);

        return finalizeRow(ctx, sink, store, failResult(
            ctx, startedAt, promoteOutcomeCode(owners.Records),
            `${owners.Failure.Email}: ${owners.Failure.Error}`, owners.Records,
        ));
    }

    const signOut = await runSignOut(ctx.XPathOverrides);

    if (!signOut.Succeeded) {
        noteSignOut(ctx, sink, signOut.Error);
    }

    return finalizeRow(ctx, sink, store, succeedResult(ctx, startedAt, owners.Records));
};
