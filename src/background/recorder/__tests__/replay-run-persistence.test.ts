/**
 * Phase 09 — Replay-Run Persistence unit tests.
 *
 * Verifies that ReplayRun + ReplayStepResult rows are inserted with the
 * correct counts, listed newest-first, and cascade-deleted together. Uses
 * sql.js in-memory DBs against the canonical RECORDER_DB_SCHEMA so the FK
 * ON DELETE CASCADE is exercised end-to-end.
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import { RECORDER_DB_SCHEMA } from "../../recorder-db-schema";
import {
    insertReplayRunRow,
    listReplayRunRows,
    listStepResultsForRun,
    deleteReplayRunRow,
    type ReplayRunDraft,
} from "../replay-run-persistence";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({
        locateFile: (file) => `node_modules/sql.js/dist/${file}`,
    });
});

function freshDb(): SqlJsDatabase {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    db.run(RECORDER_DB_SCHEMA);
    return db;
}

const sampleDraft = (overrides: Partial<ReplayRunDraft> = {}): ReplayRunDraft => ({
    StartedAt: "2026-04-26T10:00:00.000Z",
    FinishedAt: "2026-04-26T10:00:01.500Z",
    Notes: "smoke run",
    StepResults: [
        {
            StepId: 1, OrderIndex: 1, IsOk: true, ErrorMessage: null,
            ResolvedXPath: "//button[@id='go']",
            StartedAt: "2026-04-26T10:00:00.100Z",
            FinishedAt: "2026-04-26T10:00:00.200Z",
            DurationMs: 100,
        },
        {
            StepId: 2, OrderIndex: 2, IsOk: false,
            ErrorMessage: "Element not found for selector '#missing'",
            ResolvedXPath: "#missing",
            StartedAt: "2026-04-26T10:00:00.300Z",
            FinishedAt: "2026-04-26T10:00:00.500Z",
            DurationMs: 200,
        },
    ],
    ...overrides,
});

describe("replay-run-persistence", () => {
    it("inserts a ReplayRun with derived counts", () => {
        const db = freshDb();
        const run = insertReplayRunRow(db, sampleDraft());

        expect(run.ReplayRunId).toBeGreaterThan(0);
        expect(run.TotalSteps).toBe(2);
        expect(run.OkSteps).toBe(1);
        expect(run.FailedSteps).toBe(1);
        expect(run.Notes).toBe("smoke run");
    });

    it("inserts one ReplayStepResult row per provided result", () => {
        const db = freshDb();
        const run = insertReplayRunRow(db, sampleDraft());

        const results = listStepResultsForRun(db, run.ReplayRunId);
        expect(results).toHaveLength(2);
        expect(results[0]!.StepId).toBe(1);
        expect(results[0]!.IsOk).toBe(1);
        expect(results[1]!.StepId).toBe(2);
        expect(results[1]!.IsOk).toBe(0);
        expect(results[1]!.ErrorMessage).toMatch(/not found/);
    });

    it("lists runs newest-first", () => {
        const db = freshDb();
        insertReplayRunRow(db, sampleDraft({
            StartedAt: "2026-04-25T08:00:00.000Z",
            FinishedAt: "2026-04-25T08:00:01.000Z",
            Notes: "older",
        }));
        insertReplayRunRow(db, sampleDraft({
            StartedAt: "2026-04-26T09:00:00.000Z",
            FinishedAt: "2026-04-26T09:00:01.000Z",
            Notes: "newer",
        }));

        const runs = listReplayRunRows(db);
        expect(runs).toHaveLength(2);
        expect(runs[0]!.Notes).toBe("newer");
        expect(runs[1]!.Notes).toBe("older");
    });

    it("cascades step-result deletes when the parent run is deleted", () => {
        const db = freshDb();
        const run = insertReplayRunRow(db, sampleDraft());
        expect(listStepResultsForRun(db, run.ReplayRunId)).toHaveLength(2);

        deleteReplayRunRow(db, run.ReplayRunId);

        expect(listReplayRunRows(db)).toHaveLength(0);
        expect(listStepResultsForRun(db, run.ReplayRunId)).toHaveLength(0);
    });

    it("supports a run with zero step results", () => {
        const db = freshDb();
        const run = insertReplayRunRow(db, sampleDraft({ StepResults: [] }));
        expect(run.TotalSteps).toBe(0);
        expect(run.OkSteps).toBe(0);
        expect(run.FailedSteps).toBe(0);
        expect(listStepResultsForRun(db, run.ReplayRunId)).toHaveLength(0);
    });
});
