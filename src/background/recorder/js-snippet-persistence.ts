/**
 * Marco Extension — JsSnippet Library Persistence
 *
 * Phase 11 — Macro Recorder.
 *
 * CRUD against the `JsSnippet` table (per-project SQLite). Snippets are
 * reusable named bodies the user can attach to a `JsInline` step.
 *
 * Conventions:
 *   - PascalCase columns: `JsSnippetId`, `Name`, `Description`, `Body`,
 *     `CreatedAt`, `UpdatedAt`.
 *   - `Name` is UNIQUE; upsert routes via `INSERT ... ON CONFLICT(Name)`.
 *   - Body is validated through `validateJsBody` before insert/update so
 *     forbidden tokens never reach storage.
 *
 * @see spec/31-macro-recorder/11-inline-javascript-step.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";
import { validateJsBody } from "./js-step-sandbox";

export interface JsSnippetRow {
    readonly JsSnippetId: number;
    readonly Name: string;
    readonly Description: string;
    readonly Body: string;
    readonly CreatedAt: string;
    readonly UpdatedAt: string;
}

export interface JsSnippetDraft {
    readonly Name: string;
    readonly Description: string;
    readonly Body: string;
}

function rowToSnippet(values: ReadonlyArray<unknown>): JsSnippetRow {
    return {
        JsSnippetId: values[0] as number,
        Name: values[1] as string,
        Description: values[2] as string,
        Body: values[3] as string,
        CreatedAt: values[4] as string,
        UpdatedAt: values[5] as string,
    };
}

function readSnippetByName(
    db: SqlJsDatabase,
    name: string,
): JsSnippetRow {
    const result = db.exec(
        `SELECT JsSnippetId, Name, Description, Body, CreatedAt, UpdatedAt
         FROM JsSnippet WHERE Name = ?`,
        [name],
    );
    const values = result[0]?.values[0];
    if (!values) {
        throw new Error(`JsSnippet "${name}" not found after upsert`);
    }
    return rowToSnippet(values);
}

export function upsertJsSnippetRow(
    db: SqlJsDatabase,
    draft: JsSnippetDraft,
): JsSnippetRow {
    if (!draft.Name || draft.Name.trim().length === 0) {
        throw new Error("JsSnippet Name cannot be empty");
    }
    validateJsBody(draft.Body);

    db.run(
        `INSERT INTO JsSnippet (Name, Description, Body)
         VALUES (?, ?, ?)
         ON CONFLICT(Name) DO UPDATE SET
             Description = excluded.Description,
             Body        = excluded.Body,
             UpdatedAt   = datetime('now')`,
        [draft.Name, draft.Description, draft.Body],
    );
    return readSnippetByName(db, draft.Name);
}

export function listJsSnippetRows(
    db: SqlJsDatabase,
): ReadonlyArray<JsSnippetRow> {
    const result = db.exec(
        `SELECT JsSnippetId, Name, Description, Body, CreatedAt, UpdatedAt
         FROM JsSnippet ORDER BY Name ASC`,
    );
    return (result[0]?.values ?? []).map(rowToSnippet);
}

export function deleteJsSnippetRow(
    db: SqlJsDatabase,
    jsSnippetId: number,
): void {
    db.run("DELETE FROM JsSnippet WHERE JsSnippetId = ?", [jsSnippetId]);
}

/* ------------------------------------------------------------------ */
/*  Async facades                                                      */
/* ------------------------------------------------------------------ */

export async function upsertJsSnippet(
    projectSlug: string,
    draft: JsSnippetDraft,
): Promise<JsSnippetRow> {
    const mgr = await initProjectDb(projectSlug);
    const row = upsertJsSnippetRow(mgr.getDb(), draft);
    mgr.markDirty();
    return row;
}

export async function listJsSnippets(
    projectSlug: string,
): Promise<ReadonlyArray<JsSnippetRow>> {
    const mgr = await initProjectDb(projectSlug);
    return listJsSnippetRows(mgr.getDb());
}

export async function deleteJsSnippet(
    projectSlug: string,
    jsSnippetId: number,
): Promise<void> {
    const mgr = await initProjectDb(projectSlug);
    deleteJsSnippetRow(mgr.getDb(), jsSnippetId);
    mgr.markDirty();
}
