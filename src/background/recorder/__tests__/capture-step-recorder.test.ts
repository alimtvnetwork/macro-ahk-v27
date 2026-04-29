// @vitest-environment jsdom

/**
 * Phase 09 — Capture-Step Recorder integration.
 *
 * Verifies the Record-phase wrapper persists a step on success and emits a
 * structured `[MarcoRecord]` FailureReport on failure (e.g. when the same
 * VariableName collides with an existing Step).
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import { RECORDER_DB_SCHEMA } from "../../recorder-db-schema";
import { listStepRows } from "../step-persistence";
import type { XPathCapturePayload } from "../capture-to-step-bridge";

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

const payload: XPathCapturePayload = {
    XPathFull: "//html/body/button[1]",
    XPathRelative: null,
    AnchorXPath: null,
    SuggestedVariableName: "ClickGo",
    TagName: "button",
    Text: "Go",
};

describe("captureAndPersistStep", () => {
    it("persists a Step row on a clean capture and returns Ok=true", async () => {
        sharedDb = freshDb();
        document.body.innerHTML = `<button>Go</button>`;
        const { captureAndPersistStep } = await import("../capture-step-recorder");

        const result = await captureAndPersistStep("demo", payload);
        expect(result.Ok).toBe(true);
        expect(result.FailureReport).toBeNull();
        expect(result.Step!.VariableName).toBe("ClickGo");
        expect(listStepRows(sharedDb)).toHaveLength(1);
    });

    it("emits a [MarcoRecord] FailureReport on a duplicate VariableName", async () => {
        sharedDb = freshDb();
        document.body.innerHTML = `<button>Go</button>`;
        const { captureAndPersistStep } = await import("../capture-step-recorder");
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        // First insert succeeds; second collides on IxStepVariableNameUnique.
        await captureAndPersistStep("demo", payload);
        const result = await captureAndPersistStep("demo", payload);

        expect(result.Ok).toBe(false);
        expect(result.FailureReport).not.toBeNull();
        expect(result.FailureReport!.Phase).toBe("Record");
        expect(result.FailureReport!.SourceFile)
            .toBe("src/background/recorder/capture-step-recorder.ts");
        expect(consoleSpy.mock.calls[0]![0]).toMatch(/^\[MarcoRecord\]/);
        consoleSpy.mockRestore();

        // Only the first Step survived.
        expect(listStepRows(sharedDb)).toHaveLength(1);
    });
});
