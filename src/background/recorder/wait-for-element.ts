/**
 * Marco Extension — Wait-For-Element Gate (Spec 19.2 unified)
 *
 * Thin adapter around {@link waitForCondition} that preserves the legacy
 * `WaitForSpec` shape used by `live-dom-replay.ts` and any external SDK
 * calls. All appearance polling now flows through the single canonical
 * primitive in `condition-evaluator.ts`, so behaviour, telemetry, and
 * failure diagnostics are unified per spec 19 §2.
 *
 * The legacy contract returned `{ Ok, ResolvedKind, Reason: "Timeout" |
 * "InvalidSelector", Detail }`. We map `waitForCondition`'s richer
 * outcome (`ConditionTimeout` / `InvalidSelector` + `LastEvaluation`)
 * back to that shape for callers that have not yet migrated.
 *
 * @see ./condition-evaluator.ts  — Canonical poll loop.
 * @see ./live-dom-replay.ts      — Primary caller (post-actuation gate).
 * @see spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md §2
 */

import {
    resolveSelectorKind,
    waitForCondition,
    type Condition,
    type Predicate,
} from "./condition-evaluator";

export type WaitForKind = "Auto" | "XPath" | "Css";
export type WaitForPredicate = "Exists" | "Visible";

export interface WaitForSpec {
    /** Selector expression — XPath or CSS. */
    readonly Expression: string;
    /** When `Auto` (default), `/` and `(` prefixes mean XPath, else CSS. */
    readonly Kind?: WaitForKind;
    /** Hard ceiling in ms. Caller must supply — no implicit default. */
    readonly TimeoutMs: number;
    /** Poll interval in ms. Defaults to 50 when omitted. */
    readonly PollMs?: number;
    /**
     * Predicate dialect — defaults to `Exists` for legacy `WaitFor` rows.
     * Per spec 19 §2.3, callers that need visibility MUST opt in.
     */
    readonly Predicate?: WaitForPredicate;
}

export type WaitForOutcome =
    | { readonly Ok: true;  readonly DurationMs: number; readonly ResolvedKind: "XPath" | "Css" }
    | { readonly Ok: false; readonly DurationMs: number; readonly Reason: "Timeout" | "InvalidSelector"; readonly Detail: string };

export interface WaitForOptions {
    readonly Doc: Document;
    readonly Sleep?: (ms: number) => Promise<void>;
    readonly Now?: () => number;
}

/**
 * Poll the document until `spec.Expression` resolves to an element or the
 * timeout elapses. Pure adapter — delegates to {@link waitForCondition}.
 */
export async function waitForElement(
    spec: WaitForSpec,
    options: WaitForOptions,
): Promise<WaitForOutcome> {
    const condition = synthesizeCondition(spec);
    const resolvedKind = resolveSelectorKind(spec.Kind ?? "Auto", spec.Expression);

    const result = await waitForCondition(condition, {
        Doc: options.Doc,
        TimeoutMs: spec.TimeoutMs,
        PollMs: spec.PollMs,
        Sleep: options.Sleep,
        Now: options.Now,
    });

    if (result.Ok) {
        return { Ok: true, DurationMs: result.DurationMs, ResolvedKind: resolvedKind };
    }
    return mapFailure(result.Reason, result.Detail, result.DurationMs, spec);
}

function synthesizeCondition(spec: WaitForSpec): Condition {
    const predicate: Predicate = {
        Selector: spec.Expression,
        SelectorKind: spec.Kind ?? "Auto",
        Matcher: { Kind: spec.Predicate === "Visible" ? "Visible" : "Exists" },
    };
    return predicate;
}

function mapFailure(
    reason: "ConditionTimeout" | "InvalidSelector",
    detail: string,
    durationMs: number,
    spec: WaitForSpec,
): WaitForOutcome {
    if (reason === "InvalidSelector") {
        return { Ok: false, DurationMs: durationMs, Reason: "InvalidSelector", Detail: detail };
    }
    return {
        Ok: false,
        DurationMs: durationMs,
        Reason: "Timeout",
        Detail: `WaitFor '${spec.Expression}' timed out after ${spec.TimeoutMs}ms`,
    };
}
