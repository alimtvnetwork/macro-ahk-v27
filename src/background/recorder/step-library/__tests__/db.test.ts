/**
 * Step Library DB unit tests — schema invariants + CRUD round-trip.
 *
 * Verifies §5 + §9 acceptance criteria of
 * `spec/31-macro-recorder/16-step-group-library.md`:
 *
 *   AC-1: schema applies cleanly; PRAGMA integrity_check = 'ok'.
 *   AC-2: hierarchy invariants (self-parent, cross-project parent,
 *         depth >= 9 all rejected by triggers).
 *   AC-3: RunGroup step CHECK + same-project trigger fire correctly.
 *   AC-7: round-trip serialise → load preserves all rows.
 *
 * Runs in Node — sql.js loads WASM via `locateFile` from the local
 * package install (no network).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { StepLibraryDb } from "../db";
import {
    applySchema,
    StepKindId,
    STEP_LIBRARY_SCHEMA_VERSION,
    MAX_GROUP_NESTING_DEPTH,
    readUserVersion,
} from "../schema";

let SQL: SqlJsStatic;

beforeAll(async () => {
    const wasmPath = resolve(__dirname, "../../../../../node_modules/sql.js/dist/sql-wasm.wasm");
    const wasmBinary = readFileSync(wasmPath);
    // sql.js accepts either `wasmBinary` (ArrayBuffer) or `locateFile`.
    SQL = await initSqlJs({ wasmBinary: wasmBinary.buffer.slice(
        wasmBinary.byteOffset,
        wasmBinary.byteOffset + wasmBinary.byteLength,
    ) });
});

function freshDb(): { db: Database; lib: StepLibraryDb; projectId: number } {
    const db = new SQL.Database();
    const lib = new StepLibraryDb(db);
    const projectId = lib.upsertProject({
        ExternalId: "00000000-0000-0000-0000-000000000001",
        Name: "Test Project",
    });
    return { db, lib, projectId };
}

/* ================================================================== */
/*  AC-1 — schema integrity                                           */
/* ================================================================== */

describe("schema — applySchema", () => {
    it("creates all tables, sets PRAGMA user_version, integrity_check passes", () => {
        const db = new SQL.Database();
        applySchema(db);
        expect(readUserVersion(db)).toBe(STEP_LIBRARY_SCHEMA_VERSION);

        const integrity = db.exec("PRAGMA integrity_check;");
        expect(integrity[0].values[0][0]).toBe("ok");

        const tables = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
        )[0].values.map((r) => r[0]);
        expect(tables).toEqual(expect.arrayContaining([
            "Project", "StepGroup", "StepKind", "Step", "SchemaMigration",
        ]));
    });

    it("is idempotent — calling twice does not error or duplicate seeds", () => {
        const db = new SQL.Database();
        applySchema(db);
        applySchema(db);
        const kindCount = db.exec("SELECT COUNT(*) FROM StepKind;")[0].values[0][0];
        expect(kindCount).toBe(7); // Click..Hotkey
    });

    it("seeds the RunGroup StepKind row with id=6", () => {
        const db = new SQL.Database();
        applySchema(db);
        const row = db.exec("SELECT Name FROM StepKind WHERE StepKindId = 6;")[0];
        expect(row.values[0][0]).toBe("RunGroup");
    });

    it("rejects opening a DB whose user_version is newer than this build", () => {
        const db = new SQL.Database();
        db.exec(`PRAGMA user_version = ${STEP_LIBRARY_SCHEMA_VERSION + 1};`);
        expect(() => applySchema(db)).toThrow(/newer extension/i);
    });
});

/* ================================================================== */
/*  AC-2 — hierarchy invariants                                       */
/* ================================================================== */

