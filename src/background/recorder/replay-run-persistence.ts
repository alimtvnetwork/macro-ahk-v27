/**
 * Marco Extension — Replay-Run Persistence
 *
 * Phase 09 — Macro Recorder.
 *
 * Persists the outcome of a {@link executeReplay} invocation into the
 * per-project SQLite DB so the user can later browse run history, inspect
 * which Steps failed, and view error messages + resolved selectors.
 *
 * Schema:
 *   - `ReplayRun`         — one row per replay invocation (timestamps + counts).
 *   - `ReplayStepResult`  — one row per executed Step (FK → ReplayRun, cascades).
 *
 * Pure DB-layer helpers accept a `SqlJsDatabase` so they are unit-testable
 * with an in-memory schema. Async wrappers route through `initProjectDb`.
 *
 * @see ./live-dom-replay.ts          — Producer of the run results.
 * @see ../recorder-db-schema.ts      — Authoritative schema.
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface ReplayStepResultDraft {
    readonly StepId: number;
    readonly OrderIndex: number;
    readonly IsOk: boolean;
    readonly ErrorMessage: string | null;
    readonly ResolvedXPath: string | null;
    readonly StartedAt: string;
    readonly FinishedAt: string;
    readonly DurationMs: number;
}

export interface ReplayRunDraft {
    readonly StartedAt: string;
    readonly FinishedAt: string;
    readonly Notes: string;
    readonly StepResults: ReadonlyArray<ReplayStepResultDraft>;
}

export interface PersistedReplayRun {
    readonly ReplayRunId: number;
    readonly StartedAt: string;
    readonly FinishedAt: string | null;
    readonly TotalSteps: number;
    readonly OkSteps: number;
    readonly FailedSteps: number;
    readonly Notes: string;
}

export interface PersistedReplayStepResult {
    readonly ReplayStepResultId: number;
    readonly ReplayRunId: number;
    readonly StepId: number;
    readonly OrderIndex: number;
    readonly IsOk: number;
    readonly ErrorMessage: string | null;
    readonly ResolvedXPath: string | null;
    readonly StartedAt: string;
    readonly FinishedAt: string;
    readonly DurationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer helpers                                              */
/* ------------------------------------------------------------------ */

export function insertReplayRunRow(
    db: SqlJsDatabase,
    draft: ReplayRunDraft,
): PersistedReplayRun {
    const total = draft.StepResults.length;
    const ok = draft.StepResults.filter((r) => r.IsOk).length;
    const failed = total - ok;

    db.run(
        `INSERT INTO ReplayRun
            (StartedAt, FinishedAt, TotalSteps, OkSteps, FailedSteps, Notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [draft.StartedAt, draft.FinishedAt, total, ok, failed, draft.Notes],
    );

    const runId = lastInsertId(db);

    for (const r of draft.StepResults) {
        db.run(
            `INSERT INTO ReplayStepResult
                (ReplayRunId, StepId, OrderIndex, IsOk, ErrorMessage, ResolvedXPath,
                 StartedAt, FinishedAt, DurationMs)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                runId,
                r.StepId,
                r.OrderIndex,
                r.IsOk ? 1 : 0,
                r.ErrorMessage,
                r.ResolvedXPath,
                r.StartedAt,
                r.FinishedAt,
                r.DurationMs,
            ],
        );
    }

    return readReplayRun(db, runId);
}

export function listReplayRunRows(
    db: SqlJsDatabase,
): ReadonlyArray<PersistedReplayRun> {
    const result = db.exec(
        `SELECT ReplayRunId, StartedAt, FinishedAt, TotalSteps, OkSteps, FailedSteps, Notes
         FROM ReplayRun
         ORDER BY StartedAt DESC, ReplayRunId DESC`,
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToRun);
}

export function listStepResultsForRun(
    db: SqlJsDatabase,
    replayRunId: number,
): ReadonlyArray<PersistedReplayStepResult> {
    const result = db.exec(
        `SELECT ReplayStepResultId, ReplayRunId, StepId, OrderIndex, IsOk,
                ErrorMessage, ResolvedXPath, StartedAt, FinishedAt, DurationMs
         FROM ReplayStepResult
         WHERE ReplayRunId = ?
         ORDER BY OrderIndex ASC, ReplayStepResultId ASC`,
        [replayRunId],
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToStepResult);
}

