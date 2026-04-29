/**
 * Marco Extension — Recorder Data Source Persistence
 *
 * Phase 07 — Macro Recorder.
 *
 * Inserts and lists rows in the per-project `DataSource` table created by
 * `recorder-db-schema.ts`. The DB instance is acquired via
 * `initProjectDb(slug)` so each project's recordings stay isolated.
 *
 * `Columns` is stored as a JSON-encoded string array (fits the `TEXT` column
 * declared in the schema and round-trips deterministically).
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";
import type { ParsedDataSource } from "./data-source-parsers";

export interface PersistedDataSource {
    readonly DataSourceId: number;
    readonly DataSourceKindId: number;
    readonly FilePath: string;
    readonly Columns: ReadonlyArray<string>;
    readonly RowCount: number;
    readonly CreatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Insert                                                             */
/* ------------------------------------------------------------------ */

export async function insertDataSource(
    projectSlug: string,
    filePath: string,
    parsed: ParsedDataSource,
): Promise<PersistedDataSource> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();

    db.run(
        `INSERT INTO DataSource (DataSourceKindId, FilePath, Columns, RowCount)
         VALUES (?, ?, ?, ?)`,
        [
            parsed.DataSourceKindId,
            filePath,
            JSON.stringify(parsed.Columns),
            parsed.RowCount,
        ],
    );

    mgr.markDirty();
    return readLatestRow(db, filePath);
}

function readLatestRow(
    db: SqlJsDatabase,
    filePath: string,
): PersistedDataSource {
    const result = db.exec(
        `SELECT DataSourceId, DataSourceKindId, FilePath, Columns, RowCount, CreatedAt
         FROM DataSource
         WHERE FilePath = ?
         ORDER BY DataSourceId DESC
         LIMIT 1`,
        [filePath],
    );

    const row = result[0]?.values[0];
    if (row === undefined) {
        throw new Error(`DataSource row missing for "${filePath}" after insert`);
    }

    return rowToRecord(row);
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function listDataSources(
    projectSlug: string,
): Promise<ReadonlyArray<PersistedDataSource>> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();

    const result = db.exec(
        `SELECT DataSourceId, DataSourceKindId, FilePath, Columns, RowCount, CreatedAt
         FROM DataSource
         ORDER BY DataSourceId DESC`,
    );

    const values = result[0]?.values ?? [];
    return values.map(rowToRecord);
}

/* ------------------------------------------------------------------ */
/*  Mapping                                                            */
/* ------------------------------------------------------------------ */

function rowToRecord(row: ReadonlyArray<unknown>): PersistedDataSource {
    const columnsRaw = row[3] as string;
    const columns = JSON.parse(columnsRaw) as ReadonlyArray<string>;

    return {
        DataSourceId: row[0] as number,
        DataSourceKindId: row[1] as number,
        FilePath: row[2] as string,
        Columns: columns,
        RowCount: row[4] as number,
        CreatedAt: row[5] as string,
    };
}