describe("StepGroup hierarchy invariants", () => {
    it("rejects a group whose parent is itself (insert)", () => {
        const { db, lib, projectId } = freshDb();
        const id = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "root" });
        expect(() => db.exec(
            `UPDATE StepGroup SET ParentStepGroupId = StepGroupId WHERE StepGroupId = ${id};`,
        )).toThrow(/cannot be its own parent/i);
    });

    it("rejects cross-project parent", () => {
        const { lib, projectId } = freshDb();
        const otherProjectId = lib.upsertProject({
            ExternalId: "00000000-0000-0000-0000-000000000002",
            Name: "Other",
        });
        const otherRoot = lib.createGroup({
            ProjectId: otherProjectId, ParentStepGroupId: null, Name: "other-root",
        });
        expect(() => lib.createGroup({
            ProjectId: projectId, ParentStepGroupId: otherRoot, Name: "wrong-parent",
        })).toThrow(/same Project/i);
    });

    it(`rejects nesting depth >= ${MAX_GROUP_NESTING_DEPTH + 1}`, () => {
        const { lib, projectId } = freshDb();
        let parent: number | null = null;
        // depth 1 .. MAX is allowed; the (MAX+1)th must throw.
        for (let depth = 1; depth <= MAX_GROUP_NESTING_DEPTH; depth++) {
            parent = lib.createGroup({
                ProjectId: projectId, ParentStepGroupId: parent, Name: `g${depth}`,
            });
        }
        expect(() => lib.createGroup({
            ProjectId: projectId, ParentStepGroupId: parent, Name: "too-deep",
        })).toThrow(/MaxNestingDepthExceeded/);
    });

    it("rejects sibling-name collision (case-insensitive)", () => {
        const { lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "Login" });
        lib.createGroup({ ProjectId: projectId, ParentStepGroupId: root, Name: "Email" });
        expect(() => lib.createGroup({
            ProjectId: projectId, ParentStepGroupId: root, Name: "EMAIL",
        })).toThrow(/UNIQUE/i);
    });

    it("allows same name under different parents", () => {
        const { lib, projectId } = freshDb();
        const a = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "A" });
        const b = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "B" });
        expect(() => {
            lib.createGroup({ ProjectId: projectId, ParentStepGroupId: a, Name: "child" });
            lib.createGroup({ ProjectId: projectId, ParentStepGroupId: b, Name: "child" });
        }).not.toThrow();
    });
});

/* ================================================================== */
/*  AC-3 — RunGroup step constraints                                  */
/* ================================================================== */

describe("Step — RunGroup invariants", () => {
    it("rejects RunGroup step with NULL TargetStepGroupId (JS guard)", () => {
        const { lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        expect(() => lib.appendStep({
            StepGroupId: root,
            StepKindId: StepKindId.RunGroup,
        })).toThrow(/RunGroup requires TargetStepGroupId/);
    });

    it("rejects non-RunGroup step that supplies a TargetStepGroupId (JS guard)", () => {
        const { lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        const target = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "t" });
        expect(() => lib.appendStep({
            StepGroupId: root,
            StepKindId: StepKindId.Click,
            TargetStepGroupId: target,
        })).toThrow(/only valid when StepKind=RunGroup/);
    });

    it("CHECK constraint catches direct INSERT bypassing JS guard", () => {
        const { db, lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        // RunGroup with NULL target via raw SQL.
        expect(() => db.exec(
            `INSERT INTO Step (StepGroupId, OrderIndex, StepKindId, TargetStepGroupId)
             VALUES (${root}, 0, ${StepKindId.RunGroup}, NULL);`,
        )).toThrow(/CHECK/i);
    });

    it("trigger rejects cross-project RunGroup target", () => {
        const { lib, projectId } = freshDb();
        const callerRoot = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "caller" });
        const otherProjectId = lib.upsertProject({
            ExternalId: "00000000-0000-0000-0000-000000000003",
            Name: "Other",
        });
        const otherTarget = lib.createGroup({
            ProjectId: otherProjectId, ParentStepGroupId: null, Name: "other-target",
        });
        expect(() => lib.appendStep({
            StepGroupId: callerRoot,
            StepKindId: StepKindId.RunGroup,
            TargetStepGroupId: otherTarget,
        })).toThrow(/same Project/i);
    });

    it("accepts a valid same-project RunGroup step and round-trips it", () => {
        const { lib, projectId } = freshDb();
        const caller = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "caller" });
        const target = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "target" });
        const stepId = lib.appendStep({
            StepGroupId: caller,
            StepKindId: StepKindId.RunGroup,
            Label: "Call target",
            TargetStepGroupId: target,
        });
        const [row] = lib.listSteps(caller);
        expect(row.StepId).toBe(stepId);
        expect(row.StepKindId).toBe(StepKindId.RunGroup);
        expect(row.TargetStepGroupId).toBe(target);
        expect(row.Label).toBe("Call target");
    });
});

/* ================================================================== */
/*  CRUD basics + AC-7 round-trip                                     */
/* ================================================================== */

