/**
 * Marco Extension — Failure-Report Adapters for New Instruction Families
 *
 * Spec 19 introduces three instruction families whose runtime modules emit
 * their own native error shapes:
 *
 *   - `UrlTabClick` (StepKindId=9)   → `UrlTabClickFailure`
 *   - `Wait` / `Gate` via condition  → `ConditionWaitOutcome` (Ok=false branch)
 *   - XPath/CSS conditional preds    → `ConditionWaitOutcome` (Ok=false branch)
 *
 * Per the project's verbose-logging-and-failure-diagnostics standard, every
 * failure surfaced to the user MUST be a `FailureReport` produced by
 * `buildFailureReport`. This module is the single chokepoint that maps the
 * native shapes onto `BuildFailureReportInput` so the canonical schema is
 * preserved and `validateFailureReportPayload` accepts them.
 *
 * Pure: no chrome.*, no DOM. The adapters take already-collected failure
 * data and return a built `FailureReport`.
 *
 * @see spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md
 * @see ./condition-evaluator.ts
 * @see ./condition-step.ts
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

import {
    buildFailureReport,
    type FailureReport,
} from "./failure-logger";
import type {
    Condition,
    ConditionWaitOutcome,
    PredicateEvaluation,
} from "./condition-evaluator";
import { resolveSelectorKind } from "./condition-evaluator";

/* ------------------------------------------------------------------ */
/*  UrlTabClick failure shape                                          */
/* ------------------------------------------------------------------ */

export type UrlTabClickReason =
    | "UrlTabClickTimeout"
    | "TabNotFound"
    | "InvalidUrlPattern"
    | "SelectorNotFound"
    | "UrlPatternMismatch";

export interface UrlTabClickFailure {
    readonly Reason: UrlTabClickReason;
    readonly Detail: string;
    readonly UrlPattern: string;
    readonly UrlMatch: "Exact" | "Prefix" | "Glob" | "Regex";
    readonly Mode: "OpenNew" | "FocusExisting" | "OpenOrFocus";
    readonly ObservedUrl?: string;
    readonly Selector?: string;
    readonly SelectorKind?: "Auto" | "XPath" | "Css";
    readonly TimeoutMs: number;
    readonly DurationMs: number;
}

export interface BuildUrlTabClickReportInput {
    readonly Failure: UrlTabClickFailure;
    readonly StepId: number;
    readonly Index: number;
    readonly DataRow?: Readonly<Record<string, string>>;
    readonly Verbose?: boolean;
    readonly Now?: () => Date;
}

/**
 * Map a `UrlTabClickFailure` into the canonical `FailureReport` schema.
 * Every produced report MUST carry `StepKind = "UrlTabClick"` and stamp
 * a `SourceFile` of the runtime that raised it.
 */
export function buildUrlTabClickFailureReport(
    input: BuildUrlTabClickReportInput,
): FailureReport {
    const f = input.Failure;
    const isTimeout = f.Reason === "UrlTabClickTimeout";
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error(`${f.Reason}: ${f.Detail}`),
        StepId: input.StepId,
        Index: input.Index,
        StepKind: "UrlTabClick",
        Reason: isTimeout ? "Timeout" : "Unknown",
        ReasonDetail: serializeUrlTabClickDetail(f),
        SourceFile: "src/background/recorder/url-tab-click.ts",
        DataRow: input.DataRow,
        Verbose: input.Verbose,
        FormSnapshot: null,
        Now: input.Now,
    });
}

function serializeUrlTabClickDetail(f: UrlTabClickFailure): string {
    const parts: string[] = [
        `Reason=${f.Reason}`,
        `Mode=${f.Mode}`,
        `UrlMatch=${f.UrlMatch}`,
        `Pattern=${f.UrlPattern}`,
        `TimeoutMs=${f.TimeoutMs}`,
        `DurationMs=${f.DurationMs}`,
    ];
    if (f.ObservedUrl !== undefined) parts.push(`ObservedUrl=${f.ObservedUrl}`);
    if (f.Selector !== undefined) parts.push(`Selector=${f.Selector}`);
    if (f.SelectorKind !== undefined) parts.push(`SelectorKind=${f.SelectorKind}`);
    parts.push(`Detail=${f.Detail}`);
    return parts.join(" | ");
}

/* ------------------------------------------------------------------ */
/*  Condition wait failure (covers Gate timeouts AND Condition step    */
/*  evaluation failures — both surface as ConditionWaitOutcome)         */
/* ------------------------------------------------------------------ */

export type ConditionFailureSource = "Gate" | "ConditionStep" | "Wait";

export interface BuildConditionFailureReportInput {
    readonly Outcome: Extract<ConditionWaitOutcome, { Ok: false }>;
    readonly Condition: Condition;
    readonly Source: ConditionFailureSource;
    readonly StepId: number;
    readonly Index: number;
    readonly StepKind: string;          // "Wait" | "Condition" | host action kind
    readonly DataRow?: Readonly<Record<string, string>>;
    readonly Verbose?: boolean;
    readonly Now?: () => Date;
}

