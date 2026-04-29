/**
 * expand-and-execute.test.ts — production-entry runner surface.
 *
 *   - `expandRunGroups` flattens RunGroup steps into a linear plan and
 *     rejects cycles / depth overflow / missing targets at expansion time.
 *   - `executeRunGroup` always returns a canonical `FailureReport` for
 *     every failure path (leaf AND runner-level), so the UI / log layer
 *     has one shape to render.
 *
 * These complement `run-group-runner.test.ts` (which exercises the raw
 * discriminated `runGroup` API).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";

import { StepLibraryDb } from "../db";
import { StepKindId, MAX_RUN_GROUP_CALL_DEPTH } from "../schema";
import {
    expandRunGroups,
    executeRunGroup,
    type ExpansionResult,
    type ExpansionSuccess,
    type ExpansionFailure,
    type ExecuteRunGroupOutcome,
    type ExecuteRunGroupFailure,
} from "../run-group-runner";
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

function asExpansionSuccess(r: ExpansionResult): ExpansionSuccess {
    if (!r.Ok) throw new Error(`Expected expansion success, got ${r.Reason}: ${r.ReasonDetail}`);
    return r;
}

function asExpansionFailure(r: ExpansionResult): ExpansionFailure {
    if (r.Ok) throw new Error(`Expected expansion failure, got plan with ${r.Steps.length} steps`);
    return r;
}

function asExecuteFailure(r: ExecuteRunGroupOutcome): ExecuteRunGroupFailure {
    if (r.Ok) throw new Error("Expected executeRunGroup to fail");
    return r;
}

/* ------------------------------------------------------------------ */
/*  expandRunGroups                                                    */
/* ------------------------------------------------------------------ */

describe("expandRunGroups", () => {
    it("flattens nested RunGroup chains preserving order + GroupPath", () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });

        const root  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Root" });
        const helper = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Helper" });
        const inner  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Inner" });

        db.appendStep({ StepGroupId: inner, StepKindId: StepKindId.Click, Label: "InnerA" });
        db.appendStep({ StepGroupId: inner, StepKindId: StepKindId.Type,  Label: "InnerB" });

        db.appendStep({ StepGroupId: helper, StepKindId: StepKindId.Click, Label: "Pre" });
        db.appendStep({ StepGroupId: helper, StepKindId: StepKindId.RunGroup, TargetStepGroupId: inner, Label: "→Inner" });
        db.appendStep({ StepGroupId: helper, StepKindId: StepKindId.Click, Label: "Post" });

        db.appendStep({ StepGroupId: root, StepKindId: StepKindId.Click, Label: "Start" });
        db.appendStep({ StepGroupId: root, StepKindId: StepKindId.RunGroup, TargetStepGroupId: helper, Label: "→Helper" });

        const plan = asExpansionSuccess(expandRunGroups({ db, projectId, rootGroupId: root }));

        // No RunGroup steps survive expansion.
        expect(plan.Steps.every(s => s.Step.StepKindId !== StepKindId.RunGroup)).toBe(true);
        expect(plan.Steps.map(s => s.Step.Label)).toEqual([
            "Start", "Pre", "InnerA", "InnerB", "Post",
        ]);
        expect(plan.Steps.map(s => s.GroupPath.join(">"))).toEqual([
            "Root", "Root>Helper", "Root>Helper>Inner", "Root>Helper>Inner", "Root>Helper",
        ]);
        // PlanIndex is dense + sequential.
        expect(plan.Steps.map(s => s.PlanIndex)).toEqual([0, 1, 2, 3, 4]);
        expect(plan.GroupsVisited).toBe(3);
    });

    it("by default drops disabled steps from the plan; opt-in keeps them", () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "G" });
        const sOn = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "On" });
        const sOff = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "Off" });
        db.raw.exec(`UPDATE Step SET IsDisabled = 1 WHERE StepId = ${sOff};`);

        const dropped = asExpansionSuccess(expandRunGroups({ db, projectId, rootGroupId: g }));
        expect(dropped.Steps.map(s => s.Step.StepId)).toEqual([sOn]);
        expect(dropped.DisabledSkipped).toBe(1);

        const kept = asExpansionSuccess(expandRunGroups({ db, projectId, rootGroupId: g, skipDisabled: false }));
        expect(kept.Steps.map(s => s.Step.StepId)).toEqual([sOn, sOff]);
        expect(kept.DisabledSkipped).toBe(0);
    });

    it("rejects cycles at expansion time without producing any plan steps from the bad branch", () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const a = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "A" });
        const b = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "B" });
        db.appendStep({ StepGroupId: a, StepKindId: StepKindId.Click, Label: "leadIn" });
        db.appendStep({ StepGroupId: a, StepKindId: StepKindId.RunGroup, TargetStepGroupId: b, Label: "A→B" });
        db.appendStep({ StepGroupId: b, StepKindId: StepKindId.RunGroup, TargetStepGroupId: a, Label: "B→A" });

        const failure = asExpansionFailure(expandRunGroups({ db, projectId, rootGroupId: a }));
        expect(failure.Reason).toBe("RunGroupCycle");
        // The pre-cycle leaf was already added to the plan — surfaced via PartialSteps.
        expect(failure.PartialSteps.map(s => s.Step.Label)).toEqual(["leadIn"]);
        expect(failure.CallStack).toEqual(["A", "B"]);
    });

    it("rejects depth overflow during expansion", () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const ids: number[] = [];
        for (let i = 0; i < MAX_RUN_GROUP_CALL_DEPTH + 2; i++) {
            ids.push(db.createGroup({
                ProjectId: projectId, ParentStepGroupId: null, Name: `G${i}`,
            }));
        }
        for (let i = 0; i < ids.length - 1; i++) {
            db.appendStep({
                StepGroupId: ids[i],
                StepKindId: StepKindId.RunGroup,
                TargetStepGroupId: ids[i + 1],
                Label: `→G${i + 1}`,
            });
        }
        const failure = asExpansionFailure(expandRunGroups({ db, projectId, rootGroupId: ids[0] }));
        expect(failure.Reason).toBe("RunGroupDepthExceeded");
    });

    it("rejects unknown root and cross-project root", () => {
        const db = freshDb();
        const p1 = db.upsertProject({ ExternalId: "p1", Name: "P1" });
        const p2 = db.upsertProject({ ExternalId: "p2", Name: "P2" });
        const g = db.createGroup({ ProjectId: p1, ParentStepGroupId: null, Name: "Owned" });

        expect(asExpansionFailure(expandRunGroups({ db, projectId: p1, rootGroupId: 9999 })).Reason)
            .toBe("MissingRootGroup");
        expect(asExpansionFailure(expandRunGroups({ db, projectId: p2, rootGroupId: g })).Reason)
            .toBe("TargetNotInProject");
    });
});

