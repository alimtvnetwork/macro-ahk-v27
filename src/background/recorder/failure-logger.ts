/**
 * Marco Extension — Recorder Failure Logger
 *
 * Single shared formatter for any failure raised during the macro
 * recorder's two pipelines: **Record** (capturing + persisting Steps) and
 * **Replay** (executing persisted Steps against the live DOM).
 *
 * The output is a structured `FailureReport` JSON document optimised for
 * AI debugging — the user can copy it from a toast or DevTools and paste
 * it directly into ChatGPT/Claude. Every report carries:
 *
 *   - `Phase`            — `"Record" | "Replay"`, the pipeline that failed.
 *   - `Message`          — short human-readable summary.
 *   - `StackTrace`       — `Error.stack` when available.
 *   - `Selectors`        — every selector kind/expression the executor tried.
 *   - `DomContext`       — tag/id/class/aria-label/text snippet of the
 *                          target element (replay) or capture element
 *                          (record), so the AI can spot selector drift.
 *   - `DataRow`          — active `{{Column}}` row at failure time, optional.
 *   - `StepId`/`Index`   — locate the step in the project's Step list.
 *   - `Timestamp`        — ISO string, deterministic via injected `Now`.
 *
 * Pure: no DOM mutation, no chrome.*, no async. The DOM read for
 * `DomContext` is a single `getBoundingClientRect`-free pass that tolerates
 * `null`/detached nodes.
 *
 * Conformance:
 *   - Every error site stamps an exact source location and tried-selector
 *     list per `spec/03-error-manage` rules ("HARD ERROR logs must include
 *     exact path, what was missing, and reasoning — optimized for AI
 *     consumption" — mem://standards/error-logging-requirements).
 *
 * @see spec/03-error-manage/01-error-resolution/06-error-documentation-guideline.md
 * @see ./live-dom-replay.ts          — Replay-phase caller.
 * @see ./capture-to-step-bridge.ts   — Record-phase data shape.
 */

import type { PersistedSelector } from "./step-persistence";
import type { FieldRow, VariableContext } from "./field-reference-resolver";
import type {
    EvaluatedAttempt,
    AttemptFailureReason,
} from "./selector-attempt-evaluator";
import { xpathOfElement } from "./xpath-of-element";
import {
    captureFormSnapshot,
    type FormSnapshot,
} from "./form-snapshot";

export type { VariableContext } from "./field-reference-resolver";
export type { FormSnapshot } from "./form-snapshot";

export type FailurePhase = "Record" | "Replay";

/**
 * Top-level short-code classifying the failure for AI grouping.
 * Stable string values — UI / exporters key off these.
 */
export type FailureReasonCode =
    // ---- Variable / data-row failures (highest priority — explain WHY the
    //      step had bad inputs before any selector was even tried). --------
    | "VariableMissing"        // {{Token}} references a column not in the row.
    | "VariableNull"           // Column exists but value is null.
    | "VariableUndefined"      // Column exists but value is undefined.
    | "VariableEmpty"          // Column exists but value is "".
    | "VariableTypeMismatch"   // Column present but wrong type for this step.
    // ---- Selector failures ------------------------------------------------
    | "ZeroMatches"            // No selector (primary or fallback) matched anything.
    | "PrimaryMissedFallbackOk" // Primary missed but a fallback matched — drift.
    | "XPathSyntaxError"       // At least one XPath threw during evaluation.
    | "CssSyntaxError"         // At least one CSS selector threw.
    | "UnresolvedAnchor"       // XPathRelative anchor chain broken / cyclic.
    | "EmptyExpression"        // A stored expression was "".
    | "NoSelectors"            // Step had zero selectors persisted.
    // ---- Other ------------------------------------------------------------
    | "Timeout"                // Wait/Retry exceeded budget (set by callers).
    | "JsThrew"                // JsInline step threw inside the sandbox.
    | "Unknown";               // Caller did not classify — last resort.

