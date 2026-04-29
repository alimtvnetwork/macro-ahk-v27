/**
 * Marco Extension — Keyword Events SQLite Bundle Export
 *
 * Packages a selected subset of {@link KeywordEvent}s into a real SQLite
 * database file (`keyword-events.db`) wrapped in a ZIP, using the same
 * conventions as the full `marco-backup.zip` pipeline:
 *
 *   • PascalCase table + column names.
 *   • `Id INTEGER PRIMARY KEY AUTOINCREMENT` with the runtime UUID stored
 *     in a separate `Uid TEXT` column for diff/merge.
 *   • A `Meta` table carrying `format_version`, `exported_at`, and a
 *     `bundle_kind = 'keyword-events'` marker so a future importer can
 *     distinguish a partial keyword-events export from a full bundle.
 *   • Steps and Tags are persisted as JSON columns on the parent row to
 *     keep the schema flat and the bundle trivially round-trippable
 *     (Steps are an ordered, type-tagged list; Tags is a flat string
 *     array — both already match the runtime shape).
 *
 * The full-backup contract in `sqlite-bundle-contract.ts` is unchanged on
 * purpose: that contract guards `marco-backup.zip` (Projects/Scripts/
 * Configs/Prompts/Meta). Partial keyword-event bundles are a separate
 * shape identified by `Meta.bundle_kind`.
 *
 * Companion JSON snapshot (`keyword-events.json`) is also included in the
 * ZIP so the bundle remains readable without sql.js — useful for diffs,
 * code review, and the existing JSON importer roadmap item.
 */

import initSqlJs, { type Database } from "sql.js";
import type JSZipType from "jszip";

import type { KeywordEvent } from "@/hooks/use-keyword-events";
import {
    buildExportFilename,
    buildExportPayload,
} from "@/lib/keyword-event-bulk-actions";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DB_FILENAME = "keyword-events.db";
const JSON_FILENAME = "keyword-events.json";
const WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm";
/** Format version for the keyword-events partial bundle. Bumped only when the
 *  on-disk shape (table list, column names) changes in a non-additive way. */
export const KEYWORD_EVENTS_FORMAT_VERSION = "1" as const;
/** Marker stored in `Meta.bundle_kind` so a future importer can branch
 *  between full backups and partial keyword-event bundles. */
export const KEYWORD_EVENTS_BUNDLE_KIND = "keyword-events" as const;

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const CREATE_KEYWORD_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS KeywordEvents (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Uid TEXT NOT NULL,
    Keyword TEXT NOT NULL,
    Description TEXT,
    Enabled INTEGER NOT NULL DEFAULT 1,
    Steps TEXT NOT NULL,
    Target TEXT,
    Tags TEXT,
    Category TEXT,
    PauseAfterMs INTEGER,
    SortOrder INTEGER NOT NULL DEFAULT 0,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
  );
`;

const CREATE_META_TABLE = `
  CREATE TABLE IF NOT EXISTS Meta (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Key TEXT UNIQUE NOT NULL,
    Value TEXT
  );
`;

/* ------------------------------------------------------------------ */
/*  sql.js plumbing                                                    */
/* ------------------------------------------------------------------ */

async function initDb(): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    return new SQL.Database();
}

/** Lazy JSZip loader — keeps the ~95 kB out of the recorder chunk. */
async function loadJSZip(): Promise<typeof JSZipType> {
    const mod = await import("jszip");
    return mod.default;
}

/* ------------------------------------------------------------------ */
/*  Builders                                                           */
/* ------------------------------------------------------------------ */

function insertKeywordEvents(
    db: Database,
    events: ReadonlyArray<KeywordEvent>,
    now: string,
): void {
    const stmt = db.prepare(`
        INSERT INTO KeywordEvents
            (Uid, Keyword, Description, Enabled, Steps, Target, Tags, Category,
             PauseAfterMs, SortOrder, CreatedAt, UpdatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    events.forEach((ev, i) => {
        stmt.run([
            ev.Id,
            ev.Keyword ?? "",
            ev.Description ?? null,
            ev.Enabled ? 1 : 0,
            JSON.stringify(ev.Steps ?? []),
            ev.Target === undefined ? null : JSON.stringify(ev.Target),
            ev.Tags === undefined ? null : JSON.stringify(ev.Tags),
            ev.Category !== undefined && ev.Category !== "" ? ev.Category : null,
            typeof ev.PauseAfterMs === "number" ? ev.PauseAfterMs : null,
            i,
            now,
            now,
        ]);
    });

    stmt.free();
}

function insertMeta(db: Database, count: number, now: string): void {
    db.run(`INSERT INTO Meta (Key, Value) VALUES ('format_version', ?)`, [
        KEYWORD_EVENTS_FORMAT_VERSION,
    ]);
    db.run(`INSERT INTO Meta (Key, Value) VALUES ('bundle_kind', ?)`, [
        KEYWORD_EVENTS_BUNDLE_KIND,
    ]);
    db.run(`INSERT INTO Meta (Key, Value) VALUES ('exported_at', ?)`, [now]);
    db.run(`INSERT INTO Meta (Key, Value) VALUES ('event_count', ?)`, [String(count)]);
}

/**
 * Progress stages reported during a keyword-events export. Linear, in
 * fire order — UIs can render a 4-step indicator without branching:
 *   1. discovery     — gathering selected events (caller-side)
 *   2. sqlite-build  — creating tables + INSERTing rows
 *   3. zip-bundle    — DEFLATE-compressing the .db + .json blob
 *   4. download      — Object URL created, anchor click dispatched
 *   5. done          — final terminal stage; UI can dismiss
 */
