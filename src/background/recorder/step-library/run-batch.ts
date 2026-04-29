/**
 * Marco Extension — Run Batch
 *
 * Sequential, ordered execution of multiple StepGroups. Each group is
 * dispatched through the existing `runGroup()` runner, so the same
 * cycle/depth/cross-project guards apply per group.
 *
 * Why a thin wrapper instead of a single mega-runner:
 *   - Each group is an INDEPENDENT execution: failure in group A
 *     does not corrupt the trace of group B (they get distinct
 *     `RunGroupResult`s).
 *   - The UI can stream per-group status updates by passing an
 *     `onGroupStatus` callback — no polling, no shared mutable buffer.
 *   - Keeps `run-group-runner.ts` focused on tree traversal; batch
 *     ordering is orthogonal.
 *
 * Failure policy is a caller decision:
 *   - "StopOnFailure" (default) — first failed group aborts the batch;
 *     remaining groups stay `Pending` and surface as "Skipped" in the
 *     final report.
 *   - "ContinueOnFailure" — every group is attempted; the batch
 *     `Ok` flag reports the aggregate.
 *
 * @see ./run-group-runner.ts
 */

import type { StepLibraryDb } from "./db";
import {
    runGroup,
    type LeafStepExecutor,
    type RunGroupResult,
} from "./run-group-runner";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type BatchGroupStatus =
    | "Pending"
    | "Running"
    | "Succeeded"
    | "Failed"
    | "Skipped"; // batch aborted before this group ran

export interface BatchGroupReport {
    readonly StepGroupId: number;
    readonly Status: BatchGroupStatus;
    readonly StartedAt: string | null;
    readonly EndedAt: string | null;
    readonly DurationMs: number;
    /** Present iff the group actually ran (Succeeded or Failed). */
    readonly Result: RunGroupResult | null;
}

export type BatchFailurePolicy = "StopOnFailure" | "ContinueOnFailure";

export interface RunBatchOptions {
    readonly db: StepLibraryDb;
    readonly projectId: number;
    /** Ordered list of StepGroupIds to execute, in the exact order chosen by the user. */
    readonly orderedGroupIds: ReadonlyArray<number>;
    readonly executeLeafStep: LeafStepExecutor;
    readonly failurePolicy?: BatchFailurePolicy;
    /** Streamed status update; called whenever any row's Status changes. */
    readonly onGroupStatus?: (report: BatchGroupReport, index: number) => void;
    /** Override for tests. */
    readonly now?: () => Date;
}

export interface RunBatchResult {
    readonly Ok: boolean;
    readonly TotalGroups: number;
    readonly Succeeded: number;
    readonly Failed: number;
    readonly Skipped: number;
    readonly Reports: ReadonlyArray<BatchGroupReport>;
    readonly DurationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

const NO_DURATION = 0;

function defaultNow(): Date {
    return new Date();
}

function emptyReport(stepGroupId: number): BatchGroupReport {
    return {
        StepGroupId: stepGroupId,
        Status: "Pending",
        StartedAt: null,
        EndedAt: null,
        DurationMs: NO_DURATION,
        Result: null,
    };
}

function emit(
    cb: RunBatchOptions["onGroupStatus"],
    report: BatchGroupReport,
    index: number,
): void {
    if (cb !== undefined) cb(report, index);
}

export async function runBatch(opts: RunBatchOptions): Promise<RunBatchResult> {
    const now = opts.now ?? defaultNow;
    const policy: BatchFailurePolicy = opts.failurePolicy ?? "StopOnFailure";
    const reports: BatchGroupReport[] = opts.orderedGroupIds.map(emptyReport);
    const batchStart = now();
    let succeeded = 0;
    let failed = 0;
    let aborted = false;

    for (let i = 0; i < reports.length; i++) {
        if (aborted) {
            reports[i] = { ...reports[i], Status: "Skipped" };
            emit(opts.onGroupStatus, reports[i], i);
            continue;
        }
        const startDate = now();
        reports[i] = { ...reports[i], Status: "Running", StartedAt: startDate.toISOString() };
        emit(opts.onGroupStatus, reports[i], i);

        const result = await runGroup({
            db: opts.db,
            projectId: opts.projectId,
            rootGroupId: reports[i].StepGroupId,
            executeLeafStep: opts.executeLeafStep,
            now: opts.now,
        });

        const endDate = now();
        const final: BatchGroupReport = {
            ...reports[i],
            Status: result.Ok ? "Succeeded" : "Failed",
            EndedAt: endDate.toISOString(),
            DurationMs: endDate.getTime() - startDate.getTime(),
            Result: result,
        };
        reports[i] = final;
        if (result.Ok) succeeded++; else failed++;
        emit(opts.onGroupStatus, final, i);
        if (!result.Ok && policy === "StopOnFailure") aborted = true;
    }

    const skipped = reports.length - succeeded - failed;
    return {
        Ok: failed === 0 && skipped === 0,
        TotalGroups: reports.length,
        Succeeded: succeeded,
        Failed: failed,
        Skipped: skipped,
        Reports: reports,
        DurationMs: now().getTime() - batchStart.getTime(),
    };
}
