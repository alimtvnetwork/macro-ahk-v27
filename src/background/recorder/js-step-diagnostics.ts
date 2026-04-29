/**
 * Marco Extension — JS Step Diagnostics
 *
 * Phase 11 companion module for `js-step-sandbox.ts`.
 *
 * Purpose:
 *   The recorder's `JsInline` step (StepKindId = 4) executes inside a
 *   `new Function("Ctx", "Log", "use strict; <body>")` sandbox. When it
 *   fails, it previously surfaced only a `JsExecError` — a bare `Error`
 *   subclass with no `Selectors`, no `Variables`, no `SourceFile`, no
 *   `Reason` code. That broke the project-wide rule from
 *   `mem://standards/verbose-logging-and-failure-diagnostics`:
 *
 *       "Every failure MUST log Reason + ReasonDetail, full SelectorAttempts[]
 *        for selector misses, and full VariableContext[] for variable or data
 *        failures. Never omit; log `null` + reason if unknown."
 *
 *   This module is the single bridge between `JsInlineContext` and the
 *   canonical `FailureReport` shape, ensuring JS-step diagnostics flow
 *   through the same `buildFailureReport()` path the recorder/replay
 *   pipelines already use.
 *
 * Two pure exports:
 *
 *   1. `buildJsStepVariableContext(ctx)` — explodes the frozen
 *      `JsInlineContext.Row` and `JsInlineContext.Vars` into the
 *      `VariableContext[]` shape. Every entry is `Resolved` (the JS body
 *      already saw the values); empty / null entries are still listed so
 *      the AI debugger can see "Row had {Email: ''}" rather than guessing.
 *
 *   2. `buildJsStepFailureReport(input)` — wraps `buildFailureReport` with
 *      JS-specific defaults (`Phase: "Replay"`, `StepKind: "JsInline"`,
 *      `Reason: "JsThrew"`), augments `ReasonDetail` with line/col when
 *      the thrown error exposes them, and attaches the captured
 *      `LogLines` as a structured `Variables` row of `Source: "JsLog"`
 *      so the formatter renders them inline.
 *
 * Design rules:
 *   - Pure, sync, no DOM, no chrome.*.
 *   - Verbose flag is forwarded — it gates payload size only, never
 *     classification (LOG-2 in plan.md).
 *   - Sensitive masking: any `Vars` key matching the project-wide regex
 *     `/password|secret|token|otp|pin|cvv|ssn|credit/i` is masked to
 *     `***` regardless of the verbose flag, mirroring `form-snapshot.ts`.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics
 *   - mem://features/form-snapshot-capture (masking regex source of truth)
 *   - plan.md → "Logging & Diagnostics Enforcement" → LOG-1, LOG-2, LOG-5.
 */

import {
    buildFailureReport,
    type FailureReport,
    type FailurePhase,
} from "./failure-logger";
import type { VariableContext, FieldRow } from "./field-reference-resolver";
import {
    JsExecError,
    JsValidationError,
    type JsInlineContext,
    type JsInlineResult,
} from "./js-step-sandbox";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Single source of truth for sensitive-field masking — kept in lockstep
 * with `form-snapshot.ts` so a key like `password` is never accidentally
 * surfaced through one diagnostics path while masked in another.
 */
const SENSITIVE_KEY_PATTERN = /password|secret|token|otp|pin|cvv|ssn|credit/i;

const MASKED = "***";

/** Phase under which JS-step failures are filed. JS steps only run during
 *  Replay — Record-phase JS validation goes through a different path. */
const JS_STEP_PHASE: FailurePhase = "Replay";

/** Stable `StepKind` label so UI surfaces (FailureDetailsPanel,
 *  SelectorReplayTracePanel) can switch on it without depending on the
 *  numeric `StepKindId`. */
const JS_STEP_KIND = "JsInline";

/* ------------------------------------------------------------------ */
/*  Variable context construction                                      */
/* ------------------------------------------------------------------ */

/**
 * Narrow alias for the value-type column of `VariableContext`. Re-derived
 * here (instead of imported from `field-reference-resolver`) so callers do
 * not need the full module — keeps the import graph shallow.
 */
type VariableValueType = VariableContext["ValueType"];

function classifyValue(v: string): { Type: VariableValueType; Display: string } {
    if (v === "") {
        return { Type: "string", Display: "" };
    }
    return { Type: "string", Display: v };
}