export type KeywordEventsExportStage =
    | "discovery"
    | "sqlite-build"
    | "zip-bundle"
    | "download"
    | "done";

export interface KeywordEventsExportProgress {
    readonly stage: KeywordEventsExportStage;
    /** 0..1 monotonically non-decreasing across the whole pipeline. */
    readonly fraction: number;
    /** Human-readable, ready to show in a toast or progress label. */
    readonly label: string;
    /** Total events being exported — included on every event so a UI
     *  can render "Building SQLite (12 events)…" without extra plumbing. */
    readonly eventCount: number;
}

export type KeywordEventsExportProgressFn = (p: KeywordEventsExportProgress) => void;

const STAGE_FRACTION: Record<KeywordEventsExportStage, number> = {
    "discovery": 0.05,
    "sqlite-build": 0.35,
    "zip-bundle": 0.75,
    "download": 0.95,
    "done": 1,
};

const STAGE_LABEL: Record<KeywordEventsExportStage, string> = {
    "discovery": "Collecting selected events",
    "sqlite-build": "Building SQLite database",
    "zip-bundle": "Compressing ZIP bundle",
    "download": "Starting download",
    "done": "Export complete",
};

function emitProgress(
    onProgress: KeywordEventsExportProgressFn | undefined,
    stage: KeywordEventsExportStage,
    eventCount: number,
): void {
    if (!onProgress) return;
    onProgress({
        stage,
        fraction: STAGE_FRACTION[stage],
        label: STAGE_LABEL[stage],
        eventCount,
    });
}

/**
 * Builds an in-memory SQLite database carrying the selected keyword events.
 * Exported separately from the zip pipeline so unit tests can assert on
 * the on-disk schema without touching the DOM/Blob layer.
 */
export async function buildKeywordEventsSqliteDb(
    events: ReadonlyArray<KeywordEvent>,
): Promise<Uint8Array> {
    const db = await initDb();
    const now = new Date().toISOString();
    try {
        db.run(CREATE_KEYWORD_EVENTS_TABLE);
        db.run(CREATE_META_TABLE);
        insertKeywordEvents(db, events, now);
        insertMeta(db, events.length, now);
        return db.export();
    } finally {
        db.close();
    }
}

export interface KeywordEventsZipResult {
    readonly blob: Blob;
    readonly filename: string;
}

/**
 * Builds a ZIP containing both the SQLite DB and a human-readable JSON
 * snapshot of the selected events. Returns the blob + suggested filename
 * so the caller controls when/how to trigger the download.
 *
 * Optional {@link onProgress} fires synchronously between stages —
 * `discovery` → `sqlite-build` → `zip-bundle` (then `download`/`done`
 * are emitted by {@link downloadKeywordEventsZip}).
 */
export async function buildKeywordEventsZip(
    events: ReadonlyArray<KeywordEvent>,
    onProgress?: KeywordEventsExportProgressFn,
): Promise<KeywordEventsZipResult> {
    emitProgress(onProgress, "discovery", events.length);

    emitProgress(onProgress, "sqlite-build", events.length);
    const [dbData, JSZipCtor] = await Promise.all([
        buildKeywordEventsSqliteDb(events),
        loadJSZip(),
    ]);

    emitProgress(onProgress, "zip-bundle", events.length);
    const zip = new JSZipCtor();
    zip.file(DB_FILENAME, dbData);
    zip.file(
        JSON_FILENAME,
        JSON.stringify(buildExportPayload(events), null, 2),
    );

    const blob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
    });
    return { blob, filename: buildExportFilename() };
}

/**
 * Convenience wrapper: builds the zip and triggers a browser download.
 * Returns the blob + filename so callers can also surface the result
 * (e.g. to a toast or post-export confirmation).
 *
 * Reports progress through all 5 stages when {@link onProgress} given.
 */
export async function downloadKeywordEventsZip(
    events: ReadonlyArray<KeywordEvent>,
    onProgress?: KeywordEventsExportProgressFn,
): Promise<KeywordEventsZipResult> {
    const result = await buildKeywordEventsZip(events, onProgress);
    emitProgress(onProgress, "download", events.length);
    await triggerDownload(result.blob, result.filename);
    emitProgress(onProgress, "done", events.length);
    return result;
}

/**
 * Verifies the produced blob is a real ZIP (PKZIP local-file-header
 * `50 4B 03 04`) before attaching it to the anchor click — guards against
 * a JSON payload accidentally being routed through the ZIP download path.
 */
async function assertIsZipBlob(blob: Blob, context: string): Promise<void> {
    if (blob.size < 4) {
        throw new Error(
            `${context}: produced blob is ${blob.size} bytes — too small to be a valid ZIP. `
            + `Expected PKZIP signature 'PK\\x03\\x04'. Aborting download to avoid a corrupt file.`,
        );
    }
    const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    const ok = header[0] === 0x50 && header[1] === 0x4b
        && header[2] === 0x03 && header[3] === 0x04;
    if (ok) return;
    const looksLikeJson = header[0] === 0x7b || header[0] === 0x5b;
    const hex = Array.from(header)
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
    const hint = looksLikeJson
        ? "Payload looks like JSON, not a ZIP — the export was likely routed through the wrong serializer."
        : "First 4 bytes do not match the PKZIP local-file-header signature (50 4B 03 04).";
    throw new Error(
        `${context}: produced blob is not a valid ZIP. First bytes: [${hex}]. ${hint}`,
    );
}

async function triggerDownload(blob: Blob, filename: string): Promise<void> {
    await assertIsZipBlob(blob, `Export "${filename}"`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
