/**
 * Regression tests — handler-guards missing-field contract
 *
 * Locks down the contract introduced in v2.164.0 (and audited in v2.167.0):
 * every SQLite-backed handler MUST validate required payload fields BEFORE
 * issuing a DB call. A missing field MUST surface as a clean
 *   { isOk: false, errorMessage: "[<op>] Missing or invalid '<field>' …" }
 * response — never as the cryptic sql.js
 *   "Wrong API use : tried to bind a value of an unknown type (undefined)".
 *
 * The strongest invariant under test: when a required field is missing, the
 * underlying SQLite Database is NEVER touched (no prepare/run/exec calls).
 * That is the property that makes the message-router crash spam disappear.
 *
 * Suites covered (mirrors v2.167.0 audit list):
 *   • kv-handler         — get / set / delete / list      (projectId, key)
 *   • grouped-kv-handler — get / set / delete             (group, key)
 *   • file-storage       — save / get / list / delete     (projectId, filename, fileId, dataBase64)
 *   • project-api        — handleProjectApi               (project, endpoint)
 *
 * @see src/background/handlers/handler-guards.ts
 * @see src/background/handlers/kv-handler.ts
 * @see src/background/handlers/grouped-kv-handler.ts
 * @see src/background/handlers/file-storage-handler.ts
 * @see src/background/handlers/project-api-handler.ts
 * @see .lovable/suggestions.md — "Vitest tests for handler-guards regression suite"
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Database as SqlJsDatabase } from "sql.js";

import {
    bindKvDbManager,
    handleKvGet,
    handleKvSet,
    handleKvDelete,
    handleKvList,
} from "@/background/handlers/kv-handler";
import {
    bindGroupedKvDbManager,
    handleGkvGet,
    handleGkvSet,
    handleGkvDelete,
} from "@/background/handlers/grouped-kv-handler";
import {
    bindFileStorageDbManager,
    handleFileSave,
    handleFileGet,
    handleFileList,
    handleFileDelete,
} from "@/background/handlers/file-storage-handler";
import { handleProjectApi } from "@/background/handlers/project-api-handler";

import type { DbManager } from "@/background/db-manager";
import type { MessageRequest } from "@/shared/messages";

/* ------------------------------------------------------------------ */
/*  Test double — call-tracking DbManager                              */
/* ------------------------------------------------------------------ */

interface DbCallLog {
    runs: Array<{ sql: string; params?: unknown }>;
    execs: Array<{ sql: string; params?: unknown }>;
    prepares: string[];
}

function makeFakeDb(log: DbCallLog): SqlJsDatabase {
    const db = {
        run: (sql: string, params?: unknown) => {
            log.runs.push({ sql, params });
            return db;
        },
        exec: (sql: string, params?: unknown) => {
            log.execs.push({ sql, params });
            return [] as ReturnType<SqlJsDatabase["exec"]>;
        },
        prepare: (sql: string) => {
            log.prepares.push(sql);
            // Returns a minimal Statement stub. Should never be reached in
            // missing-field tests — if it is, the assertion below catches it.
            return {
                bind: () => true,
                step: () => false,
                getAsObject: () => ({}),
                free: () => {},
                run: () => {},
            } as unknown as ReturnType<SqlJsDatabase["prepare"]>;
        },
    };
    return db as unknown as SqlJsDatabase;
}

function makeFakeDbManager(): { manager: DbManager; log: DbCallLog } {
    const log: DbCallLog = { runs: [], execs: [], prepares: [] };
    const fakeDb = makeFakeDb(log);
    const manager = {
        getLogsDb: () => fakeDb,
        markDirty: () => {},
    } as unknown as DbManager;
    return { manager, log };
}

function expectDbUntouched(log: DbCallLog, label: string): void {
    expect(log.runs, `${label}: db.run() must not be called`).toEqual([]);
    expect(log.execs, `${label}: db.exec() must not be called`).toEqual([]);
    expect(log.prepares, `${label}: db.prepare() must not be called`).toEqual([]);
}

interface ErrorShape { isOk: false; errorMessage: string }

function expectMissingFieldError(
    result: unknown,
    op: string,
    field: string,
): asserts result is ErrorShape {
    expect(result, `${op}: handler must return an object`).toBeTypeOf("object");
    const r = result as Partial<ErrorShape>;
    expect(r.isOk, `${op}: isOk must be false`).toBe(false);
    expect(r.errorMessage, `${op}: errorMessage must be a string`).toBeTypeOf("string");
    expect(r.errorMessage).toContain(`[${op}]`);
    expect(r.errorMessage).toContain(`'${field}'`);
}

/* ------------------------------------------------------------------ */
/*  Suite — kv-handler                                                  */
/* ------------------------------------------------------------------ */

