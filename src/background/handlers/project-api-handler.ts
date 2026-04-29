/**
 * Marco Extension — Project API Handler
 *
 * Handles PROJECT_API messages for per-project SQLite database CRUD.
 * Supports: create, findMany, findUnique, update, delete, count,
 * plus schema management (createTable, dropTable, listTables).
 *
 * @see spec/05-chrome-extension/67-project-scoped-database-and-rest-api.md — Project DB & REST API
 * @see .lovable/memory/architecture/project-scoped-database.md — Project-scoped DB architecture
 * @see .lovable/memory/architecture/schema-meta-engine.md — Schema meta engine
 */

import {
    initProjectDb,
    getProjectDb,
    hasProjectDb,
    flushProjectDb,
} from "../project-db-manager";

import {
    queryCreate,
    queryFindMany,
    queryFindUnique,
    queryUpdate,
    queryDelete,
    queryCount,
    createUserTable,
    dropUserTable,
    listUserTables,
    type CreateArgs,
    type FindManyArgs,
    type FindUniqueArgs,
    type UpdateArgs,
    type DeleteArgs,
    type CountArgs,
    type ColumnDef,
} from "../project-query-builder";

import {
    missingFieldError,
    requireField,
    requireSlug,
} from "./handler-guards";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectApiMessage {
    type: string;
    project: string;       // slug
    method: string;        // GET | POST | PUT | DELETE | SCHEMA
    endpoint: string;      // table name or special command
    params?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function handleProjectApi(msg: ProjectApiMessage): Promise<Record<string, unknown>> {
    const m = msg as ProjectApiMessage;
    const slug = requireSlug(m.project);
    const endpoint = requireField(m.endpoint);
    const method = (typeof m.method === "string" && m.method.length > 0
        ? m.method : "GET").toUpperCase();
    const params = m.params || {};

    if (!slug) return { ...missingFieldError("project", "projectApi") };
    if (!endpoint) return { ...missingFieldError("endpoint", "projectApi") };

    // Ensure project DB is initialized
    if (!hasProjectDb(slug)) {
        await initProjectDb(slug);
    }

    const db = getProjectDb(slug);

    try {
        const result = await dispatchMethod(db, slug, method, endpoint, params);
        return { isOk: true, ...result };
    } catch (err) {
        return {
            isOk: false,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

/* ------------------------------------------------------------------ */
/*  Dispatch                                                           */
/* ------------------------------------------------------------------ */

async function dispatchMethod(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    method: string,
    endpoint: string,
    params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    // Schema management commands
    if (method === "SCHEMA") {
        return handleSchemaCommand(db, slug, endpoint, params);
    }

    // CRUD operations on user tables
    switch (method) {
        case "GET":
            return handleGet(db, endpoint, params);
        case "POST":
            return handlePost(db, slug, endpoint, params);
        case "PUT":
            return handlePut(db, slug, endpoint, params);
        case "DELETE":
            return handleDelete(db, slug, endpoint, params);
        default:
            throw new Error(`Unsupported method: ${method}`);
    }
}

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

function handleGet(
    db: ReturnType<typeof getProjectDb>,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const hasId = params.where && typeof params.where === "object" && "Id" in (params.where as Record<string, unknown>);

    if (hasId) {
        const row = queryFindUnique(db, table, { where: params.where as FindUniqueArgs["where"] });
        return { row };
    }

    if (params.count) {
        const count = queryCount(db, table, { where: params.where as CountArgs["where"] });
        return { count };
    }

    const rows = queryFindMany(db, table, {
        where: params.where as FindManyArgs["where"],
        orderBy: params.orderBy as FindManyArgs["orderBy"],
        take: params.take as number,
        skip: params.skip as number,
    });
    return { rows };
}

function handlePost(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const row = queryCreate(db, table, { data: params.data as CreateArgs["data"] });
    void markAndFlush(slug);
    return { row };
}

function handlePut(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const result = queryUpdate(db, table, {
        where: params.where as UpdateArgs["where"],
        data: params.data as UpdateArgs["data"],
    });
    void markAndFlush(slug);
    return { updated: result.count };
}

function handleDelete(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const result = queryDelete(db, table, {
        where: params.where as DeleteArgs["where"],
    });
    void markAndFlush(slug);
    return { deleted: result.count };
}

/* ------------------------------------------------------------------ */
/*  Schema commands                                                    */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- command dispatcher: one arm per schema verb; splitting would scatter the contract
function handleSchemaCommand(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    command: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    switch (command) {
        case "createTable": {
            const tableName = requireField(params.tableName);
            if (!tableName) throw new Error("createTable: missing or invalid 'tableName'");
            const columns = Array.isArray(params.columns) ? params.columns as ColumnDef[] : null;
            if (!columns || columns.length === 0) {
                throw new Error("createTable: missing or empty 'columns' array");
            }
            createUserTable(db, tableName, columns);
            void markAndFlush(slug);
            return { table: tableName };
        }
        case "dropTable": {
            const tableName = requireField(params.tableName);
            if (!tableName) throw new Error("dropTable: missing or invalid 'tableName'");
            dropUserTable(db, tableName);
            void markAndFlush(slug);
            return { dropped: tableName };
        }
        case "listTables": {
            const tables = listUserTables(db);
            return { tables };
        }
        case "rawSql": {
            const sql = requireField(params.sql);
            if (!sql) throw new Error("rawSql: missing or invalid 'sql' parameter");
            // Only allow ALTER TABLE statements for safety
            const trimmed = sql.trim().toUpperCase();
            if (!trimmed.startsWith("ALTER TABLE")) {
                throw new Error("rawSql: only ALTER TABLE statements are allowed");
            }
            db.run(sql);
            void markAndFlush(slug);
            return { executed: true };
        }
        default:
            throw new Error(`Unknown schema command: ${command}`);
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function markAndFlush(slug: string): Promise<void> {
    // Debounced flush via the project db manager
    const manager = await initProjectDb(slug);
    manager.markDirty();
}
