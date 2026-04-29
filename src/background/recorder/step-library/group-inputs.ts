/**
 * Marco Extension — Per-Group Input Data Bag
 *
 * Stores a JSON object of input variables for a single `StepGroupId`.
 * The runner / recorder picks this up at execution time to substitute
 * `{{Variable}}` placeholders inside step payloads (see the seed
 * example in `useStepLibrary` — `Type email` references `{{Email}}`).
 *
 * Why a sibling `localStorage` bag and not a new sql.js table:
 *   - Keeps the storage migration out of the critical path of the
 *     current panel work; the schema bump can land later without
 *     touching this UI.
 *   - Mirrors how `useStepLibrary` already persists DB bytes (same
 *     versioned-key convention).
 *
 * Storage shape:
 *   `{ [StepGroupId: string]: Record<string, JsonValue> }`
 *
 * Validation rules:
 *   - Top-level value MUST be a plain JSON object (not array / scalar).
 *   - Nested values may be any JSON type.
 *   - Keys are caller-defined; we don't pre-validate placeholder names
 *     because the same bag can be reused across many groups whose
 *     placeholder sets differ.
 *
 * @see ../use-step-library.ts
 * @see .lovable/question-and-ambiguity/03-group-input-data-flow.md
 */

const STORAGE_KEY = "marco.step-library.inputs.v1";

/** Strictly-typed JSON value tree — no `any`, no `unknown`. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonObject
    | JsonArray;
export interface JsonObject { readonly [key: string]: JsonValue }
export type JsonArray = ReadonlyArray<JsonValue>;

export type GroupInputBag = JsonObject;
export type GroupInputsMap = ReadonlyMap<number, GroupInputBag>;

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export type ParseResult =
    | { readonly Ok: true; readonly Value: GroupInputBag }
    | { readonly Ok: false; readonly Reason: string };

/**
 * Parse + validate a raw JSON string into a `GroupInputBag`. Always
 * returns a structured result — never throws. Surfaces a friendly
 * line/column hint when SyntaxError carries position info.
 */
export function parseGroupInputJson(raw: string): ParseResult {
    const trimmed = raw.trim();
    if (trimmed === "") {
        return { Ok: false, Reason: "Input is empty. Paste or upload a JSON object." };
    }
    let parsed: JsonValue;
    try {
        parsed = JSON.parse(trimmed) as JsonValue;
    } catch (err) {
        const detail = err instanceof Error ? err.message : "Unknown parse error";
        const pos = extractPositionHint(detail, trimmed);
        return {
            Ok: false,
            Reason: pos === null
                ? `JSON parse error: ${detail}`
                : `JSON parse error at ${pos}: ${detail}`,
        };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
            Ok: false,
            Reason: `Expected a JSON object (e.g. { "Email": "you@example.com" }), got ${describeKind(parsed)}.`,
        };
    }
    return { Ok: true, Value: parsed as GroupInputBag };
}

function describeKind(v: JsonValue): string {
    if (v === null) return "null";
    if (Array.isArray(v)) return "an array";
    return typeof v;
}

function extractPositionHint(message: string, source: string): string | null {
    // V8 / SpiderMonkey commonly include "position N" or "at position N"
    // in JSON parse error messages; convert to line:col for legibility.
    const match = /position\s+(\d+)/i.exec(message);
    if (match === null) return null;
    const offset = Number(match[1]);
    if (!Number.isFinite(offset) || offset < 0 || offset > source.length) return null;
    let line = 1;
    let col = 1;
    for (let i = 0; i < offset; i++) {
        if (source.charCodeAt(i) === 0x0a) {
            line++;
            col = 1;
        } else {
            col++;
        }
    }
    return `line ${line}, column ${col}`;
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

interface RawStore { readonly [stepGroupId: string]: GroupInputBag }

function safeReadStore(): RawStore {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed = JSON.parse(raw) as JsonValue;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        // Defensive copy — only keep entries that are still objects.
        const out: Record<string, GroupInputBag> = {};
        for (const [k, v] of Object.entries(parsed as JsonObject)) {
            if (v !== null && typeof v === "object" && !Array.isArray(v)) {
                out[k] = v as GroupInputBag;
            }
        }
        return out;
    } catch {
        return {};
    }
}

function safeWriteStore(store: RawStore): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (err) {
        // Quota / private-mode failures must not crash the UI.
        console.warn("group-inputs: localStorage write failed", err);
    }
}

/** Returns a snapshot of every group's input bag. */
export function readAllGroupInputs(): GroupInputsMap {
    const store = safeReadStore();
    const map = new Map<number, GroupInputBag>();
    for (const [k, v] of Object.entries(store)) {
        const id = Number(k);
        if (Number.isInteger(id) && id > 0) {
            map.set(id, v);
        }
    }
    return map;
}

/** Returns the bag for one group, or `null` if none has been set. */
export function readGroupInput(stepGroupId: number): GroupInputBag | null {
    const store = safeReadStore();
    const v = store[String(stepGroupId)];
    return v === undefined ? null : v;
}

/** Persists / replaces the bag for one group. */
export function writeGroupInput(stepGroupId: number, bag: GroupInputBag): void {
    if (!Number.isInteger(stepGroupId) || stepGroupId <= 0) {
        throw new Error(
            `writeGroupInput: stepGroupId must be a positive integer, got ${String(stepGroupId)}.`,
        );
    }
    const store = { ...safeReadStore() };
    store[String(stepGroupId)] = bag;
    safeWriteStore(store);
}

/** Removes the bag for one group (no-op when absent). */
export function clearGroupInput(stepGroupId: number): void {
    const store = { ...safeReadStore() };
    if (Object.prototype.hasOwnProperty.call(store, String(stepGroupId))) {
        delete store[String(stepGroupId)];
        safeWriteStore(store);
    }
}

/** Test/debug helper — wipes every group input bag at once. */
export function clearAllGroupInputs(): void {
    safeWriteStore({});
}
