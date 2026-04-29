/**
 * Marco Extension — Field Binding Persistence
 *
 * Phase 08 — Macro Recorder.
 *
 * Inserts and lists rows in the per-project `FieldBinding` table. A binding
 * links a `Step` to one column of a `DataSource`. The schema enforces
 * `StepId UNIQUE`, so re-binding a step replaces the previous binding via
 * `INSERT OR REPLACE`.
 *
 * Cross-row validation (column must exist on the chosen DataSource) is
 * delegated to `validateFieldBinding` so the handler can raise a clean
 * error before any write.
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";

export interface PersistedFieldBinding {
    readonly FieldBindingId: number;
    readonly StepId: number;
    readonly DataSourceId: number;
    readonly ColumnName: string;
    readonly CreatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Throws when `columnName` is not in the persisted `Columns` JSON of the
 * given `DataSource`. Reads via the per-project DB so callers do not need
 * to pass the columns array.
 */
export async function validateFieldBinding(
    projectSlug: string,
    dataSourceId: number,
    columnName: string,
): Promise<void> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();
    const columns = readDataSourceColumns(db, dataSourceId);
    const exists = columns.includes(columnName);

    if (exists === false) {
        throw new Error(
            `FieldBinding rejected — column "${columnName}" not in DataSource ${dataSourceId}`,
        );
    }
}

function readDataSourceColumns(
    db: SqlJsDatabase,
    dataSourceId: number,
): ReadonlyArray<string> {
    const result = db.exec(
        "SELECT Columns FROM DataSource WHERE DataSourceId = ?",
        [dataSourceId],
    );
    const raw = result[0]?.values[0]?.[0];
    if (raw === undefined) {
        throw new Error(`DataSource ${dataSourceId} not found`);
    }
    return JSON.parse(raw as string) as ReadonlyArray<string>;
}

/* ------------------------------------------------------------------ */
/*  Insert (upsert by StepId)                                          */
/* ------------------------------------------------------------------ */

export async function upsertFieldBinding(
    projectSlug: string,
    stepId: number,
    dataSourceId: number,
    columnName: string,
): Promise<PersistedFieldBinding> {
    await validateFieldBinding(projectSlug, dataSourceId, columnName);

    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();

    db.run(
        `INSERT INTO FieldBinding (StepId, DataSourceId, ColumnName)
         VALUES (?, ?, ?)
         ON CONFLICT(StepId) DO UPDATE SET
             DataSourceId = excluded.DataSourceId,
             ColumnName   = excluded.ColumnName`,
        [stepId, dataSourceId, columnName],
    );

    mgr.markDirty();
    return readBindingByStep(db, stepId);
}

function readBindingByStep(
    db: SqlJsDatabase,
    stepId: number,
): PersistedFieldBinding {
    const result = db.exec(
        `SELECT FieldBindingId, StepId, DataSourceId, ColumnName, CreatedAt
         FROM FieldBinding
         WHERE StepId = ?`,
        [stepId],
    );
    const row = result[0]?.values[0];
    if (row === undefined) {
        throw new Error(`FieldBinding row missing for StepId ${stepId} after upsert`);
    }
    return rowToRecord(row);
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function listFieldBindings(
    projectSlug: string,
): Promise<ReadonlyArray<PersistedFieldBinding>> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();
    const result = db.exec(
        `SELECT FieldBindingId, StepId, DataSourceId, ColumnName, CreatedAt
         FROM FieldBinding
         ORDER BY FieldBindingId DESC`,
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToRecord);
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

export async function deleteFieldBinding(
    projectSlug: string,
    stepId: number,
): Promise<void> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();
    db.run("DELETE FROM FieldBinding WHERE StepId = ?", [stepId]);
    mgr.markDirty();
}

/* ------------------------------------------------------------------ */
/*  Mapping                                                            */
/* ------------------------------------------------------------------ */

function rowToRecord(row: ReadonlyArray<unknown>): PersistedFieldBinding {
    return {
        FieldBindingId: row[0] as number,
        StepId: row[1] as number,
        DataSourceId: row[2] as number,
        ColumnName: row[3] as string,
        CreatedAt: row[4] as string,
    };
}