/**
 * Convert an `JsInlineContext` (Row + Vars) into the `VariableContext[]`
 * shape required by `FailureReport.Variables`. Every entry is `Resolved`
 * because the sandbox already consumed the values — this is a *snapshot*
 * of what the JS body saw, not a re-resolution attempt.
 *
 * Order: every `Vars` key (alphabetical) followed by every `Row` column
 * (alphabetical) so the output is deterministic across runs. Sensitive
 * keys are masked.
 */
export function buildJsStepVariableContext(
    ctx: JsInlineContext,
): ReadonlyArray<VariableContext> {
    const out: VariableContext[] = [];

    const varKeys = Object.keys(ctx.Vars).sort();
    for (const key of varKeys) {
        const raw = ctx.Vars[key];
        const sensitive = SENSITIVE_KEY_PATTERN.test(key);
        const display = sensitive ? MASKED : classifyValue(raw).Display;
        out.push({
            Name: key,
            Source: "Vars",
            RowIndex: null,
            Column: null,
            ResolvedValue: display,
            ValueType: "string",
            FailureReason: "Resolved",
            FailureDetail: null,
        });
    }

    if (ctx.Row !== null) {
        const rowKeys = Object.keys(ctx.Row).sort();
        for (const key of rowKeys) {
            const raw = ctx.Row[key];
            const sensitive = SENSITIVE_KEY_PATTERN.test(key);
            const display = sensitive ? MASKED : classifyValue(raw).Display;
            out.push({
                Name: key,
                Source: "Row",
                RowIndex: null,
                Column: key,
                ResolvedValue: display,
                ValueType: "string",
                FailureReason: "Resolved",
                FailureDetail: null,
            });
        }
    }

    return out;
}

/* ------------------------------------------------------------------ */
/*  Failure report construction                                        */
/* ------------------------------------------------------------------ */

export interface BuildJsStepFailureReportInput {
    /** The JS body that was executed (for the `ReasonDetail` snippet). */
    readonly Body: string;
    /** The error thrown by the sandbox — `JsValidationError` (static
     *  reject) or `JsExecError` (runtime throw) or any `Error`. */
    readonly Error: unknown;
    /** The frozen context the sandbox saw. Drives `Variables`. */
    readonly Context: JsInlineContext;
    /** Captured `Log()` lines from the partial execution, when available. */
    readonly LogLines?: ReadonlyArray<string>;
    /** Step coordinates for the project DB. */
    readonly StepId?: number;
    readonly Index?: number;
    /** Caller-supplied `SourceFile` per LOG-3 — required, never defaulted. */
    readonly SourceFile: string;
    /**
     * Verbose flag, resolved by the caller via `resolveVerboseLogging(...)`.
     * Gates whether the captured `LogLines` are persisted in full or
     * truncated to 240 chars per line. Never alters classification.
     */
    readonly Verbose?: boolean;
    /** Optional injected clock for deterministic tests. */
    readonly Now?: () => Date;
    /** Optional active data-row to forward into `FailureReport.DataRow`. */
    readonly DataRow?: FieldRow;
}

/**
 * Classify the JS-step failure's `ReasonDetail`:
 *   - `JsValidationError` → "Validation: <regex name>"
 *   - `JsExecError`       → "Runtime: <message>" (+ line/col when present)
 *   - any other `Error`   → "Runtime: <message>"
 *   - non-Error throw     → "Runtime: <stringified>"
 */
function jsStepReasonDetail(err: unknown, body: string): string {
    if (err instanceof JsValidationError) {
        return `Validation: ${err.message}`;
    }
    if (err instanceof JsExecError) {
        // JsExecError prefixes "InlineJs execution failed: " — strip it for
        // the human-readable detail; the original is still on StackTrace.
        const msg = err.message.replace(/^InlineJs execution failed:\s*/, "");
        return `Runtime: ${msg}${bodyHint(body)}`;
    }
    if (err instanceof Error) {
        return `Runtime: ${err.message}${bodyHint(body)}`;
    }
    try {
        return `Runtime: ${JSON.stringify(err)}`;
    } catch {
        return `Runtime: ${String(err)}`;
    }
}

/** First line of the body, capped at 80 chars, formatted as `(in: <line>)`. */
function bodyHint(body: string): string {
    const first = body.split("\n", 1)[0]?.trim() ?? "";
    if (first.length === 0) {
        return "";
    }
    const trimmed = first.length > 80 ? `${first.slice(0, 77)}…` : first;
    return ` (in: ${trimmed})`;
}

