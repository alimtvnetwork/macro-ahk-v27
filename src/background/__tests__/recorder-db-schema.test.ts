/**
 * Recorder DB Schema — unit tests
 *
 * Verifies the per-project recorder schema:
 *  - applies cleanly on a fresh DB
 *  - is idempotent (safe to re-run on existing DB)
 *  - seeds the four lookup tables with the documented reference rows
 *  - enforces the documented FK + CHECK constraints
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs from "sql.js";
import {
    RECORDER_DB_SCHEMA,
    SelectorKindId,
    StepKindId,
    StepStatusId,
    DataSourceKindId,
} from "../recorder-db-schema";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({
        locateFile: (file) => `node_modules/sql.js/dist/${file}`,
    });
});

function freshDb() {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    db.run(RECORDER_DB_SCHEMA);
    return db;
}

function rowCount(db: ReturnType<typeof freshDb>, table: string): number {
    const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
    return result[0].values[0][0] as number;
}

describe("RECORDER_DB_SCHEMA", () => {
    it("creates all 12 tables on a fresh DB", () => {
        const db = freshDb();
        const result = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        );
        const names = result[0].values.map((r) => r[0]);
        expect(names).toEqual([
            "DataSource",
            "DataSourceKind",
            "FieldBinding",
            "JsSnippet",
            "ReplayRun",
            "ReplayStepResult",
            "Selector",
            "SelectorKind",
            "Step",
            "StepKind",
            "StepStatus",
            "StepTag",
        ]);
    });

    it("seeds lookup tables with the documented reference rows", () => {
        const db = freshDb();
        expect(rowCount(db, "DataSourceKind")).toBe(2);
        expect(rowCount(db, "SelectorKind")).toBe(4);
        expect(rowCount(db, "StepKind")).toBe(6);
        expect(rowCount(db, "StepStatus")).toBe(3);
    });

    it("is idempotent — re-applying does not duplicate seed rows", () => {
        const db = freshDb();
        db.run(RECORDER_DB_SCHEMA);
        db.run(RECORDER_DB_SCHEMA);
        expect(rowCount(db, "SelectorKind")).toBe(4);
        expect(rowCount(db, "StepKind")).toBe(6);
    });

    it("seeds StepKind 9 = UrlTabClick (Spec 19.4)", () => {
        const db = freshDb();
        const r = db.exec("SELECT Name FROM StepKind WHERE StepKindId = 9");
        expect(r[0].values[0][0]).toBe("UrlTabClick");
        expect(StepKindId.UrlTabClick).toBe(9);
    });

    it("code enums match seeded lookup IDs", () => {
        const db = freshDb();
        const kinds = db.exec("SELECT Name, SelectorKindId FROM SelectorKind");
        const map = Object.fromEntries(kinds[0].values.map((r) => [r[0], r[1]]));
        expect(map.XPathFull).toBe(SelectorKindId.XPathFull);
        expect(map.XPathRelative).toBe(SelectorKindId.XPathRelative);
        expect(map.Css).toBe(SelectorKindId.Css);
        expect(map.Aria).toBe(SelectorKindId.Aria);
    });

    it("rejects InlineJs on non-JsInline steps via CHECK constraint", () => {
        const db = freshDb();
        expect(() =>
            db.run(
                `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label, InlineJs)
                 VALUES (?, 1, 'X', 'L', 'doStuff()')`,
                [StepKindId.Click],
            ),
        ).toThrow();
        expect(() =>
            db.run(
                `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label, InlineJs)
                 VALUES (?, 1, 'X', 'L', 'doStuff()')`,
                [StepKindId.JsInline],
            ),
        ).not.toThrow();
    });

    it("enforces unique VariableName per project DB", () => {
        const db = freshDb();
        db.run(
            `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label)
             VALUES (?, 1, 'EmailField', 'Email')`,
            [StepKindId.Type],
        );
        expect(() =>
            db.run(
                `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label)
                 VALUES (?, 2, 'EmailField', 'Email 2')`,
                [StepKindId.Type],
            ),
        ).toThrow();
    });

    it("cascades Selector deletion when its Step is deleted", () => {
        const db = freshDb();
        db.run(
            `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label)
             VALUES (?, 1, 'Btn', 'Submit')`,
            [StepKindId.Click],
        );
        db.run(
            `INSERT INTO Selector (StepId, SelectorKindId, Expression, IsPrimary)
             VALUES (1, ?, '//button', 1)`,
            [SelectorKindId.XPathFull],
        );
        expect(rowCount(db, "Selector")).toBe(1);
        db.run("DELETE FROM Step WHERE StepId = 1");
        expect(rowCount(db, "Selector")).toBe(0);
    });

    it("defaults a new Step to StepStatus = Draft", () => {
        const db = freshDb();
        db.run(
            `INSERT INTO Step (StepKindId, OrderIndex, VariableName, Label)
             VALUES (?, 1, 'X', 'L')`,
            [StepKindId.Click],
        );
        const result = db.exec("SELECT StepStatusId FROM Step WHERE StepId = 1");
        expect(result[0].values[0][0]).toBe(StepStatusId.Draft);
    });

    it("DataSourceKindId enum mirrors the seeded rows", () => {
        const db = freshDb();
        const result = db.exec("SELECT Name, DataSourceKindId FROM DataSourceKind");
        const map = Object.fromEntries(result[0].values.map((r) => [r[0], r[1]]));
        expect(map.Csv).toBe(DataSourceKindId.Csv);
        expect(map.Json).toBe(DataSourceKindId.Json);
    });
});
