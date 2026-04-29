/**
 * Regression tests — SQLite bind-safety layer
 *
 * Locks down the contract for `assertBindable`, `BindError`, and
 * `wrapDatabaseWithBindSafety` (Proxy interception of run/exec/prepare).
 *
 * Background: prior to v2.165.0, undefined parameters reaching sql.js produced
 * the cryptic message "Wrong API use : tried to bind a value of an unknown
 * type (undefined)". The bind-safety layer replaces that with a typed
 * `BindError` carrying the param index, inferred column name, and SQL preview.
 * This suite ensures:
 *   1. BindError exposes the documented public fields.
 *   2. Column-name inference works across INSERT / UPDATE / SELECT / DELETE.
 *   3. The Database Proxy intercepts run/exec/prepare and throws BEFORE
 *      delegating to the underlying handle.
 *   4. The Statement Proxy intercepts bind() and run() the same way.
 *   5. Pass-through behaviour is preserved for valid params and untouched
 *      methods (close, export, etc.).
 *
 * @see src/background/sqlite-bind-safety.ts
 * @see spec/22-app-issues/  (handler-guards / BindError remediation track)
 */

import { describe, it, expect, vi } from "vitest";
import type { Database as SqlJsDatabase, Statement } from "sql.js";
import {
    assertBindable,
    BindError,
    wrapDatabaseWithBindSafety,
} from "@/background/sqlite-bind-safety";

/* ------------------------------------------------------------------ */
/*  Test doubles — minimal sql.js Database / Statement stand-ins       */
/* ------------------------------------------------------------------ */

interface StubDatabase extends Pick<SqlJsDatabase, "run" | "exec" | "prepare" | "close" | "export"> {
    runCalls: Array<{ sql: string; params?: unknown }>;
    execCalls: Array<{ sql: string; params?: unknown }>;
    prepareCalls: string[];
}

interface StubStatement extends Pick<Statement, "bind" | "run" | "free" | "step"> {
    bindCalls: Array<unknown>;
    runCalls: Array<unknown>;
}

function makeStubStatement(): StubStatement {
    const stmt = {
        bindCalls: [] as Array<unknown>,
        runCalls: [] as Array<unknown>,
        bind(params?: unknown) {
            stmt.bindCalls.push(params);
            return true;
        },
        run(params?: unknown) {
            stmt.runCalls.push(params);
        },
        free() { return true; },
        step() { return false; },
    } as unknown as StubStatement;
    return stmt;
}

function makeStubDatabase(stmt: StubStatement = makeStubStatement()): StubDatabase {
    const db = {
        runCalls: [] as Array<{ sql: string; params?: unknown }>,
        execCalls: [] as Array<{ sql: string; params?: unknown }>,
        prepareCalls: [] as string[],
        run(sql: string, params?: unknown) {
            db.runCalls.push({ sql, params });
            return db as unknown as SqlJsDatabase;
        },
        exec(sql: string, params?: unknown) {
            db.execCalls.push({ sql, params });
            return [] as unknown as ReturnType<SqlJsDatabase["exec"]>;
        },
        prepare(sql: string) {
            db.prepareCalls.push(sql);
            return stmt as unknown as Statement;
        },
        close() { /* no-op */ },
        export() { return new Uint8Array(); },
    } as unknown as StubDatabase;
    return db;
}

/* ------------------------------------------------------------------ */
/*  1. BindError shape                                                 */
/* ------------------------------------------------------------------ */

describe("BindError", () => {
    it("exposes paramIndex, columnName, and sqlPreview as public fields", () => {
        const err = new BindError(2, "UpdatedAt", "INSERT INTO Foo (A, B, UpdatedAt) VALUES (?, ?, ?)");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(BindError);
        expect(err.name).toBe("BindError");
        expect(err.paramIndex).toBe(2);
        expect(err.columnName).toBe("UpdatedAt");
        expect(err.sqlPreview).toContain("INSERT INTO Foo");
    });

    it("includes actionable remediation guidance in the message", () => {
        const err = new BindError(0, "ProjectId", "UPDATE X SET ProjectId = ?");
        expect(err.message).toContain("param index 0");
        expect(err.message).toContain('column "ProjectId"');
        expect(err.message).toContain("bindOpt()");
        expect(err.message).toContain("bindReq()");
    });
});

