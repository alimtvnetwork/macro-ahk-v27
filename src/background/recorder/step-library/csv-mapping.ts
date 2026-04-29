/**
 * Marco Extension — CSV → GroupInputBag Mapping
 *
 * Converts a single parsed CSV row into the JSON-object input bag
 * stored against a StepGroup (see `group-inputs.ts`). The mapping is
 * two-fold:
 *
 *   1. **Column → Variable**: each CSV column maps to a variable name
 *      OR the special sentinel `"Skip"` (column ignored). The default
 *      variable name is the (sanitised) column header.
 *   2. **Coercion kind**: `auto`, `string`, `number`, `boolean`, or
 *      `json`. `auto` infers from the value:
 *         - `""` → `""` (empty string preserved, NOT null).
 *         - `true` / `false` (case-insensitive) → boolean.
 *         - Pure number that round-trips through `JSON.parse` → number.
 *         - Otherwise → string.
 *
 * Variable name validation:
 *   - 1–64 chars, must start with a letter / `_`, then letters /
 *     digits / `_`. Mirrors typical placeholder syntax for
 *     `{{Variable}}` substitution. Other characters are rejected so
 *     the bag stays compatible with the runner.
 *
 * The function is pure — no DOM, no storage. The dialog wraps it.
 */

import type { GroupInputBag, JsonValue } from "./group-inputs";

export type CoercionKind = "auto" | "string" | "number" | "boolean" | "json";

export interface ColumnMapping {
    /** Source CSV column header (verbatim, case-sensitive). */
    readonly Column: string;
    /** Target variable name in the bag, or null when the column is skipped. */
    readonly Variable: string | null;
    readonly Coerce: CoercionKind;
}

export interface BuildBagOptions {
    readonly Headers: ReadonlyArray<string>;
    readonly Row: ReadonlyArray<string>;
    readonly Mappings: ReadonlyArray<ColumnMapping>;
}

export type BuildBagResult =
    | { readonly Ok: true; readonly Bag: GroupInputBag; readonly UsedColumns: number }
    | {
          readonly Ok: false;
          readonly Reason: string;
          /** Column header (when applicable) that triggered the failure. */
          readonly Column: string | null;
      };

const VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Sanitise a header into a candidate variable name (used as a default). */
export function suggestVariableName(header: string): string {
    let cleaned = header.trim().replace(/[^A-Za-z0-9_]+/g, "_");
    cleaned = cleaned.replace(/^_+|_+$/g, "");
    if (cleaned === "") cleaned = "Var";
    // Ensure leading char is a letter or underscore.
    if (!/^[A-Za-z_]/.test(cleaned)) cleaned = `_${cleaned}`;
    return cleaned.slice(0, 64);
}

/** Returns null when valid; otherwise a human-readable reason. */
export function validateVariableName(name: string): string | null {
    if (name === "") return "Variable name cannot be empty.";
    if (!VARIABLE_NAME_RE.test(name)) {
        return `Variable name "${name}" is invalid — use 1–64 chars, letters/digits/underscore, must not start with a digit.`;
    }
    return null;
}

/**
 * Build the input bag for one row using the provided mappings.
 * Returns a structured failure on the first problem (so the UI can
 * highlight the offending column).
 */
export function buildBagFromRow(opts: BuildBagOptions): BuildBagResult {
    const { Headers, Row, Mappings } = opts;

    if (Headers.length !== Row.length) {
        return {
            Ok: false,
            Reason: `Row has ${Row.length} cell(s) but the header has ${Headers.length} column(s). The CSV is misaligned.`,
            Column: null,
        };
    }

    // Index headers for O(1) lookup; reject duplicate variable targets.
    const headerToIdx = new Map<string, number>();
    for (let i = 0; i < Headers.length; i++) headerToIdx.set(Headers[i], i);

    const bag: Record<string, JsonValue> = {};
    const seenVars = new Set<string>();
    let used = 0;

    for (const m of Mappings) {
        if (m.Variable === null) continue; // explicitly skipped
        const idx = headerToIdx.get(m.Column);
        if (idx === undefined) {
            return {
                Ok: false,
                Reason: `Mapping references column "${m.Column}" which is not in the CSV header.`,
                Column: m.Column,
            };
        }
        const validation = validateVariableName(m.Variable);
        if (validation !== null) {
            return { Ok: false, Reason: validation, Column: m.Column };
        }
        if (seenVars.has(m.Variable)) {
            return {
                Ok: false,
                Reason: `Two columns map to the same variable "${m.Variable}". Each variable name must be unique.`,
                Column: m.Column,
            };
        }
        seenVars.add(m.Variable);

        const raw = Row[idx];
        const coerced = coerceValue(raw, m.Coerce);
        if (!coerced.Ok) {
            return {
                Ok: false,
                Reason: `Column "${m.Column}" → ${m.Variable}: ${coerced.Reason}`,
                Column: m.Column,
            };
        }
        bag[m.Variable] = coerced.Value;
        used++;
    }

    if (used === 0) {
        return {
            Ok: false,
            Reason: "No columns are mapped — every column is set to Skip. Map at least one column to a variable.",
            Column: null,
        };
    }

    return { Ok: true, Bag: bag, UsedColumns: used };
}

type CoerceResult =
    | { readonly Ok: true; readonly Value: JsonValue }
    | { readonly Ok: false; readonly Reason: string };

function coerceValue(raw: string, kind: CoercionKind): CoerceResult {
    switch (kind) {
        case "string":
            return { Ok: true, Value: raw };
        case "number": {
            if (raw.trim() === "") {
                return { Ok: false, Reason: 'Expected a number, got "" (empty cell).' };
            }
            const n = Number(raw);
            if (!Number.isFinite(n)) {
                return { Ok: false, Reason: `Expected a number, got "${raw}".` };
            }
            return { Ok: true, Value: n };
        }
        case "boolean": {
            const t = raw.trim().toLowerCase();
            if (t === "true" || t === "1" || t === "yes" || t === "y") return { Ok: true, Value: true };
            if (t === "false" || t === "0" || t === "no" || t === "n" || t === "") return { Ok: true, Value: false };
            return { Ok: false, Reason: `Expected a boolean (true/false/yes/no/0/1), got "${raw}".` };
        }
        case "json": {
            if (raw.trim() === "") return { Ok: true, Value: "" };
            try {
                return { Ok: true, Value: JSON.parse(raw) as JsonValue };
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return { Ok: false, Reason: `JSON parse error: ${msg}` };
            }
        }
        case "auto":
        default: {
            if (raw === "") return { Ok: true, Value: "" };
            const t = raw.trim().toLowerCase();
            if (t === "true") return { Ok: true, Value: true };
            if (t === "false") return { Ok: true, Value: false };
            // Treat as number only when the trimmed text round-trips
            // through Number — avoids e.g. "01" → 1 surprises by
            // requiring the printed form to match.
            const trimmed = raw.trim();
            if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
                const n = Number(trimmed);
                if (Number.isFinite(n) && String(n) === trimmed) {
                    return { Ok: true, Value: n };
                }
            }
            return { Ok: true, Value: raw };
        }
    }
}
