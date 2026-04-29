/**
 * Marco Extension — Project-Scoped Database Manager
 *
 * Each project gets its own SQLite .db file named by slug.
 * Managed via OPFS (primary) or chrome.storage.local (fallback).
 * See spec/05-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "./sqljs-loader";
import { loadOrCreateFromOpfs, saveToOpfs, loadFromStorage } from "./db-persistence";
import { ensureMetaTables, META_TABLES_SCHEMA } from "./schema-meta-engine";
import { DEFAULT_PROJECT_DATABASES, type DefaultDatabaseDef } from "../types/default-databases";
import { wrapDatabaseWithBindSafety } from "./sqlite-bind-safety";
import { RECORDER_DB_SCHEMA, applyParamsJsonMigration, applyChainColumnsMigration } from "./recorder-db-schema";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SqlJs = import("sql.js").SqlJsStatic;
type PersistenceMode = "opfs" | "storage" | "memory";

export interface ProjectDbManager {
    getDb(): SqlJsDatabase;
    flush(): Promise<void>;
    drop(): Promise<void>;
    markDirty(): void;
}

/* ------------------------------------------------------------------ */
/*  ProjectSchema meta-table                                           */
/* ------------------------------------------------------------------ */

export const PROJECT_SCHEMA_TABLE = `
CREATE TABLE IF NOT EXISTS ProjectSchema (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    TableName    TEXT NOT NULL UNIQUE,
    ColumnDefs   TEXT NOT NULL,
    EndpointName TEXT,
    CreatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);
` + META_TABLES_SCHEMA;

/* ------------------------------------------------------------------ */
/*  Module state                                                       */
/* ------------------------------------------------------------------ */

let SQL: SqlJs | null = null;
const projectDbs = new Map<string, SqlJsDatabase>();
const dirtySet = new Set<string>();
// Tracks slugs whose Phase 14 chain-columns migration has already been applied
// in this background-worker lifetime. Prevents the cache-hit fast path from
// silently skipping the migration on cached DB handles (see initProjectDb).
const chainMigrationApplied = new Set<string>();
let persistenceMode: PersistenceMode = "memory";
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const FLUSH_DEBOUNCE_MS = 5000;

/* ------------------------------------------------------------------ */
/*  SQL.js loader                                                      */
/* ------------------------------------------------------------------ */

