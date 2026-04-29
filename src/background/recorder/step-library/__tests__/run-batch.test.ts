/**
 * run-batch.test.ts — sequential execution of multiple groups in
 * caller-specified order, per-group status reporting, and failure
 * policy semantics.
 *
 * Covers:
 *   - groups execute in the exact order passed (not OrderIndex)
 *   - per-group status transitions Pending → Running → Succeeded/Failed
 *   - StopOnFailure aborts remaining groups as Skipped
 *   - ContinueOnFailure attempts every group
 *   - onGroupStatus callback fires for every transition
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";

import { StepLibraryDb } from "../db";
import { StepKindId } from "../schema";
import { runBatch, type BatchGroupReport } from "../run-batch";
import type { LeafStepExecutor } from "../run-group-runner";
import type { FailureReport } from "../../failure-logger";

let SQL: SqlJsStatic;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../../../../../node_modules/sql.js/dist/sql-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    SQL = await initSqlJs({
        wasmBinary: wasmBinary.buffer.slice(
            wasmBinary.byteOffset,
            wasmBinary.byteOffset + wasmBinary.byteLength,
        ),
    });
});

function freshDb(): StepLibraryDb {
    return new StepLibraryDb(new SQL.Database());
}

function makeGroup(db: StepLibraryDb, projectId: number, name: string): number {
    const id = db.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: name,
        Description: null,
    });
    db.appendStep({
        StepGroupId: id,
        StepKindId: StepKindId.Click,
        Label: `Click in ${name}`,
        PayloadJson: JSON.stringify({ Selector: `#${name}` }),
    });
    return id;
}

function passingExecutor(): LeafStepExecutor {
    return () => null;
}

function failingExecutor(forGroupName: string, lib: StepLibraryDb): LeafStepExecutor {
    return (step) => {
        const group = lib.listGroups(1).find((g) => g.StepGroupId === step.StepGroupId);
        if (group?.Name === forGroupName) {
            const fr: FailureReport = {
                Reason: "Unknown",
                Message: `synthetic failure in ${forGroupName}`,
                Selector: null,
                XPath: null,
                FieldName: null,
                FieldType: null,
                Vars: {},
                Row: null,
                JsLog: null,
                CapturedAt: new Date().toISOString(),
            } as unknown as FailureReport;
            return fr;
        }
        return null;
    };
}

describe("runBatch — sequential multi-group execution", () => {
    it("executes groups in the exact order given, not OrderIndex", async () => {
        const db = freshDb();
        const proj = db.upsertProject({ ExternalId: "p", Name: "Batch" });
        const a = makeGroup(db, proj, "A");
        const b = makeGroup(db, proj, "B");
        const c = makeGroup(db, proj, "C");
        // Caller-specified order is C, A, B — opposite of insertion.
        const order: ReadonlyArray<number> = [c, a, b];
        const transitions: Array<{ idx: number; status: BatchGroupReport["Status"] }> = [];
        const result = await runBatch({
            db,
            projectId: proj,
            orderedGroupIds: order,
            executeLeafStep: passingExecutor(),
            onGroupStatus: (r, i) => transitions.push({ idx: i, status: r.Status }),
        });
        expect(result.Ok).toBe(true);
        expect(result.Succeeded).toBe(3);
        expect(result.Failed).toBe(0);
        expect(result.Reports.map((r) => r.StepGroupId)).toEqual([c, a, b]);
        // Each group should transition Running then Succeeded.
        const runningOrder = transitions.filter((t) => t.status === "Running").map((t) => t.idx);
        expect(runningOrder).toEqual([0, 1, 2]);
    });

    it("StopOnFailure aborts remaining groups as Skipped", async () => {
        const db = freshDb();
        const proj = db.upsertProject({ ExternalId: "p", Name: "Batch" });
        const a = makeGroup(db, proj, "A");
        const b = makeGroup(db, proj, "B"); // will fail
        const c = makeGroup(db, proj, "C");
        const result = await runBatch({
            db,
            projectId: proj,
            orderedGroupIds: [a, b, c],
            executeLeafStep: failingExecutor("B", db),
            failurePolicy: "StopOnFailure",
        });
        expect(result.Ok).toBe(false);
        expect(result.Succeeded).toBe(1);
        expect(result.Failed).toBe(1);
        expect(result.Skipped).toBe(1);
        expect(result.Reports[0].Status).toBe("Succeeded");
        expect(result.Reports[1].Status).toBe("Failed");
        expect(result.Reports[2].Status).toBe("Skipped");
        expect(result.Reports[2].Result).toBeNull();
    });

    it("ContinueOnFailure runs every group regardless of failures", async () => {
        const db = freshDb();
        const proj = db.upsertProject({ ExternalId: "p", Name: "Batch" });
        const a = makeGroup(db, proj, "A");
        const b = makeGroup(db, proj, "B"); // fails
        const c = makeGroup(db, proj, "C");
        const result = await runBatch({
            db,
            projectId: proj,
            orderedGroupIds: [a, b, c],
            executeLeafStep: failingExecutor("B", db),
            failurePolicy: "ContinueOnFailure",
        });
        expect(result.Ok).toBe(false);
        expect(result.Succeeded).toBe(2);
        expect(result.Failed).toBe(1);
        expect(result.Skipped).toBe(0);
        expect(result.Reports.map((r) => r.Status)).toEqual([
            "Succeeded", "Failed", "Succeeded",
        ]);
    });

    it("emits a Running event then a terminal event for each group", async () => {
        const db = freshDb();
        const proj = db.upsertProject({ ExternalId: "p", Name: "Batch" });
        const a = makeGroup(db, proj, "A");
        const events: BatchGroupReport["Status"][] = [];
        await runBatch({
            db,
            projectId: proj,
            orderedGroupIds: [a],
            executeLeafStep: passingExecutor(),
            onGroupStatus: (r) => events.push(r.Status),
        });
        expect(events).toEqual(["Running", "Succeeded"]);
    });
});