/**
 * Build a canonical `FailureReport` for any condition-driven wait — used by
 * the inline `Step.Gate`, the legacy `WaitFor` synthesised gate, and the
 * dedicated `Condition` step kind. The full `Condition` tree is serialized
 * into `ReasonDetail` so AI debuggers can replay it offline.
 */
export function buildConditionFailureReport(
    input: BuildConditionFailureReportInput,
): FailureReport {
    const o = input.Outcome;
    const isTimeout = o.Reason === "ConditionTimeout";
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error(`${o.Reason}: ${o.Detail}`),
        StepId: input.StepId,
        Index: input.Index,
        StepKind: input.StepKind,
        Reason: isTimeout ? "Timeout" : "Unknown",
        ReasonDetail: serializeConditionDetail(input, o.LastEvaluation),
        SourceFile: sourceFileForSource(input.Source),
        DataRow: input.DataRow,
        Verbose: input.Verbose,
        FormSnapshot: null,
        Now: input.Now,
    });
}

function serializeConditionDetail(
    input: BuildConditionFailureReportInput,
    trace: ReadonlyArray<PredicateEvaluation>,
): string {
    const o = input.Outcome;
    const traceLines = trace.map(
        (p, i) =>
            `  [${i}] ${p.Kind} '${p.Selector}' ${p.Matcher}=${String(p.Result)}` +
            (p.Detail !== undefined ? ` (${p.Detail})` : ""),
    );
    const condJson = JSON.stringify(input.Condition, null, 2);
    return [
        `Reason=${o.Reason}`,
        `Source=${input.Source}`,
        `Polls=${o.Polls}`,
        `DurationMs=${o.DurationMs}`,
        `Detail=${o.Detail}`,
        `LastEvaluation:`,
        ...(traceLines.length > 0 ? traceLines : ["  (empty)"]),
        `ConditionSerialized:`,
        condJson,
    ].join("\n");
}

function sourceFileForSource(s: ConditionFailureSource): string {
    if (s === "Gate") return "src/background/recorder/condition-evaluator.ts";
    if (s === "ConditionStep") return "src/background/recorder/condition-step.ts";
    return "src/background/recorder/wait-for-element.ts";
}

/* ------------------------------------------------------------------ */
/*  XPath/CSS predicate failure (single-leaf convenience wrapper)      */
/* ------------------------------------------------------------------ */

export interface BuildSelectorPredicateReportInput {
    readonly Selector: string;
    readonly SelectorKind?: "Auto" | "XPath" | "Css";
    readonly Reason: "InvalidSelector" | "ZeroMatches" | "ConditionTimeout";
    readonly Detail: string;
    readonly StepId: number;
    readonly Index: number;
    readonly StepKind: string;
    readonly DataRow?: Readonly<Record<string, string>>;
    readonly Verbose?: boolean;
    readonly Now?: () => Date;
}

/**
 * Convenience wrapper for failures coming from a SINGLE selector predicate
 * (e.g. a malformed XPath, or an `Exists` predicate that never matched).
 * Wraps the leaf in a one-node condition tree so the canonical detail
 * string still includes a serialized `ConditionSerialized` block.
 */
export function buildSelectorPredicateFailureReport(
    input: BuildSelectorPredicateReportInput,
): FailureReport {
    const kind = resolveSelectorKind(input.SelectorKind ?? "Auto", input.Selector);
    const isTimeout = input.Reason === "ConditionTimeout";
    const reason = isTimeout ? "Timeout"
        : input.Reason === "InvalidSelector"
            ? (kind === "XPath" ? "XPathSyntaxError" : "CssSyntaxError")
            : "ZeroMatches";

    const trace: PredicateEvaluation[] = [{
        Selector: input.Selector,
        Kind: kind,
        Matcher: "Exists",
        Result: false,
        Detail: input.Detail,
    }];

    return buildFailureReport({
        Phase: "Replay",
        Error: new Error(`${input.Reason}: ${input.Detail}`),
        StepId: input.StepId,
        Index: input.Index,
        StepKind: input.StepKind,
        Reason: reason,
        ReasonDetail: [
            `Reason=${input.Reason}`,
            `Selector=${input.Selector}`,
            `Kind=${kind}`,
            `Detail=${input.Detail}`,
            `LastEvaluation:`,
            `  [0] ${trace[0]!.Kind} '${trace[0]!.Selector}' ${trace[0]!.Matcher}=false (${input.Detail})`,
        ].join("\n"),
        SourceFile: "src/background/recorder/condition-evaluator.ts",
        DataRow: input.DataRow,
        Verbose: input.Verbose,
        FormSnapshot: null,
        Now: input.Now,
    });
}