async function ensureSqlJs(): Promise<SqlJs> {
    if (SQL) return SQL;
    const wasmUrl = chrome.runtime.getURL("wasm/sql-wasm.wasm");
    let wasmResponse: Response;
    try {
        wasmResponse = await fetch(wasmUrl);
    } catch (err) {
        throw new Error(
            `Failed to fetch WASM binary at "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" exists in the extension dist folder. ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (!wasmResponse.ok) {
        throw new Error(
            `WASM fetch returned HTTP ${wasmResponse.status} for "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" is listed in manifest web_accessible_resources.`,
        );
    }
    const wasmBinary = await wasmResponse.arrayBuffer();
    SQL = await initSqlJs({ wasmBinary });
    return SQL;
}

/* ------------------------------------------------------------------ */
/*  DB file naming                                                     */
/* ------------------------------------------------------------------ */

function dbFileName(slug: string): string {
    return `project-${slug}.db`;
}

function storageKey(slug: string): string {
    return `sqlite_project_${slug}`;
}

/* ------------------------------------------------------------------ */
/*  Init / Load                                                        */
/* ------------------------------------------------------------------ */

export async function initProjectDb(slug: string, extraSchema?: string): Promise<ProjectDbManager> {
    const existing = projectDbs.get(slug);
    if (existing) {
        // Cache-hit fast path. The DB handle is already loaded, but we still
        // guarantee the Phase 14 chain-columns migration has run for this slug
        // in this worker lifetime. This guards against scenarios where the DB
        // was first opened by an early-boot caller (e.g. seeder) before the
        // recorder schema migrations were registered, or where the cache was
        // populated by a code path that bypassed initProjectDb's migration
        // block. The `chainMigrationApplied` set keeps this O(1) and idempotent
        // so repeated initProjectDb() calls remain effectively free.
        if (!chainMigrationApplied.has(slug)) {
            applyChainColumnsMigration(existing);
            chainMigrationApplied.add(slug);
        }
        return buildProjectManager(slug);
    }

    const sql = await ensureSqlJs();
    // Recorder schema is idempotent — applied to every project DB so that
    // recording steps have a guaranteed home from the moment a project exists.
    // See spec/31-macro-recorder/04-per-project-db-provisioning.md
    const schema = PROJECT_SCHEMA_TABLE + RECORDER_DB_SCHEMA + (extraSchema || "");

    const db = await tryLoadDb(sql, slug, schema);
    projectDbs.set(slug, db);

    // Spec 19.4 — ensure Step.ParamsJson exists on legacy DBs (no-op on fresh).
    applyParamsJsonMigration(db);
    // Phase 14 — ensure Step chain columns + StepTag exist on legacy DBs.
    applyChainColumnsMigration(db);
    chainMigrationApplied.add(slug);

    // Ensure default databases (KV, Meta) exist on every project init
    ensureDefaultDatabases(db, slug);

    return buildProjectManager(slug);
}

/* ------------------------------------------------------------------ */
/*  Default database bootstrapping                                     */
/* ------------------------------------------------------------------ */

/**
 * Converts a DefaultDatabaseDef column list into a CREATE TABLE IF NOT EXISTS
 * SQL statement and seeds the ProjectDatabases registry row.
 */
function ensureDefaultDatabases(db: SqlJsDatabase, slug: string): void { // eslint-disable-line sonarjs/cognitive-complexity -- nested try/catch for DDL + registry is inherent
    for (const def of DEFAULT_PROJECT_DATABASES) {
        // Create each table from the definition
        for (const tableDef of def.schema.tables) {
            const ddl = buildCreateTableSql(tableDef);
            try {
                db.run(ddl);
            } catch (err) {
                console.warn(
                    `[project-db] Failed to create default table "${tableDef.TableName}" ` +
                    `for project "${slug}": ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        }

        // Register in ProjectDatabases if that table exists
        try {
            const existing = db.exec(
                `SELECT COUNT(*) FROM ProjectDatabases WHERE DatabaseName = '${def.databaseName}'`,
            );
            const count = existing.length > 0 ? (existing[0].values[0][0] as number) : 0;
            if (count === 0) {
                db.run(
                    `INSERT INTO ProjectDatabases (DatabaseName, Namespace, DatabaseKindId, IsDefault, Description)
                     VALUES (?, 'default', ?, 1, ?)`,
                    [def.databaseName, def.databaseKindId, def.description],
                );
            }
        } catch { // allow-swallow: ProjectDatabases table may not exist yet if MetaTables schema hasn't run
            // ProjectDatabases table may not exist yet if MetaTables schema hasn't run
        }
    }

    console.log(`[project-db] Default databases ensured for project "${slug}"`);
}

/** Builds a CREATE TABLE IF NOT EXISTS statement from a table definition. */
function buildCreateTableSql(
    tableDef: DefaultDatabaseDef["schema"]["tables"][number],
): string {
    const cols = [
        "Id INTEGER PRIMARY KEY AUTOINCREMENT",
        ...tableDef.Columns.map((c) => {
            let col = `${c.Name} ${c.Type}`;
            if (!c.Nullable) col += " NOT NULL";
            if (c.Unique) col += " UNIQUE";
            if (c.Default !== undefined) col += ` DEFAULT ${c.Default}`;
            return col;
        }),
        "CreatedAt TEXT NOT NULL DEFAULT (datetime('now'))",
        "UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))",
    ];
    return `CREATE TABLE IF NOT EXISTS ${tableDef.TableName} (${cols.join(", ")});`;
}