describe("Step / StepGroup CRUD", () => {
    it("appends steps with auto-incrementing OrderIndex", () => {
        const { lib, projectId } = freshDb();
        const g = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        const a = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click });
        const b = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Type });
        const c = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Wait });
        const orders = lib.listSteps(g).map((s) => s.OrderIndex);
        expect(orders).toEqual([0, 1, 2]);
        expect(lib.listSteps(g).map((s) => s.StepId)).toEqual([a, b, c]);
    });

    it("reorderSteps rewrites OrderIndex according to caller list", () => {
        const { lib, projectId } = freshDb();
        const g = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        const a = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click });
        const b = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Type });
        const c = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Wait });
        lib.reorderSteps(g, [c, a, b]);
        expect(lib.listSteps(g).map((s) => s.StepId)).toEqual([c, a, b]);
    });

    it("reorderSteps rejects mixed-group IDs", () => {
        const { lib, projectId } = freshDb();
        const g1 = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g1" });
        const g2 = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g2" });
        const a = lib.appendStep({ StepGroupId: g1, StepKindId: StepKindId.Click });
        const b = lib.appendStep({ StepGroupId: g2, StepKindId: StepKindId.Click });
        expect(() => lib.reorderSteps(g1, [a, b])).toThrow(/does not belong/);
    });

    it("updateStep edits Label, PayloadJson, and Kind in place (preserves OrderIndex)", () => {
        const { lib, projectId } = freshDb();
        const g = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        const a = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click, Label: "old" });
        lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Type });
        const beforeOrder = lib.listSteps(g).find((s) => s.StepId === a)?.OrderIndex;
        lib.updateStep({
            StepId: a,
            StepKindId: StepKindId.Type,
            Label: "new",
            PayloadJson: '{"Selector":"#x","Value":"y"}',
        });
        const row = lib.listSteps(g).find((s) => s.StepId === a)!;
        expect(row.Label).toBe("new");
        expect(row.StepKindId).toBe(StepKindId.Type);
        expect(row.PayloadJson).toBe('{"Selector":"#x","Value":"y"}');
        expect(row.OrderIndex).toBe(beforeOrder);
    });

    it("updateStep enforces RunGroup ↔ TargetStepGroupId invariant", () => {
        const { lib, projectId } = freshDb();
        const g = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "g" });
        const target = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "t" });
        const s = lib.appendStep({ StepGroupId: g, StepKindId: StepKindId.Click });
        // RunGroup without target => throws
        expect(() => lib.updateStep({
            StepId: s, StepKindId: StepKindId.RunGroup, TargetStepGroupId: null,
        })).toThrow(/RunGroup requires TargetStepGroupId/);
        // Non-RunGroup with target => throws
        expect(() => lib.updateStep({
            StepId: s, StepKindId: StepKindId.Click, TargetStepGroupId: target,
        })).toThrow(/only valid when StepKind=RunGroup/);
        // Valid RunGroup edit succeeds
        lib.updateStep({
            StepId: s, StepKindId: StepKindId.RunGroup, TargetStepGroupId: target,
        });
        const row = lib.listSteps(g).find((r) => r.StepId === s)!;
        expect(row.StepKindId).toBe(StepKindId.RunGroup);
        expect(row.TargetStepGroupId).toBe(target);
    });

    it("deleteGroup cascades to children and steps", () => {
        const { lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "root" });
        const child = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: root, Name: "child" });
        lib.appendStep({ StepGroupId: child, StepKindId: StepKindId.Click });
        lib.deleteGroup(root);
        expect(lib.listGroups(projectId)).toEqual([]);
        expect(lib.listSteps(child)).toEqual([]);
    });

    it("export → reload preserves projects, groups, and steps verbatim", () => {
        const { lib, projectId } = freshDb();
        const root = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "root" });
        const child = lib.createGroup({ ProjectId: projectId, ParentStepGroupId: root, Name: "child" });
        lib.appendStep({ StepGroupId: root, StepKindId: StepKindId.Click, Label: "click" });
        lib.appendStep({ StepGroupId: child, StepKindId: StepKindId.Type, Label: "type" });

        const bytes = lib.exportDbBytes();
        const reopened = new StepLibraryDb(new SQL.Database(bytes));
        const projects = reopened.listProjects();
        expect(projects).toHaveLength(1);
        const groups = reopened.listGroups(projects[0].ProjectId);
        expect(groups.map((g) => g.Name)).toEqual(["root", "child"]);
        const rootGroup = groups.find((g) => g.Name === "root")!;
        const childGroup = groups.find((g) => g.Name === "child")!;
        expect(reopened.listSteps(rootGroup.StepGroupId).map((s) => s.Label))
            .toEqual(["click"]);
        expect(reopened.listSteps(childGroup.StepGroupId).map((s) => s.Label))
            .toEqual(["type"]);
    });
});
