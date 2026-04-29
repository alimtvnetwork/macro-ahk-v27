/**
 * Phase 11 — Inline JavaScript Step sandbox + JsSnippet persistence tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import { RECORDER_DB_SCHEMA } from "../../recorder-db-schema";
import {
    validateJsBody,
    executeJsBody,
    JsValidationError,
    JsExecError,
} from "../js-step-sandbox";
import {
    upsertJsSnippetRow,
    listJsSnippetRows,
    deleteJsSnippetRow,
} from "../js-snippet-persistence";

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

/* ------------------------------------------------------------------ */
/*  validateJsBody — denylist                                          */
/* ------------------------------------------------------------------ */

describe("validateJsBody", () => {
    it("rejects empty bodies", () => {
        expect(() => validateJsBody("")).toThrow(JsValidationError);
        expect(() => validateJsBody("   ")).toThrow(JsValidationError);
    });

    it("rejects oversize bodies", () => {
        const big = "x".repeat(4001);
        expect(() => validateJsBody(big)).toThrow(/4000-char/);
    });

    it.each([
        ["eval('1')", /eval/],
        ["new Function('a','b')", /Function/],
        ["window.alert(1)", /window/],
        ["document.body", /document/],
        ["globalThis.foo", /globalThis/],
        ["chrome.runtime.id", /chrome/],
        ["process.env.X", /process/],
        ["import('x')", /import/],
        ["require('x')", /require/],
    ])("rejects forbidden token in %s", (body) => {
        expect(() => validateJsBody(body)).toThrow(JsValidationError);
    });

    it("accepts a valid expression body", () => {
        expect(() => validateJsBody("return Ctx.Row.Name.toUpperCase();")).not.toThrow();
    });
});

/* ------------------------------------------------------------------ */
/*  executeJsBody — sandbox semantics                                  */
/* ------------------------------------------------------------------ */

describe("executeJsBody", () => {
    it("returns the value the body returns", async () => {
        const out = await executeJsBody("return Ctx.Row.Name + '!';", {
            Row: { Name: "Ada" },
            Vars: {},
        });
        expect(out.ReturnValue).toBe("Ada!");
        expect(out.LogLines).toEqual([]);
        expect(out.DurationMs).toBeGreaterThanOrEqual(0);
    });

    it("captures Log() calls into LogLines", async () => {
        const out = await executeJsBody(
            "Log('hello'); Log('world'); return 42;",
            { Row: null, Vars: {} },
        );
        expect(out.ReturnValue).toBe(42);
        expect(out.LogLines).toEqual(["hello", "world"]);
    });

    it("freezes Ctx.Row so bodies cannot mutate it", async () => {
        await expect(
            executeJsBody("Ctx.Row.Name = 'Bob'; return 1;", {
                Row: { Name: "Ada" },
                Vars: {},
            }),
        ).rejects.toThrow(JsExecError);
    });

    it("supports async bodies returning a Promise", async () => {
        const out = await executeJsBody(
            "return Promise.resolve(Ctx.Vars.Token);",
            { Row: null, Vars: { Token: "abc" } },
        );
        expect(out.ReturnValue).toBe("abc");
    });

    it("wraps thrown errors as JsExecError", async () => {
        await expect(
            executeJsBody("throw new Error('boom');", { Row: null, Vars: {} }),
        ).rejects.toThrow(/boom/);
    });
});

/* ------------------------------------------------------------------ */
/*  JsSnippet persistence                                              */
/* ------------------------------------------------------------------ */

describe("JsSnippet persistence", () => {
    it("inserts a snippet and lists it", () => {
        const db = freshDb();
        const row = upsertJsSnippetRow(db, {
            Name: "TrimName",
            Description: "Trim Row.Name",
            Body: "return Ctx.Row.Name.trim();",
        });
        expect(row.Name).toBe("TrimName");
        expect(row.JsSnippetId).toBeGreaterThan(0);

        const all = listJsSnippetRows(db);
        expect(all).toHaveLength(1);
        expect(all[0].Body).toContain("trim()");
    });

    it("upserts (Name conflict) updates Body + Description", () => {
        const db = freshDb();
        upsertJsSnippetRow(db, {
            Name: "X",
            Description: "v1",
            Body: "return 1;",
        });
        const v2 = upsertJsSnippetRow(db, {
            Name: "X",
            Description: "v2",
            Body: "return 2;",
        });
        expect(v2.Description).toBe("v2");
        expect(v2.Body).toBe("return 2;");
        expect(listJsSnippetRows(db)).toHaveLength(1);
    });

    it("rejects forbidden-token bodies before insert", () => {
        const db = freshDb();
        expect(() =>
            upsertJsSnippetRow(db, {
                Name: "Bad",
                Description: "",
                Body: "eval('1')",
            }),
        ).toThrow(JsValidationError);
        expect(listJsSnippetRows(db)).toHaveLength(0);
    });

    it("deletes a snippet by id", () => {
        const db = freshDb();
        const row = upsertJsSnippetRow(db, {
            Name: "ToDelete",
            Description: "",
            Body: "return 1;",
        });
        deleteJsSnippetRow(db, row.JsSnippetId);
        expect(listJsSnippetRows(db)).toHaveLength(0);
    });
});