/* ------------------------------------------------------------------ */
/*  2. assertBindable — column-name inference across SQL shapes        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- test suite: each `it` block is self-contained; describe arrow is grouping only
describe("assertBindable — column-name inference", () => {
    it("returns params unchanged when nothing is undefined", () => {
        const params = ["a", 1, null, true] as const;
        const result = assertBindable("INSERT INTO Foo (A, B, C, D) VALUES (?, ?, ?, ?)", params);
        expect(result).toBe(params);
    });

    it("returns params unchanged for empty arrays", () => {
        const empty: readonly unknown[] = [];
        expect(assertBindable("SELECT 1", empty)).toBe(empty);
    });

    it("infers column from INSERT INTO Foo (Col1, Col2, ...) VALUES (?, ?, ...)", () => {
        const sql = "INSERT INTO Projects (ProjectId, Name, CreatedAt) VALUES (?, ?, ?)";
        try {
            assertBindable(sql, ["p1", undefined, Date.now()]);
            expect.fail("expected BindError");
        } catch (err) {
            expect(err).toBeInstanceOf(BindError);
            expect((err as BindError).paramIndex).toBe(1);
            expect((err as BindError).columnName).toBe("Name");
        }
    });

    it("infers column from INSERT OR REPLACE INTO ... (a, b) VALUES (?, ?)", () => {
        const sql = "INSERT OR REPLACE INTO Settings (Key, Value) VALUES (?, ?)";
        const thrown = (() => {
            try { assertBindable(sql, ["k", undefined]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown).toBeInstanceOf(BindError);
        expect(thrown!.columnName).toBe("Value");
        expect(thrown!.paramIndex).toBe(1);
    });

    it("infers column from UPDATE Foo SET Col = ?, Col2 = ? WHERE Id = ?", () => {
        const sql = "UPDATE Projects SET Name = ?, UpdatedAt = ? WHERE ProjectId = ?";
        const thrown = (() => {
            try { assertBindable(sql, ["new-name", undefined, "p1"]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown).toBeInstanceOf(BindError);
        expect(thrown!.columnName).toBe("UpdatedAt");
        expect(thrown!.paramIndex).toBe(1);
    });

    it("infers column from SELECT ... WHERE Col = ? AND Col2 = ?", () => {
        const sql = "SELECT * FROM Projects WHERE ProjectId = ? AND IsActive = ?";
        const thrown = (() => {
            try { assertBindable(sql, ["p1", undefined]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown).toBeInstanceOf(BindError);
        expect(thrown!.columnName).toBe("IsActive");
    });

    it("infers column from DELETE FROM Foo WHERE Col = ?", () => {
        const sql = "DELETE FROM Cache WHERE CacheKey = ?";
        const thrown = (() => {
            try { assertBindable(sql, [undefined]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown).toBeInstanceOf(BindError);
        expect(thrown!.columnName).toBe("CacheKey");
        expect(thrown!.paramIndex).toBe(0);
    });

    it("falls back to <param N> when SQL shape is unrecognised", () => {
        const sql = "SOME_NON_STANDARD_OP ? ? ?";
        const thrown = (() => {
            try { assertBindable(sql, [1, undefined, 3]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown).toBeInstanceOf(BindError);
        expect(thrown!.columnName).toBe("<param 1>");
    });

    it("throws on the FIRST undefined param even when later params are also undefined", () => {
        const sql = "INSERT INTO Foo (A, B, C) VALUES (?, ?, ?)";
        const thrown = (() => {
            try { assertBindable(sql, [undefined, undefined, undefined]); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown!.paramIndex).toBe(0);
        expect(thrown!.columnName).toBe("A");
    });

    it("truncates very long SQL previews to ~120 chars", () => {
        const longSql = "INSERT INTO Foo (" + Array.from({ length: 50 }, (_, i) => `Col${i}`).join(", ") + ") VALUES (" + "?, ".repeat(49) + "?)";
        const params = Array.from({ length: 50 }, (_, i) => i === 25 ? undefined : i);
        const thrown = (() => {
            try { assertBindable(longSql, params); return null; }
            catch (e) { return e as BindError; }
        })();
        expect(thrown!.sqlPreview.length).toBeLessThanOrEqual(120);
        expect(thrown!.sqlPreview).toMatch(/\.\.\.$/);
    });

    it("treats null as a valid bind value (only undefined is rejected)", () => {
        // eslint-disable-next-line sonarjs/no-duplicate-string -- SQL literal naturally repeats across `it` blocks; extracting a constant would obscure each test's intent
        const sql = "INSERT INTO Foo (A, B) VALUES (?, ?)";
        expect(() => assertBindable(sql, ["x", null])).not.toThrow();
    });
});

/* ------------------------------------------------------------------ */
/*  3. wrapDatabaseWithBindSafety — Database Proxy interception        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- test suite: each `it` block is self-contained; describe arrow is grouping only
describe("wrapDatabaseWithBindSafety — Database Proxy", () => {
    it("intercepts db.run() and throws BindError BEFORE delegating", () => {
        const stub = makeStubDatabase();
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        expect(() =>
            safe.run("INSERT INTO Foo (A, B) VALUES (?, ?)", ["x", undefined as unknown as string]),
        ).toThrow(BindError);

        expect(stub.runCalls).toHaveLength(0);
    });

    it("delegates db.run() with valid params and returns the wrapper", () => {
        const stub = makeStubDatabase();
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        const result = safe.run("INSERT INTO Foo (A, B) VALUES (?, ?)", ["x", "y"]);
        expect(stub.runCalls).toHaveLength(1);
        expect(stub.runCalls[0].params).toEqual(["x", "y"]);
        expect(result).toBe(safe);
    });

    it("intercepts db.exec(sql, params) and throws BindError BEFORE delegating", () => {
        const stub = makeStubDatabase();
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        const execWithParams = safe.exec as unknown as (s: string, p: unknown[]) => unknown;
        expect(() =>
            execWithParams("UPDATE Foo SET A = ? WHERE B = ?", [undefined, 1]),
        ).toThrow(BindError);

        expect(stub.execCalls).toHaveLength(0);
    });

    it("forwards db.exec(sql) without params untouched", () => {
        const stub = makeStubDatabase();
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        safe.exec("PRAGMA journal_mode = WAL");
        expect(stub.execCalls).toHaveLength(1);
        expect(stub.execCalls[0].sql).toBe("PRAGMA journal_mode = WAL");
    });

    it("returns a Statement proxy from db.prepare() that intercepts .bind()", () => {
        const stmt = makeStubStatement();
        const stub = makeStubDatabase(stmt);
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        const prepared = safe.prepare("INSERT INTO Foo (A, B) VALUES (?, ?)");
        expect(stub.prepareCalls).toEqual(["INSERT INTO Foo (A, B) VALUES (?, ?)"]);

        expect(() => prepared.bind(["x", undefined as unknown as string])).toThrow(BindError);
        expect(stmt.bindCalls).toHaveLength(0);

        const ok = prepared.bind(["x", "y"]);
        expect(ok).toBe(true);
        expect(stmt.bindCalls).toEqual([["x", "y"]]);
    });

    it("returns a Statement proxy from db.prepare() that intercepts .run()", () => {
        const stmt = makeStubStatement();
        const stub = makeStubDatabase(stmt);
        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);

        const prepared = safe.prepare("UPDATE Foo SET A = ? WHERE B = ?");

        expect(() =>
            (prepared.run as (p: unknown[]) => void)([undefined, 1]),
        ).toThrow(BindError);
        expect(stmt.runCalls).toHaveLength(0);

        (prepared.run as (p: unknown[]) => void)(["new-a", 1]);
        expect(stmt.runCalls).toEqual([["new-a", 1]]);
    });

    it("passes through untouched methods (close, export) via Proxy default", () => {
        const stub = makeStubDatabase();
        const closeSpy = vi.spyOn(stub, "close");
        const exportSpy = vi.spyOn(stub, "export");

        const safe = wrapDatabaseWithBindSafety(stub as unknown as SqlJsDatabase);
        safe.close();
        const exported = safe.export();

        expect(closeSpy).toHaveBeenCalledOnce();
        expect(exportSpy).toHaveBeenCalledOnce();
        expect(exported).toBeInstanceOf(Uint8Array);
    });
});