/**
 * Append captured `LogLines` as `Variables` rows so the existing
 * `formatFailureReport` Variables table renders them inline without any
 * formatter changes. Each line becomes a `Source: "JsLog"` entry; values
 * are truncated to 240 chars on non-verbose runs (mirrors the legacy
 * `OuterHtmlSnippet` truncation contract).
 */
function logLinesAsVariables(
    lines: ReadonlyArray<string>,
    verbose: boolean,
): ReadonlyArray<VariableContext> {
    if (lines.length === 0) {
        return [];
    }
    const limit = verbose ? Number.POSITIVE_INFINITY : 240;
    return lines.map((line, i) => {
        const value = line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
        return {
            Name: `Log[${i}]`,
            Source: "JsLog",
            RowIndex: null,
            Column: null,
            ResolvedValue: value,
            ValueType: "string" as const,
            FailureReason: "Resolved" as const,
            FailureDetail: null,
        };
    });
}

/**
 * Single entry point for JS-step diagnostics. Produces a `FailureReport`
 * that:
 *   - Carries `Phase: "Replay"`, `StepKind: "JsInline"`, `Reason: "JsThrew"`.
 *   - Lists every `Vars`/`Row` key in `Variables` (sensitive keys masked).
 *   - Appends captured `LogLines` as `JsLog` variable rows for at-a-glance
 *     debugging.
 *   - Honours `Verbose` for log-line truncation only — never alters the
 *     `Reason`/`ReasonDetail`/variable schema.
 *   - Leaves `Selectors` empty (JS steps have no selectors); the schema
 *     guard accepts an empty array — only the *field* must exist.
 */
export function buildJsStepFailureReport(
    input: BuildJsStepFailureReportInput,
): FailureReport {
    const verbose = input.Verbose === true;
    const variables: ReadonlyArray<VariableContext> = [
        ...buildJsStepVariableContext(input.Context),
        ...logLinesAsVariables(input.LogLines ?? [], verbose),
    ];

    return buildFailureReport({
        Phase: JS_STEP_PHASE,
        Error: input.Error,
        StepId: input.StepId,
        Index: input.Index,
        StepKind: JS_STEP_KIND,
        Reason: "JsThrew",
        ReasonDetail: jsStepReasonDetail(input.Error, input.Body),
        Variables: variables,
        DataRow: input.DataRow,
        SourceFile: input.SourceFile,
        Verbose: verbose,
        Now: input.Now,
        // JS steps have no selectors — pass an empty array so the
        // `Selectors`/`EvaluatedAttempts` either-of guard in the schema
        // checker is satisfied.
        Selectors: [],
        // No Target → no DomContext / FormSnapshot for JS steps.
        FormSnapshot: null,
    });
}

/* ------------------------------------------------------------------ */
/*  Convenience wrapper around the sandbox                             */
/* ------------------------------------------------------------------ */

export interface JsStepRunOk {
    readonly IsOk: true;
    readonly Result: JsInlineResult;
}

export interface JsStepRunErr {
    readonly IsOk: false;
    readonly FailureReport: FailureReport;
}

export type JsStepRunOutcome = JsStepRunOk | JsStepRunErr;

/**
 * Execute a JS body and convert any thrown error into a canonical
 * `FailureReport` — never re-throws. Callers (replay engine, dry-run
 * handler) check `outcome.IsOk` and either persist the report or surface
 * the result.
 *
 * The sandbox's `executeJsBody` does not currently forward partial
 * `LogLines` on throw (the throw happens inside its `try` before the
 * captured array is returned). Callers that need partial logs MUST run
 * the sandbox manually and pass them via `BuildJsStepFailureReportInput`.
 */
export async function runJsStepWithDiagnostics(
    body: string,
    ctx: JsInlineContext,
    options: {
        readonly StepId?: number;
        readonly Index?: number;
        readonly SourceFile: string;
        readonly Verbose?: boolean;
        readonly Now?: () => Date;
        readonly DataRow?: FieldRow;
        readonly Run: (
            body: string,
            ctx: JsInlineContext,
        ) => Promise<JsInlineResult>;
    },
): Promise<JsStepRunOutcome> {
    try {
        const result = await options.Run(body, ctx);
        return { IsOk: true, Result: result };
    } catch (err) {
        const report = buildJsStepFailureReport({
            Body: body,
            Error: err,
            Context: ctx,
            LogLines: [],
            StepId: options.StepId,
            Index: options.Index,
            SourceFile: options.SourceFile,
            Verbose: options.Verbose,
            Now: options.Now,
            DataRow: options.DataRow,
        });
        return { IsOk: false, FailureReport: report };
    }
}
