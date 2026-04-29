/**
 * reorder-archive.test.ts — covers the two CRUD additions used by the
 * tree-view panel: sibling reordering under a parent and archive flag.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";

import { StepLibraryDb } from "../db";

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

function freshDb(): { db: StepLibraryDb; projectId: number } {
    const db = new StepLibraryDb(new SQL.Database());
    const projectId = db.upsertProject({ ExternalId: "p", Name: "P" });
    return { db, projectId };
}

describe("StepLibraryDb.reorderGroups", () => {
    it("reorders root-level siblings and persists OrderIndex", () => {
        const { db, projectId } = freshDb();
        const a = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "A" });
        const b = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "B" });
        const c = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "C" });

        db.reorderGroups(projectId, null, [c, a, b]);

        const ordered = db.listGroups(projectId)
            .filter((g) => g.ParentStepGroupId === null)
            .sort((x, y) => x.OrderIndex - y.OrderIndex)
            .map((g) => g.StepGroupId);
        expect(ordered).toEqual([c, a, b]);
    });

    it("reorders nested children under a parent", () => {
        const { db, projectId } = freshDb();
        const parent = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "P" });
        const x = db.createGroup({ ProjectId: projectId, ParentStepGroupId: parent, Name: "X" });
        const y = db.createGroup({ ProjectId: projectId, ParentStepGroupId: parent, Name: "Y" });

        db.reorderGroups(projectId, parent, [y, x]);

        const ordered = db.listGroups(projectId)
            .filter((g) => g.ParentStepGroupId === parent)
            .sort((a, b) => a.OrderIndex - b.OrderIndex)
            .map((g) => g.StepGroupId);
        expect(ordered).toEqual([y, x]);
    });

    it("rejects ids that aren't children of the requested parent", () => {
        const { db, projectId } = freshDb();
        const root  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "R" });
        const other = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "O" });
        const child = db.createGroup({ ProjectId: projectId, ParentStepGroupId: root, Name: "C" });

        expect(() => db.reorderGroups(projectId, root, [child, other])).toThrow(/not a child/);
    });

    it("rejects partial lists that would leave OrderIndex holes", () => {
        const { db, projectId } = freshDb();
        const a = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "A" });
        db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "B" });

        expect(() => db.reorderGroups(projectId, null, [a])).toThrow(/expected 2/);
    });
});

describe("StepLibraryDb.setGroupArchived", () => {
    it("toggles IsArchived without touching siblings or descendants", () => {
        const { db, projectId } = freshDb();
        const parent = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "P" });
        const child  = db.createGroup({ ProjectId: projectId, ParentStepGroupId: parent, Name: "C" });
        const sibling = db.createGroup({ ProjectId: projectId, ParentStepGroupId: null, Name: "S" });

        db.setGroupArchived(parent, true);

        const all = db.listGroups(projectId);
        const find = (id: number) => all.find((g) => g.StepGroupId === id);
        expect(find(parent)?.IsArchived).toBe(true);
        expect(find(child)?.IsArchived).toBe(false);
        expect(find(sibling)?.IsArchived).toBe(false);

        db.setGroupArchived(parent, false);
        expect(db.listGroups(projectId).find((g) => g.StepGroupId === parent)?.IsArchived).toBe(false);
    });
});
