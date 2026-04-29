/**
 * Marco Extension — Keyword Events SQLite Bundle Import
 *
 * Reads a `keyword-events.zip` produced by `keyword-events-sqlite-export.ts`
 * and returns a typed list of {@link KeywordEvent}-shaped patches.
 *
 * Shape contract (matches the exporter):
 *   • ZIP contains `keyword-events.db` (real SQLite via sql.js) and an
 *     optional `keyword-events.json` snapshot. We trust the .db as source
 *     of truth; JSON is only used as a fallback when sql.js fails to load.
 *   • `KeywordEvents` table columns: Uid, Keyword, Description, Enabled,
 *     Steps (JSON), Target (JSON|null), Tags (JSON|null), Category,
 *     PauseAfterMs, SortOrder, CreatedAt, UpdatedAt.
 *   • `Meta.bundle_kind = 'keyword-events'` MUST be present — otherwise we
 *     reject the file rather than guessing at a full-backup bundle.
 *
 * The importer returns *parsed records*, never mutates any state itself —
 * the caller (KeywordEventBulkContextMenu) decides which selected events
 * to overlay and via which key (Uid first, Keyword fallback).
 */

import initSqlJs, { type Database } from "sql.js";
import type JSZipType from "jszip";

import type {
    KeywordEvent,
    KeywordEventStep,
    KeywordEventTarget,
} from "@/hooks/use-keyword-events";
import {
    KEYWORD_EVENTS_BUNDLE_KIND,
} from "@/lib/keyword-events-sqlite-export";

const DB_FILENAME = "keyword-events.db";
const WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm";

/** Tables that MUST be present in a valid keyword-events bundle. Missing
 *  any one of these means the .db is either a different bundle kind
 *  (e.g. full-backup, prompts) or a corrupted export. */
const REQUIRED_TABLES = ["Meta", "KeywordEvents"] as const;

/** Columns that MUST exist on KeywordEvents for the importer's SELECT * to
 *  return a usable row. Forward-compat: extras are allowed, only these are
 *  required. */
const REQUIRED_KEYWORD_EVENTS_COLUMNS = [
    "Uid", "Keyword", "Steps", "SortOrder",
] as const;

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

/** A single parsed row from the imported keyword-events.db. Shape mirrors
 *  KeywordEvent but every field is optional except Uid + Keyword so partial
 *  bundles round-trip cleanly. */
export interface ImportedKeywordEvent {
    readonly Uid: string;
    readonly Keyword: string;
    readonly Description?: string;
    readonly Enabled?: boolean;
    readonly Steps?: readonly KeywordEventStep[];
    readonly Target?: KeywordEventTarget;
    readonly Tags?: readonly string[];
    readonly Category?: string;
    readonly PauseAfterMs?: number;
}

export interface KeywordEventsImportResult {
    readonly bundleKind: string;
    readonly formatVersion: string | null;
    readonly exportedAt: string | null;
    readonly events: readonly ImportedKeywordEvent[];
}

/* ------------------------------------------------------------------ */
/*  sql.js + JSZip plumbing                                            */
/* ------------------------------------------------------------------ */

async function initDb(data: Uint8Array): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    return new SQL.Database(data);
}

async function loadJSZip(): Promise<typeof JSZipType> {
    const mod = await import("jszip");
    return mod.default;
}

/* ------------------------------------------------------------------ */
/*  Parsers                                                            */
/* ------------------------------------------------------------------ */

function parseJsonField<T>(raw: unknown): T | undefined {
    if (typeof raw !== "string" || raw.length === 0) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}

