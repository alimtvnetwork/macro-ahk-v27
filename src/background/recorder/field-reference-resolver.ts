/**
 * Marco Extension — Field Reference Resolver
 *
 * Phase 08 — Macro Recorder.
 *
 * Replaces `{{ColumnName}}` tokens in a template string with values from the
 * current data-source row. Used by the replay engine (Phase 09) and by the
 * preview tooltip in the field-binding UI (Phase 09).
 *
 * Rules:
 *   - Token syntax: `{{ColumnName}}` — PascalCase, no spaces, no expressions.
 *   - Whitespace inside the braces is tolerated: `{{ Email }}` works.
 *   - Unknown columns raise — silent fallbacks would corrupt replay data.
 *   - Escaped braces (`\{{Foo}}`) are emitted literally as `{{Foo}}`.
 *
 * Pure: no DOM, no chrome, no async — fully unit-testable.
 */

const TOKEN_PATTERN = /\\?\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export type FieldRow = Readonly<Record<string, string>>;

/**
 * Loose row shape used by the diagnostics path. Real-world rows can carry
 * `null` (SQLite NULL), numbers, booleans, or arbitrary objects from JS
 * step output. We accept all of them so the variable-failure log can
 * report the *actual* type that arrived rather than crashing the resolver.
 */
export type LooseFieldRow = Readonly<Record<string, unknown>>;

/**
 * Per-variable diagnostic record attached to failure logs. One entry per
 * `{{Token}}` referenced by the template — including ones that resolved
 * successfully, so AI debuggers can see the entire input surface.
 *
 * Conformance: mem://standards/verbose-logging-and-failure-diagnostics
 *   "Every failure MUST log full VariableContext[] with name + source +
 *    resolvedValue + valueType + reason; never omit silently."
 */
export type VariableValueType =
    | "string" | "number" | "boolean" | "null" | "undefined" | "object" | "array";

export type VariableFailureReason =
    | "Resolved"           // Not a failure — kept so the union covers OK rows.
    | "MissingColumn"      // The token references a column that is not in the row at all.
    | "NullValue"          // Column exists but value is null.
    | "UndefinedValue"     // Column exists but value is undefined.
    | "EmptyString"        // Column exists, value is "" — usually fatal for required inputs.
    | "TypeMismatch";      // Value present but not the type the step expected.

export interface VariableContext {
    readonly Name: string;                 // e.g. "Email"
    readonly Source: string;               // e.g. "DataSource:CustomersV2", "Row", "ProjectVar"
    readonly RowIndex: number | null;
    readonly Column: string | null;
    readonly ResolvedValue: string | null; // stringified for log readability; null when MissingColumn/NullValue/UndefinedValue
    readonly ValueType: VariableValueType;
    readonly FailureReason: VariableFailureReason;
    readonly FailureDetail: string | null; // human sentence; null when Resolved
}

export interface ResolveDetailedResult {
    readonly Resolved: string;             // partial resolution — failed tokens emit "" so the caller can still preview
    readonly Variables: ReadonlyArray<VariableContext>;
    readonly FirstFailure: VariableContext | null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve every `{{Column}}` token in `template` against `row`.
 * Throws when a referenced column is not present in `row`.
 */
export function resolveFieldReferences(
    template: string,
    row: FieldRow,
): string {
    return template.replace(TOKEN_PATTERN, (match, name: string) => {
        const isEscaped = match.charAt(0) === "\\";
        if (isEscaped) return match.slice(1);

        const hasColumn = Object.prototype.hasOwnProperty.call(row, name);
        if (hasColumn === false) {
            throw new Error(`Field reference {{${name}}} — column missing in row`);
        }

        return row[name] ?? "";
    });
}

/**
 * Diagnostic resolver. Never throws — always returns a `ResolveDetailedResult`
 * so the caller can decide whether to abort the step or pass the partial
 * substitution downstream while still attaching the full `Variables` array
 * to a failure report.
 *
 * Failure-reason precedence (per token):
 *   1. MissingColumn  — column not in row at all
 *   2. NullValue      — present, but `null`
 *   3. UndefinedValue — present, but `undefined`
 *   4. EmptyString    — present, but ""
 *   5. TypeMismatch   — present, but not string/number/boolean (object/array)
 *
 * @param expectedType — caller's contract for what the resolved value
 *                       should be. Defaults to "string" (Type/Select steps).
 * @param source       — free-text origin label, e.g. "DataSource:Customers".
 * @param rowIndex     — index in the source data set, when known.
 */
export function resolveFieldReferencesDetailed(
    template: string,
    row: LooseFieldRow,
    options: {
        readonly Source?: string;
        readonly RowIndex?: number;
        readonly ExpectedType?: VariableValueType;
    } = {},
): ResolveDetailedResult {
    const source = options.Source ?? "Row";
    const rowIndex = options.RowIndex ?? null;
    const expected = options.ExpectedType ?? "string";

    const seen = new Map<string, VariableContext>();
    let firstFailure: VariableContext | null = null;

    const resolved = template.replace(TOKEN_PATTERN, (match, name: string) => {
        const isEscaped = match.charAt(0) === "\\";
        if (isEscaped) { return match.slice(1); }

        // Deduplicate per-name so repeated tokens produce one diagnostic.
        const cached = seen.get(name);
        if (cached !== undefined) {
            return cached.ResolvedValue ?? "";
        }

        const ctx = classifyVariable(name, row, source, rowIndex, expected);
        seen.set(name, ctx);
        if (ctx.FailureReason !== "Resolved" && firstFailure === null) {
            firstFailure = ctx;
        }
        return ctx.ResolvedValue ?? "";
    });

    return {
        Resolved: resolved,
        Variables: Array.from(seen.values()),
        FirstFailure: firstFailure,
    };
}

/* ------------------------------------------------------------------ */
/*  Static analysis                                                    */
/* ------------------------------------------------------------------ */

/** Lists every distinct column name referenced in a template. */
export function extractReferencedColumns(template: string): ReadonlyArray<string> {
    const found = new Set<string>();
    const pattern = new RegExp(TOKEN_PATTERN.source, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(template)) !== null) {
        const isEscaped = match[0].charAt(0) === "\\";
        if (isEscaped === false) {
            found.add(match[1]!);
        }
    }

