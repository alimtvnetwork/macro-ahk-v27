/**
 * Marco Extension — FailureReport Shape Validator (export-time guard)
 *
 * Pure helper that re-checks the SAME schema enforced at build time by
 * `scripts/check-failure-log-schema.mjs` against an actual JSON payload
 * about to be downloaded. Build-time guarantees the producer code is
 * correct; this guarantees a runtime mutation, manual edit, or future
 * `JSON.parse(localStorage…)` round-trip didn't silently drop a field.
 *
 * Returns a `ValidationResult` describing which top-level reports are
 * malformed and which fields are missing/wrong-typed. UI surfaces it as
 * a warning toast — export still proceeds (the user explicitly asked
 * to download), but they're told the file is suspect and exactly why.
 *
 * Schema source of truth:
 *   - Required top-level fields (mirrors REQUIRED_REPORT_FIELDS in
 *     scripts/check-failure-log-schema.mjs)
 *   - Type expectations per field (string | number | boolean | array | null-allowed)
 *   - Bundle wrapper shape: { Generator, Version, ExportedAt, Count, Reports }
 *
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 * @see scripts/check-failure-log-schema.mjs — build-time twin
 * @see ./failure-export.ts — producer of the payload this validates
 */

/* ------------------------------------------------------------------ */
/*  Schema (kept in sync with REQUIRED_REPORT_FIELDS)                  */
/* ------------------------------------------------------------------ */

type FieldKind =
    | "string"
    | "string|null"
    | "number|null"
    | "boolean"
    | "array"
    | "object|null";

interface FieldSpec {
    readonly kind: FieldKind;
}

/**
 * MUST stay in sync with `REQUIRED_REPORT_FIELDS` in
 * `scripts/check-failure-log-schema.mjs`. The build-time check enforces
 * the producer; this map enforces the on-disk payload.
 */
const REPORT_FIELD_SPEC: Readonly<Record<string, FieldSpec>> = {
    Phase:         { kind: "string" },
    Reason:        { kind: "string" },
    ReasonDetail:  { kind: "string" },
    StackTrace:    { kind: "string|null" },
    StepId:        { kind: "number|null" },
    Index:         { kind: "number|null" },
    StepKind:      { kind: "string|null" },
    Selectors:     { kind: "array" },
    Variables:     { kind: "array" },
    DomContext:    { kind: "object|null" },
    ResolvedXPath: { kind: "string|null" },
    Timestamp:     { kind: "string" },
    SourceFile:    { kind: "string" },
    Verbose:       { kind: "boolean" },
};

const REQUIRED_BUNDLE_FIELDS: ReadonlyArray<string> = [
    "Generator",
    "Version",
    "ExportedAt",
    "Count",
    "Reports",
];

/* ------------------------------------------------------------------ */
/*  Result shape                                                       */
/* ------------------------------------------------------------------ */

export interface FieldIssue {
    /** Path like `Reports[2].Selectors` or `Verbose` (top-level report). */
    readonly Path: string;
    /** What was wrong: missing key, wrong type, or null where forbidden. */
    readonly Problem: "missing" | "wrong-type" | "null-not-allowed";
    /** Expected kind (when Problem is wrong-type / null-not-allowed). */
    readonly Expected: FieldKind | null;
    /** typeof the actual value (or "null" / "array"). */
    readonly Actual: string;
}

export interface ValidationResult {
    readonly Valid: boolean;
    /** Top-level shape errors (e.g. payload is not an object). */
    readonly RootIssues: ReadonlyArray<FieldIssue>;
    /** Per-report issues. Empty if every report is well-formed. */
    readonly ReportIssues: ReadonlyArray<FieldIssue>;
    /** Number of reports inspected (0 when payload is not a bundle/report). */
    readonly ReportsChecked: number;
    /**
     * Human-friendly one-liner summarising the worst issue. Suitable
     * for the toast title; empty when `Valid === true`.
     */
    readonly Summary: string;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate a payload that is EITHER a single FailureReport or a
 * FailureBundle (`{ Reports: FailureReport[] }`). Accepts both because
 * the export panel produces both shapes (see failure-export.ts).
 *
 * Pass either the parsed object or the raw JSON string — we'll parse
 * and report a top-level issue if parsing fails.
 */
export function validateFailureReportPayload(
    input: unknown,
): ValidationResult {
    // Step 1: coerce JSON string to object if needed.
    let payload: unknown = input;
    if (typeof input === "string") {
        try {
            payload = JSON.parse(input);
        } catch (e) {
            return failResult([{
                Path: "$",
                Problem: "wrong-type",
                Expected: "object|null",
                Actual: `invalid JSON (${(e as Error).message})`,
            }], [], 0);
        }
    }

    // Step 2: must be a non-null object.
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return failResult([{
            Path: "$",
            Problem: "wrong-type",
            Expected: "object|null",
            Actual: kindOf(payload),
        }], [], 0);
    }

