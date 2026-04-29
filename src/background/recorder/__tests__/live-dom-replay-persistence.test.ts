// @vitest-environment jsdom

/**
 * Phase 09 — executeReplay → ReplayRun persistence integration.
 *
 * Drives `executeReplay` against a jsdom Document, with `initProjectDb`
 * mocked to return an in-memory sql.js DB seeded with `RECORDER_DB_SCHEMA`.
 * Asserts the run row + per-step results are saved with the right counts,
 * timestamps, and error messages.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import { RECORDER_DB_SCHEMA, SelectorKindId } from "../../recorder-db-schema";
import {
    listReplayRunRows,
    listStepResultsForRun,
} from "../replay-run-persistence";
import type { PersistedSelector } from "../step-persistence";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let sharedDb: SqlJsDatabase;

vi.mock("../../project-db-manager", () => ({
    initProjectDb: vi.fn(async () => ({
        getDb: () => sharedDb,
        markDirty: () => undefined,
    })),
}));

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

function cssSelector(stepId: number, expr: string): PersistedSelector[] {
    return [{
        SelectorId: stepId * 10,
        StepId: stepId,
        SelectorKindId: SelectorKindId.Css,
        Expression: expr,
        AnchorSelectorId: null,
        IsPrimary: 1,
    }];
}

describe("executeReplay → ReplayRun persistence", () => {
    it("persists run with one ok + one failed step result", async () => {
        sharedDb = freshDb();
        document.body.innerHTML = `<button id="go">Go</button>`;

        // Import after mock so the dynamic import picks it up
        const { executeReplay } = await import("../live-dom-replay");

        const ts = [
            new Date("2026-04-26T10:00:00.000Z"),
            new Date("2026-04-26T10:00:00.100Z"),
            new Date("2026-04-26T10:00:00.200Z"),
            new Date("2026-04-26T10:00:00.300Z"),
            new Date("2026-04-26T10:00:00.400Z"),
            new Date("2026-04-26T10:00:00.500Z"),
        ];
        let i = 0;
        const now = (): Date => ts[Math.min(i++, ts.length - 1)]!;

        const outcome = await executeReplay(
            [
                { StepId: 1, Index: 1, Kind: "Click", Selectors: cssSelector(1, "#go") },
                { StepId: 2, Index: 2, Kind: "Click", Selectors: cssSelector(2, "#missing") },
            ],
            {
                Doc: document,
                Now: now,
                Persist: { ProjectSlug: "demo", Notes: "from test" },
            },
        );

        expect(outcome.PersistedRun).not.toBeNull();
        expect(outcome.PersistedRun!.TotalSteps).toBe(2);
        expect(outcome.PersistedRun!.OkSteps).toBe(1);
        expect(outcome.PersistedRun!.FailedSteps).toBe(1);
        expect(outcome.PersistedRun!.Notes).toBe("from test");

        const runs = listReplayRunRows(sharedDb);
        expect(runs).toHaveLength(1);

        const stepResults = listStepResultsForRun(sharedDb, runs[0]!.ReplayRunId);
        expect(stepResults).toHaveLength(2);
        expect(stepResults[0]!.StepId).toBe(1);
        expect(stepResults[0]!.IsOk).toBe(1);
        expect(stepResults[1]!.StepId).toBe(2);
        expect(stepResults[1]!.IsOk).toBe(0);
        expect(stepResults[1]!.ErrorMessage).toMatch(/not found/);

        // ErrorMessage now holds the structured FailureReport JSON so the
        // user can copy the diagnostic blob from the project DB later.
        const parsed = JSON.parse(stepResults[1]!.ErrorMessage!);
        expect(parsed.Phase).toBe("Replay");
        expect(parsed.StepId).toBe(2);
        expect(parsed.StepKind).toBe("Click");
        expect(parsed.Selectors[0].Strategy).toBe("Css");
        expect(parsed.Selectors[0].Expression).toBe("#missing");
        expect(parsed.Selectors[0].Matched).toBe(false);
        expect(parsed.Selectors[0].FailureReason).toBe("ZeroMatches");
        expect(parsed.Reason).toBe("ZeroMatches");
        expect(parsed.SourceFile).toBe("src/background/recorder/live-dom-replay.ts");

        // The live result also exposes the report so React layers can toast it.
        expect(outcome.Results[1]!.FailureReport).toBeDefined();
        expect(outcome.Results[1]!.FailureReport!.Message).toMatch(/not found/);
    });

    it("does not persist when Persist option is omitted", async () => {
        sharedDb = freshDb();
        document.body.innerHTML = `<button id="go">Go</button>`;

        const { executeReplay } = await import("../live-dom-replay");

        const outcome = await executeReplay(
            [{ StepId: 1, Index: 1, Kind: "Click", Selectors: cssSelector(1, "#go") }],
            { Doc: document },
        );

        expect(outcome.PersistedRun).toBeNull();
        expect(listReplayRunRows(sharedDb)).toHaveLength(0);
    });
});
