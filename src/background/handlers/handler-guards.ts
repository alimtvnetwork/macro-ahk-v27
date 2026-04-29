/**
 * Marco Extension — Handler Input Guards & SQLite Bind Safety
 *
 * Single source of truth for two recurring problems in message handlers:
 *
 *   1. Validating required message fields (projectId, key, slug, …) BEFORE
 *      they reach SQLite. A missing field used to surface as the cryptic
 *        "Wrong API use : tried to bind a value of an unknown type (undefined)"
 *      thrown deep inside sql.js — useless for diagnosis.
 *
 *   2. Coercing optional fields to `null` (SQLite-safe) instead of leaving
 *      them as `undefined`. SQLite cannot bind `undefined` to a parameter.
 *
 * Use these helpers at the TOP of every handler that performs a DB write or
 * read. They return a typed error response on failure so the message router
 * can deliver it to the caller as a normal isOk:false result, instead of
 * throwing and producing the [message-router] crash spam in the Errors view.
 *
 * @see src/background/handlers/kv-handler.ts            — reference usage
 * @see src/background/handlers/file-storage-handler.ts  — reference usage
 * @see src/background/handlers/grouped-kv-handler.ts    — reference usage
 * @see src/background/handlers/logging-handler.ts       — reference usage
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HandlerErrorResponse {
    isOk: false;
    errorMessage: string;
}

/* ------------------------------------------------------------------ */
/*  Field validators (return string | null)                            */
/* ------------------------------------------------------------------ */

/** Returns a non-empty string if the value qualifies, otherwise null. */
function asNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export function requireProjectId(value: unknown): string | null {
    return asNonEmptyString(value);
}

export function requireKey(value: unknown): string | null {
    return asNonEmptyString(value);
}

export function requireSlug(value: unknown): string | null {
    return asNonEmptyString(value);
}

export function requireField(value: unknown): string | null {
    return asNonEmptyString(value);
}

/** Builds a uniform error response naming the missing field + handler op. */
export function missingFieldError(
    field: string,
    op: string,
): HandlerErrorResponse {
    return {
        isOk: false,
        errorMessage: `[${op}] Missing or invalid '${field}' (expected non-empty string)`,
    };
}

/* ------------------------------------------------------------------ */
/*  Bind-time coercion helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Coerce any value to a SQLite-safe optional bind:
 *   undefined / null / "" → null
 *   other primitives      → String(value)
 */
export function bindOpt(value: unknown): string | null {
    if (value === undefined || value === null || value === "") return null;
    return typeof value === "string" ? value : String(value);
}

/**
 * Coerce any value to a SQLite-safe required bind. If missing, returns the
 * supplied fallback (used for NOT NULL columns where null would also fail).
 */
export function bindReq(value: unknown, fallback: string): string {
    if (value === undefined || value === null || value === "") return fallback;
    return typeof value === "string" ? value : String(value);
}

/**
 * Defense-in-depth: scan a params array for `undefined` BEFORE it reaches
 * sql.js, and throw a precise typed error naming the offending index.
 *
 * Use this when you cannot easily route to bindOpt/bindReq for every column,
 * e.g. dynamic-column INSERTs in the project query builder.
 */
export class SqliteBindError extends Error {
    constructor(public readonly paramIndex: number, public readonly op: string) {
        super(
            `[${op}] SQLite bind param at index ${paramIndex} is undefined — `
            + `coerce to null or supply a fallback before binding.`,
        );
        this.name = "SqliteBindError";
    }
}

/**
 * Returns the same params array with undefined slots converted to null.
 * Throws SqliteBindError only when allowUndefined === false (default true =
 * silent coercion). Use throwing mode in dev-only code paths.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- multi-stage SQL shape inference (INSERT/UPDATE/SELECT) with column-name fallback chain; splitting fragments the safety contract
export function safeBind(
    params: ReadonlyArray<unknown>,
    op: string,
    options: { allowUndefined?: boolean } = {},
): Array<string | number | null | Uint8Array> {
    const allowUndefined = options.allowUndefined ?? true;
    const out: Array<string | number | null | Uint8Array> = [];
    for (let i = 0; i < params.length; i++) {
        const v = params[i];
        if (v === undefined) {
            if (!allowUndefined) throw new SqliteBindError(i, op);
            out.push(null);
            continue;
        }
        if (v === null) { out.push(null); continue; }
        if (typeof v === "string" || typeof v === "number") { out.push(v); continue; }
        if (v instanceof Uint8Array) { out.push(v); continue; }
        if (typeof v === "boolean") { out.push(v ? 1 : 0); continue; }
        // Fallback: stringify objects so they at least don't crash sql.js
        out.push(String(v));
    }
    return out;
}