/**
 * Returns every persisted ReplayStepResult for a single Step across all
 * runs, oldest first. Used by the per-selector history toggle so the UI
 * can show when a selector started failing.
 */
export function listStepResultsForStep(
    db: SqlJsDatabase,
    stepId: number,
): ReadonlyArray<PersistedReplayStepResult> {
    const result = db.exec(
        `SELECT ReplayStepResultId, ReplayRunId, StepId, OrderIndex, IsOk,
                ErrorMessage, ResolvedXPath, StartedAt, FinishedAt, DurationMs
         FROM ReplayStepResult
         WHERE StepId = ?
         ORDER BY StartedAt ASC, ReplayStepResultId ASC`,
        [stepId],
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToStepResult);
}

export function deleteReplayRunRow(
    db: SqlJsDatabase,
    replayRunId: number,
): void {
    // ReplayStepResult rows cascade via FK ON DELETE CASCADE.
    db.run("DELETE FROM ReplayRun WHERE ReplayRunId = ?", [replayRunId]);
}

/* ------------------------------------------------------------------ */
/*  Async facade — production callers                                  */
/* ------------------------------------------------------------------ */

export async function saveReplayRun(
    projectSlug: string,
    draft: ReplayRunDraft,
): Promise<PersistedReplayRun> {
    const mgr = await initProjectDb(projectSlug);
    const run = insertReplayRunRow(mgr.getDb(), draft);
    mgr.markDirty();
    return run;
}

export async function listReplayRuns(
    projectSlug: string,
): Promise<ReadonlyArray<PersistedReplayRun>> {
    const mgr = await initProjectDb(projectSlug);
    return listReplayRunRows(mgr.getDb());
}

export async function listReplayStepResults(
    projectSlug: string,
    replayRunId: number,
): Promise<ReadonlyArray<PersistedReplayStepResult>> {
    const mgr = await initProjectDb(projectSlug);
    return listStepResultsForRun(mgr.getDb(), replayRunId);
}

/**
 * Cross-run history for a single Step — load with `buildSelectorHistory`
 * to render the per-selector "when did it start failing?" timeline.
 */
export async function listReplayStepResultsForStep(
    projectSlug: string,
    stepId: number,
): Promise<ReadonlyArray<PersistedReplayStepResult>> {
    const mgr = await initProjectDb(projectSlug);
    return listStepResultsForStep(mgr.getDb(), stepId);
}

export async function deleteReplayRun(
    projectSlug: string,
    replayRunId: number,
): Promise<void> {
    const mgr = await initProjectDb(projectSlug);
    deleteReplayRunRow(mgr.getDb(), replayRunId);
    mgr.markDirty();
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function lastInsertId(db: SqlJsDatabase): number {
    const result = db.exec("SELECT last_insert_rowid()");
    return result[0].values[0][0] as number;
}

function readReplayRun(db: SqlJsDatabase, runId: number): PersistedReplayRun {
    const result = db.exec(
        `SELECT ReplayRunId, StartedAt, FinishedAt, TotalSteps, OkSteps, FailedSteps, Notes
         FROM ReplayRun WHERE ReplayRunId = ?`,
        [runId],
    );
    const row = result[0]?.values[0];
    if (row === undefined) {
        throw new Error(`ReplayRun row missing for ReplayRunId ${runId} after insert`);
    }
    return rowToRun(row);
}

function rowToRun(row: ReadonlyArray<unknown>): PersistedReplayRun {
    return {
        ReplayRunId: row[0] as number,
        StartedAt: row[1] as string,
        FinishedAt: (row[2] as string | null) ?? null,
        TotalSteps: row[3] as number,
        OkSteps: row[4] as number,
        FailedSteps: row[5] as number,
        Notes: (row[6] as string | null) ?? "",
    };
}

function rowToStepResult(row: ReadonlyArray<unknown>): PersistedReplayStepResult {
    return {
        ReplayStepResultId: row[0] as number,
        ReplayRunId: row[1] as number,
        StepId: row[2] as number,
        OrderIndex: row[3] as number,
        IsOk: row[4] as number,
        ErrorMessage: (row[5] as string | null) ?? null,
        ResolvedXPath: (row[6] as string | null) ?? null,
        StartedAt: row[7] as string,
        FinishedAt: row[8] as string,
        DurationMs: row[9] as number,
    };
}