function rowToEvent(row: Record<string, unknown>): ImportedKeywordEvent | null {
    const uid = typeof row.Uid === "string" ? row.Uid : null;
    const keyword = typeof row.Keyword === "string" ? row.Keyword : null;
    if (!uid || !keyword) return null;

    const description = typeof row.Description === "string" ? row.Description : undefined;
    const enabled = row.Enabled === undefined || row.Enabled === null
        ? undefined
        : Number(row.Enabled) !== 0;
    const steps = parseJsonField<readonly KeywordEventStep[]>(row.Steps);
    const target = parseJsonField<KeywordEventTarget>(row.Target);
    const tags = parseJsonField<readonly string[]>(row.Tags);
    const category = typeof row.Category === "string" && row.Category.length > 0
        ? row.Category
        : undefined;
    const pauseAfterMs = typeof row.PauseAfterMs === "number"
        ? row.PauseAfterMs
        : undefined;

    return {
        Uid: uid,
        Keyword: keyword,
        ...(description !== undefined && { Description: description }),
        ...(enabled !== undefined && { Enabled: enabled }),
        ...(steps !== undefined && { Steps: steps }),
        ...(target !== undefined && { Target: target }),
        ...(tags !== undefined && { Tags: tags }),
        ...(category !== undefined && { Category: category }),
        ...(pauseAfterMs !== undefined && { PauseAfterMs: pauseAfterMs }),
    };
}

function readMeta(db: Database, key: string): string | null {
    const stmt = db.prepare(`SELECT Value FROM Meta WHERE Key = ?`);
    try {
        stmt.bind([key]);
        if (!stmt.step()) return null;
        const value = stmt.get()[0];
        return typeof value === "string" ? value : null;
    } finally {
        stmt.free();
    }
}

/** Returns the set of user-table names defined in the SQLite database. */
function listTables(db: Database): Set<string> {
    const tables = new Set<string>();
    const stmt = db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    try {
        while (stmt.step()) {
            const name = stmt.get()[0];
            if (typeof name === "string") tables.add(name);
        }
    } finally {
        stmt.free();
    }
    return tables;
}

/** Returns the set of column names declared on `tableName`. Empty set when
 *  the table does not exist (caller should already have rejected that). */
function listColumns(db: Database, tableName: string): Set<string> {
    const cols = new Set<string>();
    // PRAGMA table_info doesn't accept bound parameters in sql.js; tableName
    // comes from a server-controlled allow-list so direct interpolation is
    // safe here.
    const stmt = db.prepare(`PRAGMA table_info(${tableName})`);
    try {
        while (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            if (typeof row.name === "string") cols.add(row.name);
        }
    } finally {
        stmt.free();
    }
    return cols;
}

/**
 * Asserts the SQLite database matches the keyword-events bundle shape:
 * required tables present and KeywordEvents has the required columns.
 * Throws a clear, user-facing Error on the first mismatch.
 */
function assertKeywordEventsSchema(db: Database): void {
    const tables = listTables(db);
    const missingTables = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missingTables.length > 0) {
        throw new Error(
            `Invalid keyword-events bundle: missing required table(s) `
            + `[${missingTables.join(", ")}]. Found tables: `
            + `[${[...tables].join(", ") || "none"}]. `
            + `Expected a ZIP produced by Export selected as ZIP `
            + `(file: ${DB_FILENAME}).`,
        );
    }

    const cols = listColumns(db, "KeywordEvents");
    const missingCols = REQUIRED_KEYWORD_EVENTS_COLUMNS.filter((c) => !cols.has(c));
    if (missingCols.length > 0) {
        throw new Error(
            `Invalid keyword-events bundle: KeywordEvents table is missing `
            + `column(s) [${missingCols.join(", ")}]. Found columns: `
            + `[${[...cols].join(", ") || "none"}]. The export format may `
            + `be from an incompatible version.`,
        );
    }
}

