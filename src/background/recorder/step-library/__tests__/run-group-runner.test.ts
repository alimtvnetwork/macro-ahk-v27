/**
 * run-group-runner.test.ts — runtime semantics of cross-group execution.
 *
 * Covers §3.1 acceptance criteria of
 * `spec/31-macro-recorder/16-step-group-library.md`:
 *
 *   - linear ordering by OrderIndex
 *   - nested RunGroup descent + GroupPath in trace
 *   - cycle detection (group already on the active call stack)
 *   - depth cap (MAX_RUN_GROUP_CALL_DEPTH)
 *   - missing/dangling target → MissingTargetGroup
 *   - cross-project target → TargetNotInProject
 *   - disabled steps → "Skipped" outcome, executor not invoked
 *   - leaf failure → returned FailureReport flows through unchanged
 *   - leaf executor throwing raw → runner synthesizes a FailureReport
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";

import { StepLibraryDb } from "../db";
import { StepKindId, MAX_RUN_GROUP_CALL_DEPTH } from "../schema";
import {
    runGroup,
    type LeafStepExecutor,
    type RunGroupResult,
    type RunGroupSuccess,
    type RunGroupFailure,
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

function setupProject(db: StepLibraryDb): number {
    return db.upsertProject({ ExternalId: "proj-1", Name: "Run Group Tests" });
}

function noopExecutor(): LeafStepExecutor {
    return () => null;
}

function recordingExecutor(log: Array<{ id: number; path: ReadonlyArray<string> }>): LeafStepExecutor {
    return (step, ctx) => {
        log.push({ id: step.StepId, path: ctx.GroupPath });
        return null;
    };
}

function asSuccess(r: RunGroupResult): RunGroupSuccess {
    if (!r.Ok) {
        throw new Error(`Expected success but got ${r.Reason}: ${r.ReasonDetail}`);
    }
    return r;
}

function asFailure(r: RunGroupResult): RunGroupFailure {
    if (r.Ok) {
        throw new Error(`Expected failure but got success with ${r.StepsExecuted} steps executed`);
    }
    return r;
}

describe("runGroup — linear execution", () => {
    it("executes leaf steps in OrderIndex order and counts them", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const groupId = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Login" });
        const s1 = db.appendStep({ StepGroupId: groupId, StepKindId: StepKindId.Click, Label: "Open" });
        const s2 = db.appendStep({ StepGroupId: groupId, StepKindId: StepKindId.Type, Label: "Email" });
        const s3 = db.appendStep({ StepGroupId: groupId, StepKindId: StepKindId.Click, Label: "Submit" });

        const log: Array<{ id: number; path: ReadonlyArray<string> }> = [];
        const result = asSuccess(await runGroup({
            db, projectId, rootGroupId: groupId, executeLeafStep: recordingExecutor(log),
        }));

        expect(log.map(l => l.id)).toEqual([s1, s2, s3]);
        expect(log.every(l => l.path.length === 1 && l.path[0] === "Login")).toBe(true);
        expect(result.StepsExecuted).toBe(3);
        expect(result.StepsSkipped).toBe(0);
        expect(result.GroupsEntered).toBe(1);
        expect(result.Trace.filter(t => t.Outcome === "Executed")).toHaveLength(3);
    });
});

describe("runGroup — nested RunGroup composition", () => {
    it("descends into target group and propagates GroupPath", async () => {
        const db = freshDb();
        const projectId = setupProject(db);

        const parent = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Checkout" });
        const child  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Login" });

        db.appendStep({ StepGroupId: child, StepKindId: StepKindId.Click, Label: "ChildClick" });

        db.appendStep({ StepGroupId: parent, StepKindId: StepKindId.Click, Label: "Before" });
        db.appendStep({
            StepGroupId: parent,
            StepKindId: StepKindId.RunGroup,
            Label: "InvokeLogin",
            TargetStepGroupId: child,
        });
        db.appendStep({ StepGroupId: parent, StepKindId: StepKindId.Click, Label: "After" });

        const log: Array<{ id: number; path: ReadonlyArray<string> }> = [];
        const result = asSuccess(await runGroup({
            db, projectId, rootGroupId: parent, executeLeafStep: recordingExecutor(log),
        }));

        // Three leaf executions: Before → ChildClick → After.
        expect(log).toHaveLength(3);
        expect(log[0].path).toEqual(["Checkout"]);
        expect(log[1].path).toEqual(["Checkout", "Login"]);
        expect(log[2].path).toEqual(["Checkout"]);

        expect(result.GroupsEntered).toBe(2);
        const enters = result.Trace.filter(t => t.Outcome === "EnteredGroup").map(t => t.GroupPath.join(">"));
        expect(enters).toEqual(["Checkout", "Checkout>Login"]);
    });

    it("allows the same group to appear twice sequentially (not a cycle)", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const parent = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Twice" });
        const child  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Helper" });

        db.appendStep({ StepGroupId: child, StepKindId: StepKindId.Click, Label: "X" });
        db.appendStep({ StepGroupId: parent, StepKindId: StepKindId.RunGroup, TargetStepGroupId: child, Label: "Call#1" });
        db.appendStep({ StepGroupId: parent, StepKindId: StepKindId.RunGroup, TargetStepGroupId: child, Label: "Call#2" });

        const result = asSuccess(await runGroup({
            db, projectId, rootGroupId: parent, executeLeafStep: noopExecutor(),
        }));
        expect(result.StepsExecuted).toBe(2);
        expect(result.GroupsEntered).toBe(3); // parent + 2× child
    });
});

describe("runGroup — safety: cycles & depth", () => {
    it("detects cycles when a group recursively invokes itself", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Loop" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.RunGroup, TargetStepGroupId: g, Label: "Self" });

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: g, executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("RunGroupCycle");
        expect(failure.ReasonDetail).toContain("Loop → Loop");
        expect(failure.FailureReport).toBeNull();
        expect(failure.CallStack).toEqual(["Loop"]);
    });

    it("detects indirect cycles A→B→A", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const a = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "A" });
        const b = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "B" });
        db.appendStep({ StepGroupId: a, StepKindId: StepKindId.RunGroup, TargetStepGroupId: b, Label: "A→B" });
        db.appendStep({ StepGroupId: b, StepKindId: StepKindId.RunGroup, TargetStepGroupId: a, Label: "B→A" });

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: a, executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("RunGroupCycle");
        expect(failure.ReasonDetail).toContain("A → B → A");
    });

    it("rejects call stacks deeper than MAX_RUN_GROUP_CALL_DEPTH", async () => {
        const db = freshDb();
        const projectId = setupProject(db);

        // Build a linear chain of (MAX+2) groups, each calling the next.
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

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: ids[0], executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("RunGroupDepthExceeded");
        expect(failure.ReasonDetail).toContain(String(MAX_RUN_GROUP_CALL_DEPTH));
    });
});

describe("runGroup — target validation", () => {
    it("returns MissingTargetGroup when TargetStepGroupId points at a vanished row (corrupt DB)", async () => {
        // The schema's CHECK + FK combo prevents this state at rest (deleting
        // the target would either CASCADE-delete the parent step's row or be
        // rejected by the CHECK when SET NULL fires). The runner still has a
        // defensive branch for corrupted DBs / FK-off scenarios — exercise it
        // by disabling FKs and pointing the column at a non-existent group.
        const db = freshDb();
        const projectId = setupProject(db);
        const parent = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Parent" });
        const child  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Child" });
        const stepId = db.appendStep({
            StepGroupId: parent, StepKindId: StepKindId.RunGroup, TargetStepGroupId: child, Label: "Call",
        });

        db.raw.exec("PRAGMA foreign_keys = OFF;");
        db.raw.exec(`UPDATE Step SET TargetStepGroupId = 99999 WHERE StepId = ${stepId};`);
        db.raw.exec(`DELETE FROM StepGroup WHERE StepGroupId = ${child};`);
        db.raw.exec("PRAGMA foreign_keys = ON;");

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: parent, executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("MissingTargetGroup");
        expect(failure.FailedStepId).toBe(stepId);
    });

    it("returns MissingRootGroup for an unknown rootGroupId", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: 9999, executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("MissingRootGroup");
    });

    it("returns TargetNotInProject when caller passes wrong projectId", async () => {
        const db = freshDb();
        const p1 = db.upsertProject({ ExternalId: "p1", Name: "P1" });
        const p2 = db.upsertProject({ ExternalId: "p2", Name: "P2" });
        const g = db.createGroup({ ProjectId: p1, ParentStepGroupId: null, Name: "Owned" });

        const failure = asFailure(await runGroup({
            db, projectId: p2, rootGroupId: g, executeLeafStep: noopExecutor(),
        }));
        expect(failure.Reason).toBe("TargetNotInProject");
    });
});

describe("runGroup — disabled steps & leaf failures", () => {
    it("skips disabled steps without invoking the executor", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Mixed" });
        const s1 = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "On" });
        const s2 = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "Off" });
        db.raw.exec(`UPDATE Step SET IsDisabled = 1 WHERE StepId = ${s2};`);

        const log: Array<{ id: number; path: ReadonlyArray<string> }> = [];
        const result = asSuccess(await runGroup({
            db, projectId, rootGroupId: g, executeLeafStep: recordingExecutor(log),
        }));

        expect(log.map(l => l.id)).toEqual([s1]);
        expect(result.StepsSkipped).toBe(1);
        expect(result.Trace.find(t => t.StepId === s2)?.Outcome).toBe("Skipped");
    });

    it("propagates a FailureReport returned by the executor unchanged", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Boom" });
        const failingId = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "X" });

        const fakeReport: FailureReport = {
            Phase: "Replay",
            Message: "no element matched",
            Reason: "ZeroMatches",
            ReasonDetail: "all 3 selectors returned 0",
            StackTrace: null,
            StepId: failingId,
            Index: 0,
            StepKind: "Click",
            Selectors: [],
            Variables: [],
            DomContext: null,
            DataRow: null,
            ResolvedXPath: null,
            Timestamp: "2026-04-26T00:00:00.000Z",
            SourceFile: "test",
            Verbose: false,
            CapturedHtml: null,
            FormSnapshot: null,
        };

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: g,
            executeLeafStep: () => fakeReport,
        }));

        expect(failure.Reason).toBe("LeafStepFailed");
        expect(failure.FailureReport).toBe(fakeReport); // identity — unchanged
        expect(failure.FailedStepId).toBe(failingId);
        expect(failure.CallStack).toEqual(["Boom"]);
        expect(failure.Trace.find(t => t.StepId === failingId)?.Outcome).toBe("Failed");
    });

    it("synthesizes a FailureReport when the executor throws raw", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Throwy" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "X" });

        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: g,
            executeLeafStep: () => { throw new Error("network died"); },
        }));

        expect(failure.Reason).toBe("LeafStepFailed");
        expect(failure.FailureReport).not.toBeNull();
        expect(failure.FailureReport!.Message).toBe("network died");
        expect(failure.FailureReport!.Reason).toBe("Unknown");
        // Schema parity with real reports — every required field present.
        expect(failure.FailureReport!.SourceFile).toContain("run-group-runner.ts");
        expect(failure.FailureReport!.Phase).toBe("Replay");
    });

    it("aborts subsequent steps after a leaf failure", async () => {
        const db = freshDb();
        const projectId = setupProject(db);
        const g = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Halt" });
        const s1 = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "First" });
        const s2 = db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "Boom" });
        db.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "NeverRun" });

        const seen: number[] = [];
        const failure = asFailure(await runGroup({
            db, projectId, rootGroupId: g,
            executeLeafStep: (step) => {
                seen.push(step.StepId);
                return step.StepId === s2 ? ({
                    Phase: "Replay", Message: "x", Reason: "Unknown", ReasonDetail: "x",
                    StackTrace: null, StepId: step.StepId, Index: step.OrderIndex, StepKind: "Click",
                    Selectors: [], Variables: [], DomContext: null, DataRow: null,
                    ResolvedXPath: null, Timestamp: "x", SourceFile: "t",
                    Verbose: false, CapturedHtml: null, FormSnapshot: null,
                } satisfies FailureReport) : null;
            },
        }));

        expect(seen).toEqual([s1, s2]); // third step never invoked
        expect(failure.Reason).toBe("LeafStepFailed");
    });
});
