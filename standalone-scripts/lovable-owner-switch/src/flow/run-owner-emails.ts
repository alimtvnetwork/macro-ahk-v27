/**
 * Owner Switch — owner-promotion sub-flow.
 *
 * Iterates the 1–2 OwnerEmails per row, calling shared `runPromote`
 * (R12) and emitting one log entry per attempt. Returns ALL per-email
 * outcomes (so the row can persist a partial-success state) plus the
 * first failure (fail-fast within a single run).
 *
 * **No rollback policy (per operator direction):** when a promotion
 * fails after a previous one in the same row succeeded, we do NOT
 * attempt to revert. We persist exactly what happened so a re-run can
 * skip the already-promoted owners.
 */

import { runPromote } from "./run-promote";
import { LogPhase, LogSeverity, buildEntry } from "./log-sink";
import type { LogSink } from "./log-sink";
import type { RowExecutionContext } from "./row-types";
import type { PromotedOwnerRecord } from "./row-types";
import { PromoteStepCode } from "./promote-types";

export interface OwnerEmailFailure {
    Email: string;
    Error: string;
    FailedStep: PromoteStepCode | null;
}

export interface OwnerEmailsResult {
    Records: ReadonlyArray<PromotedOwnerRecord>;
    Failure: OwnerEmailFailure | null;
}

const collectTargets = (ctx: RowExecutionContext): string[] => {
    const targets: string[] = [ctx.Row.OwnerEmail1];

    if (ctx.Row.OwnerEmail2 !== null) {
        targets.push(ctx.Row.OwnerEmail2);
    }

    return targets;
};

const logPromote = (
    ctx: RowExecutionContext, sink: LogSink, ownerEmail: string, error: string | null,
): void => {
    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Promote,
        error === null ? LogSeverity.Info : LogSeverity.Error,
        `Promote ${ownerEmail}: ${error ?? "ok"}`,
    ));
};

const logNoRollback = (
    ctx: RowExecutionContext, sink: LogSink, alreadyDone: ReadonlyArray<string>,
): void => {
    if (alreadyDone.length === 0) {
        return;
    }

    sink.write(buildEntry(
        ctx.Task.TaskId, ctx.Row.RowIndex, LogPhase.Promote, LogSeverity.Warn,
        `No rollback performed (per policy). Already promoted in this row: ${alreadyDone.join(", ")}. ` +
        `Re-run will skip these and only retry the failed owner(s).`,
    ));
};

export const runOwnerEmails = async (
    ctx: RowExecutionContext, sink: LogSink,
): Promise<OwnerEmailsResult> => {
    const records: PromotedOwnerRecord[] = [];
    const succeeded: string[] = [];

    for (const ownerEmail of collectTargets(ctx)) {
        const promote = await runPromote(ctx.Api, ctx.Caches, {
            LoginEmail: ctx.Row.LoginEmail, OwnerEmail: ownerEmail,
        });
        logPromote(ctx, sink, ownerEmail, promote.Error);

        if (promote.Error !== null) {
            records.push({
                OwnerEmail: ownerEmail, Promoted: false,
                FailedStep: promote.FailedStep, Error: promote.Error,
            });
            logNoRollback(ctx, sink, succeeded);

            return {
                Records: records,
                Failure: {
                    Email: ownerEmail, Error: promote.Error, FailedStep: promote.FailedStep,
                },
            };
        }

        records.push({
            OwnerEmail: ownerEmail, Promoted: true, FailedStep: null, Error: null,
        });
        succeeded.push(ownerEmail);
    }

    return { Records: records, Failure: null };
};