function readKeywordEvents(db: Database): ImportedKeywordEvent[] {
    const stmt = db.prepare(`SELECT * FROM KeywordEvents ORDER BY SortOrder ASC, Id ASC`);
    const rows: ImportedKeywordEvent[] = [];
    try {
        while (stmt.step()) {
            const row = stmt.getAsObject() as Record<string, unknown>;
            const ev = rowToEvent(row);
            if (ev) rows.push(ev);
        }
    } finally {
        stmt.free();
    }
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parses an in-memory SQLite database (raw bytes) into a typed list of
 * keyword events. Exposed separately from {@link readKeywordEventsZip} so
 * unit tests can build a DB inline and round-trip without the ZIP layer.
 */
export async function readKeywordEventsSqliteDb(
    data: Uint8Array,
): Promise<KeywordEventsImportResult> {
    const db = await initDb(data);
    try {
        // Structural check first — gives a more actionable error than the
        // bundle_kind probe below when the .db is from a different exporter
        // (or when Meta itself is missing).
        assertKeywordEventsSchema(db);

        const bundleKind = readMeta(db, "bundle_kind");
        if (bundleKind !== KEYWORD_EVENTS_BUNDLE_KIND) {
            throw new Error(
                `Not a keyword-events bundle: Meta.bundle_kind = `
                + `${bundleKind ?? "null"} (expected `
                + `'${KEYWORD_EVENTS_BUNDLE_KIND}'). The schema matches but `
                + `this file was tagged as a different export type.`,
            );
        }
        return {
            bundleKind,
            formatVersion: readMeta(db, "format_version"),
            exportedAt: readMeta(db, "exported_at"),
            events: readKeywordEvents(db),
        };
    } finally {
        db.close();
    }
}

/**
 * Reads a ZIP File/Blob, locates `keyword-events.db`, and returns the
 * parsed bundle. Throws when the entry is missing or when bundle_kind
 * does not match the keyword-events contract.
 */
export async function readKeywordEventsZip(
    file: Blob,
): Promise<KeywordEventsImportResult> {
    const JSZipCtor = await loadJSZip();
    const zip = await JSZipCtor.loadAsync(file);
    const entry = zip.file(DB_FILENAME);
    if (!entry) {
        const present = Object.keys(zip.files);
        throw new Error(
            `Missing ${DB_FILENAME} in ZIP — expected a keyword-events `
            + `bundle produced by Export selected as ZIP. ZIP contents: `
            + `[${present.join(", ") || "empty"}].`,
        );
    }
    const bytes = await entry.async("uint8array");
    return readKeywordEventsSqliteDb(bytes);
}

/* ------------------------------------------------------------------ */
/*  Matching helpers                                                   */
/* ------------------------------------------------------------------ */

export interface ImportMatchPlan {
    /** Selected events that have a matched imported row, in selection order. */
    readonly matches: ReadonlyArray<{
        readonly target: KeywordEvent;
        readonly source: ImportedKeywordEvent;
        readonly matchedBy: "uid" | "keyword";
    }>;
    /** Imported rows with no corresponding selected event. */
    readonly unmatchedImports: readonly ImportedKeywordEvent[];
    /** Selected events that received no imported row. */
    readonly unmatchedSelected: readonly KeywordEvent[];
}

/**
 * Computes which imported rows will be applied to which selected events.
 * Matching policy (decided in `.lovable/question-and-ambiguity/11-…`):
 *   1. Uid (== KeywordEvent.Id) — exact, preferred.
 *   2. Fallback: Keyword, case-insensitive + trimmed.
 *      Disabled when `options.strictUidOnly` is true — Uid mismatches stay
 *      unmatched instead of falling through to keyword.
 *   3. First selected match wins; later duplicates left untouched.
 */
export interface PlanImportMatchesOptions {
    /** When true, disable the Keyword fallback and match strictly by Uid. */
    readonly strictUidOnly?: boolean;
}

export function planImportMatches(
    selected: ReadonlyArray<KeywordEvent>,
    imported: ReadonlyArray<ImportedKeywordEvent>,
    options: PlanImportMatchesOptions = {},
): ImportMatchPlan {
    const strictUidOnly = options.strictUidOnly === true;
    const consumedSelectedIds = new Set<string>();
    const matches: ImportMatchPlan["matches"] = [];
    const unmatchedImports: ImportedKeywordEvent[] = [];

    const byUid = new Map<string, KeywordEvent>();
    const byKeyword = new Map<string, KeywordEvent>();
    for (const ev of selected) {
        byUid.set(ev.Id, ev);
        const key = ev.Keyword.trim().toLowerCase();
        if (key && !byKeyword.has(key)) byKeyword.set(key, ev);
    }

    const matchesMutable: Array<{
        readonly target: KeywordEvent;
        readonly source: ImportedKeywordEvent;
        readonly matchedBy: "uid" | "keyword";
    }> = [];

    for (const src of imported) {
        let target = byUid.get(src.Uid);
        let matchedBy: "uid" | "keyword" = "uid";
        if (!target || consumedSelectedIds.has(target.Id)) {
            if (strictUidOnly) {
                target = undefined;
            } else {
                const key = src.Keyword.trim().toLowerCase();
                const candidate = key ? byKeyword.get(key) : undefined;
                if (candidate && !consumedSelectedIds.has(candidate.Id)) {
                    target = candidate;
                    matchedBy = "keyword";
                } else {
                    target = undefined;
                }
            }
        }

        if (target) {
            consumedSelectedIds.add(target.Id);
            matchesMutable.push({ target, source: src, matchedBy });
        } else {
            unmatchedImports.push(src);
        }
    }

    void matches;
    const unmatchedSelected = selected.filter(ev => !consumedSelectedIds.has(ev.Id));
    return {
        matches: matchesMutable,
        unmatchedImports,
        unmatchedSelected,
    };
}

/**
 * Builds the patch object passed to `useKeywordEvents().updateEvent()`.
 * Only includes fields that were actually present in the imported row so
 * absent fields don't accidentally clear existing values.
 */
export function buildPatchFromImport(
    src: ImportedKeywordEvent,
): Partial<Omit<KeywordEvent, "Id">> {
    const patch: { -readonly [K in keyof Omit<KeywordEvent, "Id">]?: KeywordEvent[K] } = {};
    patch.Keyword = src.Keyword;
    if (src.Description !== undefined) patch.Description = src.Description;
    if (src.Enabled !== undefined) patch.Enabled = src.Enabled;
    if (src.Steps !== undefined) patch.Steps = src.Steps;
    if (src.Target !== undefined) patch.Target = src.Target;
    if (src.Tags !== undefined) patch.Tags = src.Tags;
    if (src.Category !== undefined) patch.Category = src.Category;
    if (src.PauseAfterMs !== undefined) patch.PauseAfterMs = src.PauseAfterMs;
    return patch;
}

/* ------------------------------------------------------------------ */
/*  Per-match field diff (preview)                                     */
/* ------------------------------------------------------------------ */

export interface FieldDiff {
    readonly field: string;
    readonly before: string;
    readonly after: string;
}

type DiffableValue = string | number | boolean | readonly string[] | KeywordEvent["Steps"] | KeywordEvent["Target"] | null | undefined;

/**
 * Given a matched (target, source) pair, returns the list of fields whose
 * value will actually change once `buildPatchFromImport(source)` is applied.
 * Fields absent from the import (undefined) are skipped — they would not
 * overwrite existing data. Values are stringified for display only.
 */
export function diffMatchedFields(
    target: KeywordEvent,
    source: ImportedKeywordEvent,
): readonly FieldDiff[] {
    const diffs: FieldDiff[] = [];
    const compare = (field: string, before: DiffableValue, after: DiffableValue): void => {
        if (after === undefined) return;
        const a = stringifyForDiff(before);
        const b = stringifyForDiff(after);
        if (a !== b) diffs.push({ field, before: a, after: b });
    };

    compare("Keyword", target.Keyword, source.Keyword);
    compare("Description", target.Description, source.Description);
    compare("Enabled", target.Enabled, source.Enabled);
    compare("Steps", target.Steps, source.Steps);
    compare("Target", target.Target, source.Target);
    compare("Tags", target.Tags, source.Tags);
    compare("Category", target.Category, source.Category);
    compare("PauseAfterMs", target.PauseAfterMs, source.PauseAfterMs);
    return diffs;
}

function stringifyForDiff(value: DiffableValue): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try { return JSON.stringify(value); } catch { return String(value); }
}