export interface SelectorAttempt {
    readonly SelectorId: number | null;
    readonly Strategy: string;             // "XPathFull" | "XPathRelative" | "Css" | "Aria" | …
    readonly Expression: string;           // Stored expression (may be relative).
    readonly ResolvedExpression: string;   // Anchor-joined expression actually evaluated.
    readonly IsPrimary: boolean;
    readonly Matched: boolean;
    readonly MatchCount: number;
    readonly FailureReason: AttemptFailureReason | "NotEvaluated";
    readonly FailureDetail: string | null;
}

export interface DomContext {
    readonly TagName: string;
    readonly Id: string | null;
    readonly ClassName: string | null;
    readonly AriaLabel: string | null;
    readonly Name: string | null;
    readonly Type: string | null;
    readonly TextSnippet: string;       // Always truncated to 120 chars (legacy contract).
    readonly OuterHtmlSnippet: string;  // Always truncated to 240 chars (legacy contract).
    /**
     * Absolute XPath of the captured element. Populated by `readDomContext`
     * when a target Element is supplied. Optional so external producers
     * (selector-comparison, selector-tester, fixtures) can omit it without
     * a forced migration; the verbose-logging spec requires it whenever a
     * fresh DOM read happens via `readDomContext`.
     */
    readonly XPath?: string;
    /**
     * Full untruncated outerHTML of the captured element. Populated ONLY
     * when the failure report is built with `Verbose: true`. Omitted on
     * non-verbose runs to keep the SQLite/OPFS payload small.
     */
    readonly OuterHtml?: string;
    /**
     * Full untruncated textContent. Populated ONLY when `Verbose: true`.
     */
    readonly Text?: string;
}

export interface FailureReport {
    readonly Phase: FailurePhase;
    readonly Message: string;
    readonly Reason: FailureReasonCode;
    readonly ReasonDetail: string;
    readonly StackTrace: string | null;
    readonly StepId: number | null;
    readonly Index: number | null;
    readonly StepKind: string | null;
    readonly Selectors: ReadonlyArray<SelectorAttempt>;
    readonly Variables: ReadonlyArray<VariableContext>;
    readonly DomContext: DomContext | null;
    readonly DataRow: FieldRow | null;
    readonly ResolvedXPath: string | null;
    readonly Timestamp: string;
    readonly SourceFile: string;
    /**
     * Was this report built with the verbose toggle ON? Persisted alongside
     * the report so future readers can tell whether `CapturedHtml` /
     * `DomContext.OuterHtml` / `DomContext.Text` are full or omitted.
     */
    readonly Verbose: boolean;
    /**
     * Full outerHTML of the matched/expected element. Populated ONLY when
     * `Verbose === true`. Always identical to `DomContext.OuterHtml` when
     * both are present — surfaced at top level for easier export tooling.
     */
    readonly CapturedHtml: string | null;
    /**
     * Snapshot of the form/inputs surrounding the failing step, captured
     * by `captureFormSnapshot`. Field metadata (names, types, required) is
     * ALWAYS populated when a form is reachable from the target — this
     * lets a debugger see "did the user even fill in 'email'?". Raw
     * values are present only when `Verbose === true`. Null when the
     * step has no nearby form or the caller passed `FormSnapshot: false`.
     *
     * See mem://features/form-snapshot-capture and
     * mem://standards/verbose-logging-and-failure-diagnostics.
     */
    readonly FormSnapshot: FormSnapshot | null;
}