    // Step 3: detect bundle vs single report. If `Reports` key is
    //         present (even with the wrong type), treat as a bundle so
    //         we surface the wrapper-shape error rather than 14 false
    //         "missing field" errors against a non-report object.
    const obj = payload as Record<string, unknown>;
    if ("Reports" in obj || "Generator" in obj || "ExportedAt" in obj) {
        return validateBundle(obj);
    }
    // Single report path.
    const reportIssues = validateOneReport(obj, "$");
    return finalize([], reportIssues, 1);
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function validateBundle(bundle: Record<string, unknown>): ValidationResult {
    const rootIssues: FieldIssue[] = [];
    for (const f of REQUIRED_BUNDLE_FIELDS) {
        if (!(f in bundle)) {
            rootIssues.push({
                Path: f, Problem: "missing", Expected: null, Actual: "undefined",
            });
        }
    }
    const reports = bundle.Reports;
    if (!Array.isArray(reports)) {
        rootIssues.push({
            Path: "Reports", Problem: "wrong-type",
            Expected: "array", Actual: kindOf(reports),
        });
        return finalize(rootIssues, [], 0);
    }

    const reportIssues: FieldIssue[] = [];
    for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        if (r === null || typeof r !== "object" || Array.isArray(r)) {
            reportIssues.push({
                Path: `Reports[${i}]`, Problem: "wrong-type",
                Expected: "object|null", Actual: kindOf(r),
            });
            continue;
        }
        reportIssues.push(
            ...validateOneReport(r as Record<string, unknown>, `Reports[${i}]`),
        );
    }
    return finalize(rootIssues, reportIssues, reports.length);
}

function validateOneReport(
    r: Record<string, unknown>,
    pathPrefix: string,
): FieldIssue[] {
    const out: FieldIssue[] = [];
    for (const [field, spec] of Object.entries(REPORT_FIELD_SPEC)) {
        const path = pathPrefix === "$" ? field : `${pathPrefix}.${field}`;
        if (!(field in r)) {
            out.push({
                Path: path, Problem: "missing",
                Expected: spec.kind, Actual: "undefined",
            });
            continue;
        }
        const v = r[field];
        if (!matchesKind(v, spec.kind)) {
            out.push({
                Path: path,
                Problem: v === null ? "null-not-allowed" : "wrong-type",
                Expected: spec.kind,
                Actual: kindOf(v),
            });
        }
    }
    return out;
}

function matchesKind(v: unknown, kind: FieldKind): boolean {
    switch (kind) {
        case "string":      return typeof v === "string";
        case "string|null": return v === null || typeof v === "string";
        case "number|null": return v === null || typeof v === "number";
        case "boolean":     return typeof v === "boolean";
        case "array":       return Array.isArray(v);
        case "object|null":
            return v === null
                || (typeof v === "object" && !Array.isArray(v));
    }
}

function kindOf(v: unknown): string {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
}

function failResult(
    rootIssues: ReadonlyArray<FieldIssue>,
    reportIssues: ReadonlyArray<FieldIssue>,
    reportsChecked: number,
): ValidationResult {
    return finalize(rootIssues, reportIssues, reportsChecked);
}

function finalize(
    rootIssues: ReadonlyArray<FieldIssue>,
    reportIssues: ReadonlyArray<FieldIssue>,
    reportsChecked: number,
): ValidationResult {
    const total = rootIssues.length + reportIssues.length;
    if (total === 0) {
        return {
            Valid: true,
            RootIssues: [],
            ReportIssues: [],
            ReportsChecked: reportsChecked,
            Summary: "",
        };
    }
    const first = rootIssues[0] ?? reportIssues[0];
    const more = total - 1;
    const tail = more > 0 ? ` (+${more} more)` : "";
    const summary =
        `${first.Path}: ${first.Problem}` +
        (first.Expected ? ` — expected ${first.Expected}, got ${first.Actual}` : "") +
        tail;
    return {
        Valid: false,
        RootIssues: rootIssues,
        ReportIssues: reportIssues,
        ReportsChecked: reportsChecked,
        Summary: summary,
    };
}
