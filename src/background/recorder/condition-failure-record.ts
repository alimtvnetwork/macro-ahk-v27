/**
 * Marco Extension — Condition Failure Record (Spec 19 §3.4)
 *
 * Canonical structured shape every failed condition path MUST emit. Pure
 * — no DOM, no chrome.*, no async. Buildable from the
 * {@link ConditionWaitOutcome} returned by `waitForCondition`, plus the
 * caller-supplied execution context (Vars / Row / LogTail).
 *
 * Field-by-field this satisfies §3.4 of
 * `spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md` and
 * matches the failure-diagnostics contract from
 * `mem://standards/verbose-logging-and-failure-diagnostics`.
 *
 * @see ./condition-evaluator.ts — Producer of the wait outcome.
 * @see ./condition-failure-flatten.ts — XPath/Selector flattener.
 */

import type {
    ConditionWaitOutcome,
    Condition,
    PredicateEvaluation,
} from "./condition-evaluator";
import { flattenConditionSelectors } from "./condition-failure-flatten";

export type ConditionFailureReason =
    | "ConditionTimeout"
    | "InvalidSelector"
    | "InvalidUrlPattern"
    | "RouteLoopDetected"
    | "InvalidRouteTarget";

export interface ConditionFailureRecord {
    readonly Reason: ConditionFailureReason;
    readonly ConditionSerialized: string;
    readonly LastEvaluation: ReadonlyArray<PredicateEvaluation>;
    readonly Selectors: ReadonlyArray<string>;
    readonly XPath: ReadonlyArray<string>;
    readonly Vars: Readonly<Record<string, string>>;
    readonly Row: Readonly<Record<string, string>>;
    readonly LogTail: ReadonlyArray<string>;
}

export interface BuildFailureRecordInput {
    readonly Condition: Condition;
    readonly Outcome: Extract<ConditionWaitOutcome, { Ok: false }>;
    readonly Vars?: Readonly<Record<string, string>>;
    readonly Row?: Readonly<Record<string, string>>;
    readonly LogTail?: ReadonlyArray<string>;
    /** Override `Outcome.Reason` with one of the URL/route reasons. */
    readonly ReasonOverride?: ConditionFailureReason;
}

/** Cap on `LogTail` entries per `mem://standards/...` (≤200 lines). */
export const MAX_LOG_TAIL = 200;

export function buildConditionFailureRecord(
    input: BuildFailureRecordInput,
): ConditionFailureRecord {
    const flat = flattenConditionSelectors(input.Condition);
    return {
        Reason: input.ReasonOverride ?? input.Outcome.Reason,
        ConditionSerialized: serializeCondition(input.Condition),
        LastEvaluation: input.Outcome.LastEvaluation,
        Selectors: flat.Selectors,
        XPath: flat.XPath,
        Vars: input.Vars ?? {},
        Row: input.Row ?? {},
        LogTail: trimLogTail(input.LogTail ?? []),
    };
}

function serializeCondition(c: Condition): string {
    return JSON.stringify(c, null, 2);
}

function trimLogTail(lines: ReadonlyArray<string>): ReadonlyArray<string> {
    if (lines.length <= MAX_LOG_TAIL) return lines;
    return lines.slice(lines.length - MAX_LOG_TAIL);
}
