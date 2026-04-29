/**
 * Marco Extension — SQLite Bind Safety Layer (v2.165.0)
 *
 * Wraps a sql.js Database so every db.run / db.exec / db.prepare(...).bind()
 * call is intercepted by `assertBindable()` BEFORE parameters reach the
 * underlying WASM bridge.
 *
 * When ANY bind parameter is `undefined`, the wrapper throws a typed
 * {@link BindError} naming:
 *   - the field index (0-based, matches the `?` placeholder order)
 *   - the inferred column name (parsed from INSERT (col1, col2, …) VALUES …)
 *   - the SQL statement preview (first 120 chars)
 *
 * This replaces the cryptic sql.js native message:
 *   "Wrong API use : tried to bind a value of an unknown type (undefined)"
 *
 * with a precise, actionable diagnostic that pinpoints the exact column the
 * handler forgot to coerce via {@link bindOpt} or {@link bindReq}.
 *
 * @see src/background/handlers/handler-guards.ts — bindOpt / bindReq / safeBind
 * @see src/background/db-manager.ts              — wraps logs + errors DBs
 * @see src/background/project-db-manager.ts      — wraps per-project DBs
 */

import type { Database as SqlJsDatabase, Statement } from "sql.js";

/* ------------------------------------------------------------------ */
/*  BindError — precise, typed diagnostic                              */
/* ------------------------------------------------------------------ */

export class BindError extends Error {
    public readonly paramIndex: number;
    public readonly columnName: string;
    public readonly sqlPreview: string;

    constructor(paramIndex: number, columnName: string, sqlPreview: string) {
        super(
            `[SQLite BindError] param index ${paramIndex} (column "${columnName}") is undefined. ` +
            `Coerce to null via bindOpt() or supply a fallback via bindReq() before binding. ` +
            `SQL: ${sqlPreview}`,
        );
        this.name = "BindError";
        this.paramIndex = paramIndex;
        this.columnName = columnName;
        this.sqlPreview = sqlPreview;
    }
}

/* ------------------------------------------------------------------ */
/*  Column-name inference                                              */
/* ------------------------------------------------------------------ */

/**
 * Best-effort extraction of column names from a parameterised SQL statement.
 * Handles the common shapes used by Marco handlers:
 *   - INSERT INTO Foo (Col1, Col2, …) VALUES (?, ?, …)
 *   - INSERT OR REPLACE INTO Foo (Col1, Col2, …) VALUES (?, ?, …)
 *   - UPDATE Foo SET Col1 = ?, Col2 = ? WHERE Col3 = ?
 *   - SELECT … WHERE Col1 = ? AND Col2 = ?
 *   - DELETE FROM Foo WHERE Col1 = ?
 *
 * Returns an array sized to match the `?` placeholders in the SQL. Slots
 * that cannot be inferred fall back to `<param N>`.
 */
function inferColumnNames(sql: string): string[] {
    const placeholderCount = (sql.match(/\?/g) || []).length;
    const fallback = (i: number): string => `<param ${i}>`;
    const names: string[] = Array.from({ length: placeholderCount }, (_, i) => fallback(i));

    const insertMatch = sql.match(/INSERT(?:\s+OR\s+\w+)?\s+INTO\s+\w+\s*\(([^)]+)\)/i);
    if (insertMatch) {
        const cols = insertMatch[1].split(",").map((c) => c.trim());
        for (let i = 0; i < cols.length && i < names.length; i++) {
            names[i] = cols[i] || fallback(i);
        }
        return names;
    }

    // UPDATE / SELECT / DELETE — pull "Col = ?" pairs in source order.
    const setMatches = Array.from(sql.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|<|>|<=|>=|!=|LIKE)\s*\?/gi));
    for (let i = 0; i < setMatches.length && i < names.length; i++) {
        names[i] = setMatches[i][1];
    }

    return names;
}

function previewSql(sql: string): string {
    const flat = sql.replace(/\s+/g, " ").trim();
    return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

/* ------------------------------------------------------------------ */
/*  assertBindable — public guard                                      */
/* ------------------------------------------------------------------ */

/**
 * Validates that no entry in `params` is `undefined`. Throws {@link BindError}
 * with the offending index + column name (inferred from `sql`) on the first
 * failure. Returns the same params array unchanged on success so callers can
 * use it inline:
 *
 *   db.run(sql, assertBindable(sql, params));
 */
export function assertBindable<T extends ReadonlyArray<unknown>>(
    sql: string,
    params: T,
): T {
    if (!params || params.length === 0) return params;
    const columns = inferColumnNames(sql);
    for (let i = 0; i < params.length; i++) {
        if (params[i] === undefined) {
            const colName = columns[i] ?? `<param ${i}>`;
            throw new BindError(i, colName, previewSql(sql));
        }
    }
    return params;
}

/* ------------------------------------------------------------------ */
/*  wrapDatabaseWithBindSafety — Database proxy                        */
/* ------------------------------------------------------------------ */

type BindParams = Parameters<SqlJsDatabase["run"]>[1];

/**
 * Returns a Database proxy whose `run`, `exec`, and `prepare` methods route
 * every parameter array through {@link assertBindable} before delegating to
 * the underlying sql.js Database.
 *
 * Behaviour notes:
 *   - `db.exec(sql)` (no params) is forwarded untouched.
 *   - `db.exec(sql, params)` validates params before delegating.
 *   - `db.prepare(sql)` returns a Statement proxy; its `bind()` and `run()`
 *     methods validate params using the column names inferred from the
 *     prepared SQL.
 *   - All other methods (`close`, `export`, etc.) pass through to the
 *     underlying database via Proxy default behaviour.
 */
export function wrapDatabaseWithBindSafety(db: SqlJsDatabase): SqlJsDatabase {
    return new Proxy(db, {
        get(target, prop, receiver) {
            if (prop === "run") {
                return function wrappedRun(sql: string, params?: BindParams): SqlJsDatabase {
                    if (Array.isArray(params) && params.length > 0) {
                        assertBindable(sql, params as ReadonlyArray<unknown>);
                    }
                    target.run(sql, params);
                    return receiver as SqlJsDatabase;
                };
            }

            if (prop === "exec") {
                return function wrappedExec(sql: string, params?: BindParams) {
                    if (Array.isArray(params) && params.length > 0) {
                        assertBindable(sql, params as ReadonlyArray<unknown>);
                    }
                    // sql.js Database.exec accepts an optional params array even
                    // though our typings only declare the single-arg form.
                    return (target.exec as unknown as (s: string, p?: BindParams) => ReturnType<SqlJsDatabase["exec"]>)(sql, params);
                };
            }

            if (prop === "prepare") {
                return function wrappedPrepare(sql: string): Statement {
                    const stmt = target.prepare(sql);
                    return wrapStatementWithBindSafety(stmt, sql);
                };
            }

            return Reflect.get(target, prop, receiver);
        },
    });
}

function wrapStatementWithBindSafety(stmt: Statement, sql: string): Statement {
    return new Proxy(stmt, {
        get(target, prop, receiver) {
            if (prop === "bind") {
                return function wrappedBind(params?: BindParams): boolean {
                    if (Array.isArray(params) && params.length > 0) {
                        assertBindable(sql, params as ReadonlyArray<unknown>);
                    }
                    return target.bind(params);
                };
            }
            if (prop === "run") {
                return function wrappedStmtRun(params?: BindParams): void {
                    if (Array.isArray(params) && params.length > 0) {
                        assertBindable(sql, params as ReadonlyArray<unknown>);
                    }
                    target.run(params);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}