export interface BuildFailureReportInput {
    readonly Phase: FailurePhase;
    readonly Error: unknown;
    readonly StepId?: number;
    readonly Index?: number;
    readonly StepKind?: string;
    /**
     * Persisted selectors as stored in the per-project DB. Used as a
     * fallback when `EvaluatedAttempts` is not supplied (e.g. Record
     * phase, where no live DOM evaluation happened).
     */
    readonly Selectors?: ReadonlyArray<PersistedSelector>;
    /**
     * Live-DOM evaluation outcomes, one per selector. When present this
     * supersedes `Selectors` because it carries Matched/MatchCount/Reason
     * per attempt — exactly what AI debuggers need.
     */
    readonly EvaluatedAttempts?: ReadonlyArray<EvaluatedAttempt>;
    readonly Target?: Element | null;
    readonly DataRow?: FieldRow;
    /**
     * Per-variable diagnostics for any `{{Token}}` referenced by the step's
     * Value template. Caller produces this with
     * `resolveFieldReferencesDetailed`. Drives the top-level Reason when
     * any variable failed (variable failures outrank selector failures
     * because they explain WHY the step had bad inputs to begin with).
     */
    readonly Variables?: ReadonlyArray<VariableContext>;
    readonly ResolvedXPath?: string;
    readonly SourceFile: string;        // e.g. "src/background/recorder/live-dom-replay.ts"
    /** Caller-supplied classification. Auto-derived from attempts/variables when omitted. */
    readonly Reason?: FailureReasonCode;
    readonly ReasonDetail?: string;
    /**
     * Verbose-logging toggle (per
     * mem://standards/verbose-logging-and-failure-diagnostics). When
     * `true`, the produced report includes the full untruncated outerHTML
     * + textContent of the captured `Target` and a top-level
     * `CapturedHtml` field. Default `false` keeps the legacy 120/240-char
     * truncation behavior. Callers MUST resolve this from
     * `resolveVerboseLogging(projectId)` — never hard-code `true`.
     */
    readonly Verbose?: boolean;
    /**
     * Pre-captured form snapshot from the recorder (preferred when the
     * step already carries one). When absent and a `Target` is supplied,
     * the failure logger captures one inline using `captureFormSnapshot`
     * with the same `Verbose` flag. Pass `null` explicitly to suppress.
     */
    readonly FormSnapshot?: FormSnapshot | null;
    readonly Now?: () => Date;
}

