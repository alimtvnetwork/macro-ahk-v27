/**
 * Marco Extension — Project-Scoped Key-Value Handler (Issue 50)
 *
 * CRUD operations for ProjectKv table in logs.db.
 * All column names use PascalCase per database naming convention.
 *
 * Every entry point validates required fields via handler-guards before
 * issuing a SQLite bind, so missing payload fields surface as a clean
 * isOk:false response instead of a "tried to bind a value of an unknown
 * type (undefined)" crash inside sql.js.
 *
 * @see src/background/handlers/handler-guards.ts — input validation + safeBind
 * @see .lovable/memory/architecture/project-scoped-database.md — Project-scoped DB
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";
import type { MessageRequest } from "../../shared/messages";
import {
    bindOpt,
    missingFieldError,
    requireKey,
    requireProjectId,
    type HandlerErrorResponse,
} from "./handler-guards";

let dbManager: DbManager | null = null;

export function bindKvDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[kv] DbManager not bound");
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

export async function handleKvGet(
    msg: MessageRequest,
): Promise<{ value: string | null } | HandlerErrorResponse> {
    const raw = msg as MessageRequest & { projectId?: unknown; key?: unknown };
    const projectId = requireProjectId(raw.projectId);
    const key = requireKey(raw.key);
    if (!projectId) return missingFieldError("projectId", "kv:get");
    if (!key) return missingFieldError("key", "kv:get");

    const db = getDb();
    const result = db.exec(
        "SELECT Value FROM ProjectKv WHERE ProjectId = ? AND Key = ?",
        [projectId, key],
    );
    const value = result.length > 0 && result[0].values.length > 0
        ? String(result[0].values[0][0])
        : null;
    return { value };
}

export async function handleKvSet(
    msg: MessageRequest,
): Promise<{ isOk: true } | HandlerErrorResponse> {
    const raw = msg as MessageRequest & { projectId?: unknown; key?: unknown; value?: unknown };
    const projectId = requireProjectId(raw.projectId);
    const key = requireKey(raw.key);
    if (!projectId) return missingFieldError("projectId", "kv:set");
    if (!key) return missingFieldError("key", "kv:set");

    const value = raw.value;
    const stringified = typeof value === "string" ? value : JSON.stringify(value ?? null);

    const db = getDb();
    db.run(
        `INSERT OR REPLACE INTO ProjectKv (ProjectId, Key, Value, UpdatedAt) VALUES (?, ?, ?, datetime('now'))`,
        [projectId, key, stringified],
    );
    markDirty();
    return { isOk: true };
}

export async function handleKvDelete(
    msg: MessageRequest,
): Promise<{ isOk: true } | HandlerErrorResponse> {
    const raw = msg as MessageRequest & { projectId?: unknown; key?: unknown };
    const projectId = requireProjectId(raw.projectId);
    const key = requireKey(raw.key);
    if (!projectId) return missingFieldError("projectId", "kv:delete");
    if (!key) return missingFieldError("key", "kv:delete");

    const db = getDb();
    db.run("DELETE FROM ProjectKv WHERE ProjectId = ? AND Key = ?", [projectId, key]);
    markDirty();
    return { isOk: true };
}

export async function handleKvList(
    msg: MessageRequest,
): Promise<{ entries: Array<{ key: string; value: string }> } | HandlerErrorResponse> {
    const raw = msg as MessageRequest & { projectId?: unknown };
    const projectId = requireProjectId(raw.projectId);
    if (!projectId) return missingFieldError("projectId", "kv:list");

    const db = getDb();
    const stmt = db.prepare(
        "SELECT Key, Value FROM ProjectKv WHERE ProjectId = ? ORDER BY Key ASC",
    );
    stmt.bind([projectId]);
    const entries: Array<{ key: string; value: string }> = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        entries.push({ key: String(row.Key), value: String(row.Value) });
    }
    stmt.free();
    return { entries };
}

// Touch unused helper to keep import surface stable for future opt fields.
void bindOpt;