/* ------------------------------------------------------------------ */
/*  executeRunGroup — uniform FailureReport                            */
/* ------------------------------------------------------------------ */

function assertCanonicalReport(r: FailureReport): void {
    // Every required field present + correctly-typed (smoke-check the schema).
    expect(typeof r.Phase).toBe("string");
    expect(typeof r.Message).toBe("string");
    expect(typeof r.Reason).toBe("string");
    expect(typeof r.ReasonDetail).toBe("string");
    expect(typeof r.Timestamp).toBe("string");
    expect(typeof r.SourceFile).toBe("string");
    expect(typeof r.Verbose).toBe("boolean");
    expect(Array.isArray(r.Selectors)).toBe(true);
    expect(Array.isArray(r.Variables)).toBe(true);
    // Nullables present even when null.
    expect(r).toHaveProperty("StackTrace");
    expect(r).toHaveProperty("DomContext");
    expect(r).toHaveProperty("DataRow");
    expect(r).toHaveProperty("ResolvedXPath");
    expect(r).toHaveProperty("CapturedHtml");
    expect(r).toHaveProperty("FormSnapshot");
}

describe("executeRunGroup", () => {
    it("returns Ok+Result on success", async () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "G" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "X" });

        const out = await executeRunGroup({
            db, projectId, rootGroupId: g, executeLeafStep: () => null,
        });
        expect(out.Ok).toBe(true);
        if (out.Ok) expect(out.Result.StepsExecuted).toBe(1);
    });

    it("synthesizes a canonical FailureReport for cycle errors", async () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Loop" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.RunGroup, TargetStepGroupId: g, Label: "self" });

        const out = asExecuteFailure(await executeRunGroup({
            db, projectId, rootGroupId: g, executeLeafStep: () => null,
        }));
        expect(out.Result.Reason).toBe("RunGroupCycle");
        assertCanonicalReport(out.FailureReport);
        expect(out.FailureReport.ReasonDetail).toContain("RunnerReason=RunGroupCycle");
        expect(out.FailureReport.StepKind).toBe("RunGroup");
        expect(out.FailureReport.SourceFile).toContain("run-group-runner.ts");
    });

    it("synthesizes a canonical FailureReport for depth overflow", async () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const ids: number[] = [];
        for (let i = 0; i < MAX_RUN_GROUP_CALL_DEPTH + 2; i++) {
            ids.push(db.createGroup({
                ProjectId: projectId, ParentStepGroupId: null, Name: `D${i}`,
            }));
        }
        for (let i = 0; i < ids.length - 1; i++) {
            db.appendStep({
                StepGroupId: ids[i], StepKindId: StepKindId.RunGroup,
                TargetStepGroupId: ids[i + 1], Label: `→D${i + 1}`,
            });
        }
        const out = asExecuteFailure(await executeRunGroup({
            db, projectId, rootGroupId: ids[0], executeLeafStep: () => null,
        }));
        expect(out.Result.Reason).toBe("RunGroupDepthExceeded");
        assertCanonicalReport(out.FailureReport);
        expect(out.FailureReport.ReasonDetail).toContain(`RunnerReason=RunGroupDepthExceeded`);
    });

    it("passes leaf FailureReport through unchanged (no synthesis)", async () => {
        const db = freshDb();
        const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "L" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "X" });

        const fakeReport: FailureReport = {
            Phase: "Replay", Message: "no match", Reason: "ZeroMatches",
            ReasonDetail: "all selectors missed", StackTrace: null, StepId: 1, Index: 0,
            StepKind: "Click", Selectors: [], Variables: [], DomContext: null, DataRow: null,
            ResolvedXPath: null, Timestamp: "2026-04-26T00:00:00.000Z", SourceFile: "leaf",
            Verbose: false, CapturedHtml: null, FormSnapshot: null,
        };
        const out = asExecuteFailure(await executeRunGroup({
            db, projectId, rootGroupId: g, executeLeafStep: () => fakeReport,
        }));
        expect(out.Result.Reason).toBe("LeafStepFailed");
        expect(out.FailureReport).toBe(fakeReport); // identity — not re-synthesized
    });
});