const SELECTOR_KIND_NAMES: Readonly<Record<number, string>> = {
    1: "XPathFull",
    2: "XPathRelative",
    3: "Css",
    4: "Aria",
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function buildFailureReport(input: BuildFailureReportInput): FailureReport {
    const now = input.Now ?? defaultNow;
    const message = extractMessage(input.Error);
    const stack = extractStack(input.Error);

    const attempts: ReadonlyArray<SelectorAttempt> =
        input.EvaluatedAttempts !== undefined
            ? input.EvaluatedAttempts.map(toAttemptFromEvaluated)
            : (input.Selectors ?? []).map(toAttemptFromPersisted);

    const variables: ReadonlyArray<VariableContext> = input.Variables ?? [];
    const { Reason, ReasonDetail } = classifyReason(input, attempts, variables, message);

    const verbose = input.Verbose === true;
    const domContext = input.Target ? readDomContext(input.Target, verbose) : null;
    const capturedHtml = verbose && domContext !== null
        ? (domContext.OuterHtml ?? null)
        : null;

    // Form snapshot precedence:
    //   1. Caller-supplied (recorder already attached one to the step) — use as-is.
    //   2. Caller passed `null` — explicit suppression.
    //   3. Otherwise capture fresh from the live Target using the same verbose flag.
    let formSnapshot: FormSnapshot | null = null;
    if (input.FormSnapshot !== undefined) {
        formSnapshot = input.FormSnapshot;
    } else if (input.Target) {
        formSnapshot = captureFormSnapshot(input.Target, { Verbose: verbose, Now: now });
    }

    return {
        Phase: input.Phase,
        Message: message,
        Reason,
        ReasonDetail,
        StackTrace: stack,
        StepId: input.StepId ?? null,
        Index: input.Index ?? null,
        StepKind: input.StepKind ?? null,
        Selectors: attempts,
        Variables: input.Variables ?? [],
        DomContext: domContext,
        DataRow: input.DataRow ?? null,
        ResolvedXPath: input.ResolvedXPath ?? null,
        Timestamp: now().toISOString(),
        SourceFile: input.SourceFile,
        Verbose: verbose,
        CapturedHtml: capturedHtml,
        FormSnapshot: formSnapshot,
    };
}

/**
 * Auto-classify the failure when the caller did not supply a Reason.
 *
 * Precedence (highest first):
 *   - Caller-supplied Reason       → wins
 *   - Variable failures (any)      → "VariableMissing" / "VariableNull" /
 *                                    "VariableUndefined" / "VariableEmpty" /
 *                                    "VariableTypeMismatch"
 *   - No selectors                 → "NoSelectors"
 *   - Any attempt threw XPath      → "XPathSyntaxError"
 *   - Any attempt threw CSS        → "CssSyntaxError"
 *   - Any anchor unresolved        → "UnresolvedAnchor"
 *   - Any expression empty         → "EmptyExpression"
 *   - Primary missed, fallback OK  → "PrimaryMissedFallbackOk"
 *   - All attempts returned 0      → "ZeroMatches"
 *   - Otherwise                    → "Unknown"
 */
function classifyReason(
    input: BuildFailureReportInput,
    attempts: ReadonlyArray<SelectorAttempt>,
    variables: ReadonlyArray<VariableContext>,
    message: string,
): { Reason: FailureReasonCode; ReasonDetail: string } {
    if (input.Reason !== undefined) {
        return {
            Reason: input.Reason,
            ReasonDetail: input.ReasonDetail ?? message,
        };
    }
    // Variable failures explain WHY the step's inputs were wrong before we
    // even tried the DOM — surface them first.
    const failedVar = variables.find((v) => v.FailureReason !== "Resolved");
    if (failedVar !== undefined) {
        const code = variableReasonToCode(failedVar.FailureReason);
        const detail = failedVar.FailureDetail ?? `Variable {{${failedVar.Name}}} failed.`;
        return { Reason: code, ReasonDetail: detail };
    }
    if (attempts.length === 0) {
        return { Reason: "NoSelectors", ReasonDetail: "Step has no persisted selectors to try." };
    }
    const reasons = new Set(attempts.map((a) => a.FailureReason));
    if (reasons.has("XPathSyntaxError")) {
        return { Reason: "XPathSyntaxError", ReasonDetail: firstDetail(attempts, "XPathSyntaxError") };
    }
    if (reasons.has("CssSyntaxError")) {
        return { Reason: "CssSyntaxError", ReasonDetail: firstDetail(attempts, "CssSyntaxError") };
    }
    if (reasons.has("UnresolvedAnchor")) {
        return { Reason: "UnresolvedAnchor", ReasonDetail: firstDetail(attempts, "UnresolvedAnchor") };
    }
    if (reasons.has("EmptyExpression")) {
        return { Reason: "EmptyExpression", ReasonDetail: firstDetail(attempts, "EmptyExpression") };
    }
    const primary = attempts.find((a) => a.IsPrimary) ?? null;
    const anyFallbackMatched = attempts.some((a) => !a.IsPrimary && a.Matched);
    if (primary !== null && !primary.Matched && anyFallbackMatched) {
        return {
            Reason: "PrimaryMissedFallbackOk",
            ReasonDetail:
                `Primary selector '${primary.ResolvedExpression}' missed; ` +
                `${attempts.filter((a) => !a.IsPrimary && a.Matched).length} fallback(s) matched.`,
        };
    }
    // Only claim ZeroMatches when at least one attempt was actually
    // evaluated against the live DOM — pure persisted selectors have
    // FailureReason === "NotEvaluated" and must not be misreported.
    const anyEvaluated = attempts.some((a) => a.FailureReason !== "NotEvaluated");
    if (anyEvaluated && attempts.every((a) => !a.Matched && a.MatchCount === 0)) {
        return {
            Reason: "ZeroMatches",
            ReasonDetail:
                `All ${attempts.length} selector(s) returned 0 nodes. ` +
                `Tried: ${attempts.map((a) => a.ResolvedExpression).join(" | ")}`,
        };
    }
    return { Reason: "Unknown", ReasonDetail: message };
}

function firstDetail(attempts: ReadonlyArray<SelectorAttempt>, code: AttemptFailureReason | "NotEvaluated"): string {
    const hit = attempts.find((a) => a.FailureReason === code);
    return hit?.FailureDetail ?? `Attempt failed with ${code}.`;
}

function variableReasonToCode(reason: VariableContext["FailureReason"]): FailureReasonCode {
    if (reason === "MissingColumn")   { return "VariableMissing"; }
    if (reason === "NullValue")       { return "VariableNull"; }
    if (reason === "UndefinedValue")  { return "VariableUndefined"; }
    if (reason === "EmptyString")     { return "VariableEmpty"; }
    if (reason === "TypeMismatch")    { return "VariableTypeMismatch"; }
    return "Unknown";
}

/**
 * Serializes a report to a multi-line block suitable for `console.error` or
 * a clipboard paste into AI chat. Format:
 *
 * ```
 * [MarcoReplay] Element not found for selector '#go'
 *   Reason: PrimaryMissedFallbackOk — Primary missed; 1 fallback matched.
 *   at src/background/recorder/live-dom-replay.ts StepId=42 Index=3
 *   Selectors:
 *     ✗ ✓ XPathFull   //button[@id='go'] → 0 matches (ZeroMatches: …)
 *     ✓ · Css         #go                → 1 matches
 *   DomContext: <button id="go" class="primary"> "Go"
 *   DataRow: { "Email": "alice@example.com" }
 *   Stack:
 *     <stack lines>
 * ```
 */
export function formatFailureReport(report: FailureReport): string {
    const tag = `[Marco${report.Phase}]`;
    const lines: string[] = [];
    lines.push(`${tag} ${report.Message}`);
    lines.push(`  Reason: ${report.Reason} — ${report.ReasonDetail}`);

    const where: string[] = [`at ${report.SourceFile}`];
    if (report.StepId !== null) where.push(`StepId=${report.StepId}`);
    if (report.Index !== null)  where.push(`Index=${report.Index}`);
    if (report.StepKind !== null) where.push(`Kind=${report.StepKind}`);
    lines.push(`  ${where.join(" ")}`);

    if (report.Selectors.length > 0) {
        lines.push("  Selectors:");
        for (const s of report.Selectors) {
            const matchMark = s.Matched ? "✓" : "✗";
            const primaryMark = s.IsPrimary ? "✓" : "·";
            const expr = s.ResolvedExpression.length > 0 ? s.ResolvedExpression : s.Expression;
            const tail = s.Matched
                ? `→ ${s.MatchCount} match${s.MatchCount === 1 ? "" : "es"}`
                : `→ ${s.MatchCount} matches (${s.FailureReason}${s.FailureDetail !== null ? `: ${s.FailureDetail}` : ""})`;
            lines.push(`    ${matchMark} ${primaryMark} ${s.Strategy.padEnd(13)} ${expr} ${tail}`);
        }
    }

    if (report.Variables.length > 0) {
        lines.push("  Variables:");
        for (const v of report.Variables) {
            const ok = v.FailureReason === "Resolved";
            const mark = ok ? "✓" : "✗";
            const valueLabel = v.ResolvedValue === null ? "<null>" : JSON.stringify(v.ResolvedValue);
            const tail = ok
                ? `${valueLabel} [${v.ValueType}] from ${v.Source}`
                : `${valueLabel} [${v.ValueType}] from ${v.Source} — ${v.FailureReason}${v.FailureDetail !== null ? `: ${v.FailureDetail}` : ""}`;
            lines.push(`    ${mark} {{${v.Name}}} = ${tail}`);
        }
    }

    if (report.ResolvedXPath !== null) {
        lines.push(`  ResolvedXPath: ${report.ResolvedXPath}`);
    }

    if (report.DomContext !== null) {
        const ctx = report.DomContext;
        const attrs: string[] = [];
        if (ctx.Id !== null)        attrs.push(`id="${ctx.Id}"`);
        if (ctx.ClassName !== null) attrs.push(`class="${ctx.ClassName}"`);
        if (ctx.Name !== null)      attrs.push(`name="${ctx.Name}"`);
        if (ctx.Type !== null)      attrs.push(`type="${ctx.Type}"`);
        if (ctx.AriaLabel !== null) attrs.push(`aria-label="${ctx.AriaLabel}"`);
        const attrStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
        const text = ctx.TextSnippet.length > 0 ? ` "${ctx.TextSnippet}"` : "";
        lines.push(`  DomContext: <${ctx.TagName}${attrStr}>${text}`);
        if (ctx.XPath !== undefined && ctx.XPath.length > 0) {
            lines.push(`    XPath: ${ctx.XPath}`);
        }
    }

    if (report.Verbose && report.CapturedHtml !== null) {
        lines.push(`  CapturedHtml (verbose):`);
        lines.push(`    ${report.CapturedHtml}`);
    }

    if (report.DataRow !== null) {
        lines.push(`  DataRow: ${JSON.stringify(report.DataRow)}`);
    }

    if (report.StackTrace !== null) {
        lines.push("  Stack:");
        for (const line of report.StackTrace.split("\n")) {
            lines.push(`    ${line.trim()}`);
        }
    }

    return lines.join("\n");
}

/**
 * Single entry point used by both pipelines. Writes the structured report
 * to `console.error` with the phase prefix and returns the report so the
 * caller can persist `JSON.stringify(report)` into the project DB and/or
 * surface a copy-to-clipboard toast.
 */
export function logFailure(input: BuildFailureReportInput): FailureReport {
    const report = buildFailureReport(input);
    // eslint-disable-next-line no-console
    console.error(formatFailureReport(report));
    return report;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    try { return JSON.stringify(err); } catch { return String(err); }
}

function extractStack(err: unknown): string | null {
    if (err instanceof Error && typeof err.stack === "string") return err.stack;
    return null;
}

function toAttemptFromPersisted(s: PersistedSelector): SelectorAttempt {
    // Record-phase fallback: no live evaluation happened, so Matched /
    // MatchCount / FailureReason are reported as "NotEvaluated" so the
    // consumer can tell apart "we tried and it missed" vs "we never tried".
    return {
        SelectorId: s.SelectorId,
        Strategy: SELECTOR_KIND_NAMES[s.SelectorKindId] ?? `Kind${s.SelectorKindId}`,
        Expression: s.Expression,
        ResolvedExpression: s.Expression,
        IsPrimary: s.IsPrimary === 1,
        Matched: false,
        MatchCount: 0,
        FailureReason: "NotEvaluated",
        FailureDetail: null,
    };
}

function toAttemptFromEvaluated(a: EvaluatedAttempt): SelectorAttempt {
    return {
        SelectorId: a.SelectorId,
        Strategy: a.Strategy,
        Expression: a.Expression,
        ResolvedExpression: a.ResolvedExpression,
        IsPrimary: a.IsPrimary,
        Matched: a.Matched,
        MatchCount: a.MatchCount,
        FailureReason: a.FailureReason,
        FailureDetail: a.FailureDetail,
    };
}

function readDomContext(el: Element, verbose: boolean): DomContext {
    const id = el.getAttribute("id");
    const cls = el.getAttribute("class");
    const aria = el.getAttribute("aria-label");
    const name = el.getAttribute("name");
    const type = el.getAttribute("type");
    const fullText = (el.textContent ?? "").trim();
    const fullOuter = el.outerHTML ?? "";
    const text = fullText.slice(0, 120);
    const outer = fullOuter.slice(0, 240);
    const xpath = xpathOfElement(el);
    const base: DomContext = {
        TagName: el.tagName.toLowerCase(),
        Id: id !== null && id.length > 0 ? id : null,
        ClassName: cls !== null && cls.length > 0 ? cls : null,
        AriaLabel: aria !== null && aria.length > 0 ? aria : null,
        Name: name !== null && name.length > 0 ? name : null,
        Type: type !== null && type.length > 0 ? type : null,
        TextSnippet: text,
        OuterHtmlSnippet: outer,
        XPath: xpath,
    };
    if (verbose) {
        return { ...base, OuterHtml: fullOuter, Text: fullText };
    }
    return base;
}

function defaultNow(): Date {
    return new Date();
}