describe("handler-guards — kv-handler missing-field contract", () => {
    let log: DbCallLog;

    beforeEach(() => {
        const fake = makeFakeDbManager();
        log = fake.log;
        bindKvDbManager(fake.manager);
    });

    it("handleKvGet — missing projectId returns clean error, no DB call", async () => {
        const result = await handleKvGet({ type: "KV_GET", key: "k" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:get", "projectId");
        expectDbUntouched(log, "handleKvGet missing projectId");
    });

    it("handleKvGet — missing key returns clean error, no DB call", async () => {
        const result = await handleKvGet({ type: "KV_GET", projectId: "p1" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:get", "key");
        expectDbUntouched(log, "handleKvGet missing key");
    });

    it("handleKvGet — empty-string projectId rejected (non-empty contract)", async () => {
        const result = await handleKvGet({ type: "KV_GET", projectId: "", key: "k" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:get", "projectId");
        expectDbUntouched(log, "handleKvGet empty projectId");
    });

    it("handleKvSet — missing projectId returns clean error, no DB write", async () => {
        const result = await handleKvSet({ type: "KV_SET", key: "k", value: "v" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:set", "projectId");
        expectDbUntouched(log, "handleKvSet missing projectId");
    });

    it("handleKvSet — missing key returns clean error, no DB write", async () => {
        const result = await handleKvSet({ type: "KV_SET", projectId: "p1", value: "v" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:set", "key");
        expectDbUntouched(log, "handleKvSet missing key");
    });

    it("handleKvDelete — missing projectId returns clean error, no DB delete", async () => {
        const result = await handleKvDelete({ type: "KV_DELETE", key: "k" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:delete", "projectId");
        expectDbUntouched(log, "handleKvDelete missing projectId");
    });

    it("handleKvDelete — missing key returns clean error, no DB delete", async () => {
        const result = await handleKvDelete({ type: "KV_DELETE", projectId: "p1" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:delete", "key");
        expectDbUntouched(log, "handleKvDelete missing key");
    });

    it("handleKvList — missing projectId returns clean error, no DB read", async () => {
        const result = await handleKvList({ type: "KV_LIST" } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:list", "projectId");
        expectDbUntouched(log, "handleKvList missing projectId");
    });

    it("handleKvList — non-string projectId (number) is rejected", async () => {
        const result = await handleKvList({ type: "KV_LIST", projectId: 42 } as unknown as MessageRequest);
        expectMissingFieldError(result, "kv:list", "projectId");
        expectDbUntouched(log, "handleKvList numeric projectId");
    });
});

/* ------------------------------------------------------------------ */
/*  Suite — grouped-kv-handler                                          */
/* ------------------------------------------------------------------ */

describe("handler-guards — grouped-kv-handler missing-field contract", () => {
    let log: DbCallLog;

    beforeEach(() => {
        const fake = makeFakeDbManager();
        log = fake.log;
        bindGroupedKvDbManager(fake.manager);
    });

    it("handleGkvGet — missing group returns clean error, no DB call", async () => {
        const result = await handleGkvGet({ type: "GKV_GET", key: "k" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:get", "group");
        expectDbUntouched(log, "handleGkvGet missing group");
    });

    it("handleGkvGet — missing key returns clean error, no DB call", async () => {
        const result = await handleGkvGet({ type: "GKV_GET", group: "g" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:get", "key");
        expectDbUntouched(log, "handleGkvGet missing key");
    });

    it("handleGkvSet — missing group returns clean error, no DB write", async () => {
        const result = await handleGkvSet({ type: "GKV_SET", key: "k", value: "v" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:set", "group");
        expectDbUntouched(log, "handleGkvSet missing group");
    });

    it("handleGkvSet — missing key returns clean error, no DB write", async () => {
        const result = await handleGkvSet({ type: "GKV_SET", group: "g", value: "v" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:set", "key");
        expectDbUntouched(log, "handleGkvSet missing key");
    });

    it("handleGkvSet — group order checked first (group reported when both missing)", async () => {
        const result = await handleGkvSet({ type: "GKV_SET", value: "v" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:set", "group");
        expectDbUntouched(log, "handleGkvSet both missing");
    });

    it("handleGkvDelete — missing group returns clean error, no DB delete", async () => {
        const result = await handleGkvDelete({ type: "GKV_DELETE", key: "k" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:delete", "group");
        expectDbUntouched(log, "handleGkvDelete missing group");
    });

    it("handleGkvDelete — missing key returns clean error, no DB delete", async () => {
        const result = await handleGkvDelete({ type: "GKV_DELETE", group: "g" } as unknown as MessageRequest);
        expectMissingFieldError(result, "gkv:delete", "key");
        expectDbUntouched(log, "handleGkvDelete missing key");
    });
});

/* ------------------------------------------------------------------ */
/*  Suite — file-storage-handler                                        */
/* ------------------------------------------------------------------ */

describe("handler-guards — file-storage-handler missing-field contract", () => {
    let log: DbCallLog;

    beforeEach(() => {
        const fake = makeFakeDbManager();
        log = fake.log;
        bindFileStorageDbManager(fake.manager);
    });

    it("handleFileSave — missing projectId returns clean error, no DB write", async () => {
        const result = await handleFileSave({
            type: "FILE_SAVE",
            filename: "a.txt",
            dataBase64: "ZGF0YQ==",
        } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:save", "projectId");
        expectDbUntouched(log, "handleFileSave missing projectId");
    });

    it("handleFileSave — missing filename returns clean error, no DB write", async () => {
        const result = await handleFileSave({
            type: "FILE_SAVE",
            projectId: "p1",
            dataBase64: "ZGF0YQ==",
        } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:save", "filename");
        expectDbUntouched(log, "handleFileSave missing filename");
    });

    it("handleFileSave — missing dataBase64 returns clean error, no DB write", async () => {
        const result = await handleFileSave({
            type: "FILE_SAVE",
            projectId: "p1",
            filename: "a.txt",
        } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:save", "dataBase64");
        expectDbUntouched(log, "handleFileSave missing dataBase64");
    });

    it("handleFileSave — non-string dataBase64 (object) rejected", async () => {
        const result = await handleFileSave({
            type: "FILE_SAVE",
            projectId: "p1",
            filename: "a.txt",
            dataBase64: { not: "a string" },
        } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:save", "dataBase64");
        expectDbUntouched(log, "handleFileSave non-string dataBase64");
    });

    it("handleFileGet — missing fileId returns clean error, no DB read", async () => {
        const result = await handleFileGet({ type: "FILE_GET" } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:get", "fileId");
        expectDbUntouched(log, "handleFileGet missing fileId");
    });

    it("handleFileList — missing projectId returns clean error, no DB read", async () => {
        const result = await handleFileList({ type: "FILE_LIST" } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:list", "projectId");
        expectDbUntouched(log, "handleFileList missing projectId");
    });

    it("handleFileDelete — missing fileId returns clean error, no DB delete", async () => {
        const result = await handleFileDelete({ type: "FILE_DELETE" } as unknown as MessageRequest);
        expectMissingFieldError(result, "file:delete", "fileId");
        expectDbUntouched(log, "handleFileDelete missing fileId");
    });
});

/* ------------------------------------------------------------------ */
/*  Suite — project-api-handler                                         */
/* ------------------------------------------------------------------ */

describe("handler-guards — project-api-handler missing-field contract", () => {
    // No DB binding needed: guard fires before initProjectDb / getProjectDb.
    // If the guard ever regressed, those would throw and surface as a
    // different test failure (no DbManager bound) — still useful signal.

    it("handleProjectApi — missing project (slug) returns clean error", async () => {
        const result = await handleProjectApi({
            type: "PROJECT_API",
            method: "GET",
            endpoint: "Users",
        } as unknown as Parameters<typeof handleProjectApi>[0]);
        const r = result as Partial<ErrorShape>;
        expect(r.isOk).toBe(false);
        expect(r.errorMessage).toBeTypeOf("string");
        expect(r.errorMessage).toContain("[projectApi]");
        expect(r.errorMessage).toContain("'project'");
    });

    it("handleProjectApi — missing endpoint returns clean error", async () => {
        const result = await handleProjectApi({
            type: "PROJECT_API",
            project: "my-app",
            method: "GET",
        } as unknown as Parameters<typeof handleProjectApi>[0]);
        const r = result as Partial<ErrorShape>;
        expect(r.isOk).toBe(false);
        expect(r.errorMessage).toBeTypeOf("string");
        expect(r.errorMessage).toContain("[projectApi]");
        expect(r.errorMessage).toContain("'endpoint'");
    });

    it("handleProjectApi — empty-string project rejected", async () => {
        const result = await handleProjectApi({
            type: "PROJECT_API",
            project: "",
            method: "GET",
            endpoint: "Users",
        } as unknown as Parameters<typeof handleProjectApi>[0]);
        const r = result as Partial<ErrorShape>;
        expect(r.isOk).toBe(false);
        expect(r.errorMessage).toContain("'project'");
    });

    it("handleProjectApi — empty-string endpoint rejected", async () => {
        const result = await handleProjectApi({
            type: "PROJECT_API",
            project: "my-app",
            method: "GET",
            endpoint: "",
        } as unknown as Parameters<typeof handleProjectApi>[0]);
        const r = result as Partial<ErrorShape>;
        expect(r.isOk).toBe(false);
        expect(r.errorMessage).toContain("'endpoint'");
    });
});