    return Array.from(found);
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function classifyVariable(
    name: string,
    row: LooseFieldRow,
    source: string,
    rowIndex: number | null,
    expected: VariableValueType,
): VariableContext {
    const hasColumn = Object.prototype.hasOwnProperty.call(row, name);
    if (!hasColumn) {
        return {
            Name: name, Source: source, RowIndex: rowIndex, Column: name,
            ResolvedValue: null, ValueType: "undefined",
            FailureReason: "MissingColumn",
            FailureDetail:
                `Variable {{${name}}} is not a column in the active row ` +
                `(source=${source}${rowIndex !== null ? `, rowIndex=${rowIndex}` : ""}). ` +
                `Available columns: [${Object.keys(row).join(", ") || "<empty>"}].`,
        };
    }

    const raw = row[name];
    const valueType = classifyType(raw);

    if (raw === null) {
        return baseFailure(name, source, rowIndex, null, "null", "NullValue",
            `Variable {{${name}}} resolved to null (source=${source}, column=${name}).`);
    }
    if (raw === undefined) {
        return baseFailure(name, source, rowIndex, null, "undefined", "UndefinedValue",
            `Variable {{${name}}} resolved to undefined (source=${source}, column=${name}).`);
    }
    if (typeof raw === "string" && raw.length === 0) {
        return baseFailure(name, source, rowIndex, "", "string", "EmptyString",
            `Variable {{${name}}} resolved to an empty string (source=${source}, column=${name}). ` +
            `If empty is valid for this step, ignore.`);
    }

    // Type-mismatch only fires when caller expected a primitive but got object/array.
    const isPrimitive = valueType === "string" || valueType === "number" || valueType === "boolean";
    if (!isPrimitive && expected !== "object" && expected !== "array") {
        const stringified = safeStringify(raw);
        return baseFailure(name, source, rowIndex, stringified, valueType, "TypeMismatch",
            `Variable {{${name}}} expected ${expected} but got ${valueType} ` +
            `(source=${source}, column=${name}, value=${stringified}).`);
    }

    return {
        Name: name, Source: source, RowIndex: rowIndex, Column: name,
        ResolvedValue: stringifyPrimitive(raw),
        ValueType: valueType,
        FailureReason: "Resolved",
        FailureDetail: null,
    };
}

function baseFailure(
    name: string,
    source: string,
    rowIndex: number | null,
    resolved: string | null,
    valueType: VariableValueType,
    reason: VariableFailureReason,
    detail: string,
): VariableContext {
    return {
        Name: name, Source: source, RowIndex: rowIndex, Column: name,
        ResolvedValue: resolved, ValueType: valueType,
        FailureReason: reason, FailureDetail: detail,
    };
}

function classifyType(v: unknown): VariableValueType {
    if (v === null) { return "null"; }
    if (v === undefined) { return "undefined"; }
    if (Array.isArray(v)) { return "array"; }
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean" || t === "object") { return t; }
    return "object";
}

function stringifyPrimitive(v: unknown): string {
    if (typeof v === "string") { return v; }
    if (typeof v === "number" || typeof v === "boolean") { return String(v); }
    return safeStringify(v);
}

function safeStringify(v: unknown): string {
    try { return JSON.stringify(v) ?? "undefined"; } catch { return String(v); }
}