async function tryLoadDb(sql: SqlJs, slug: string, schema: string): Promise<SqlJsDatabase> {
    // Try OPFS first
    try {
        const root = await navigator.storage.getDirectory();
        const db = await loadOrCreateFromOpfs(sql, root, dbFileName(slug), schema);
        persistenceMode = "opfs";
        console.log(`[project-db] OPFS: ${slug}`);
        return db;
    } catch { // allow-swallow: OPFS unavailable, falls through to chrome.storage
        // OPFS unavailable
    }

    // Try chrome.storage.local
    try {
        const db = await loadFromStorage(sql, storageKey(slug), schema);
        persistenceMode = "storage";
        console.log(`[project-db] storage: ${slug}`);
        return db;
    } catch { // allow-swallow: storage failed, falls through to in-memory db
        // storage failed
    }

    // In-memory fallback
    const db = new sql.Database();
    db.run(schema);
    persistenceMode = "memory";
    console.log(`[project-db] memory: ${slug}`);
    return db;
}

/* ------------------------------------------------------------------ */
/*  Get existing DB                                                    */
/* ------------------------------------------------------------------ */

export function getProjectDb(slug: string): SqlJsDatabase {
    const db = projectDbs.get(slug);
    if (!db) throw new Error(`[project-db] Not initialized: ${slug}`);
    return wrapDatabaseWithBindSafety(db);
}

export function hasProjectDb(slug: string): boolean {
    return projectDbs.has(slug);
}

/* ------------------------------------------------------------------ */
/*  Flush                                                              */
/* ------------------------------------------------------------------ */

export async function flushProjectDb(slug: string): Promise<void> {
    const db = projectDbs.get(slug);
    if (!db) return;

    if (persistenceMode === "opfs") {
        const root = await navigator.storage.getDirectory();
        await saveToOpfs(root, dbFileName(slug), db);
    } else if (persistenceMode === "storage") {
        await chrome.storage.local.set({
            [storageKey(slug)]: Array.from(db.export()),
        });
    }
    dirtySet.delete(slug);
}

function scheduleDirtyFlush(slug: string): void {
    dirtySet.add(slug);
    const existing = flushTimers.get(slug);
    if (existing) clearTimeout(existing);
    flushTimers.set(
        slug,
        setTimeout(() => void flushProjectDb(slug), FLUSH_DEBOUNCE_MS),
    );
}

/* ------------------------------------------------------------------ */
/*  Drop                                                               */
/* ------------------------------------------------------------------ */

export async function dropProjectDb(slug: string): Promise<void> {
    const db = projectDbs.get(slug);
    if (db) {
        db.close();
        projectDbs.delete(slug);
    }
    dirtySet.delete(slug);
    chainMigrationApplied.delete(slug);
    const timer = flushTimers.get(slug);
    if (timer) {
        clearTimeout(timer);
        flushTimers.delete(slug);
    }

    if (persistenceMode === "opfs") {
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry(dbFileName(slug));
        } catch { /* file may not exist */ } // allow-swallow: removeEntry is best-effort cleanup
    } else if (persistenceMode === "storage") {
        await chrome.storage.local.remove(storageKey(slug));
    }
    console.log(`[project-db] Dropped: ${slug}`);
}

/* ------------------------------------------------------------------ */
/*  Flush all dirty project DBs                                        */
/* ------------------------------------------------------------------ */

export async function flushAllProjectDbs(): Promise<void> {
    const slugs = Array.from(dirtySet);
    for (const slug of slugs) {
        await flushProjectDb(slug);
    }
}

/* ------------------------------------------------------------------ */
/*  Manager builder                                                    */
/* ------------------------------------------------------------------ */

function buildProjectManager(slug: string): ProjectDbManager {
    return {
        getDb: () => getProjectDb(slug),
        flush: () => flushProjectDb(slug),
        drop: () => dropProjectDb(slug),
        markDirty: () => scheduleDirtyFlush(slug),
    };
}
