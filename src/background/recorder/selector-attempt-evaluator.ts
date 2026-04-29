/**
 * Marco Extension — Selector Attempt Evaluator
 *
 * Pure helper that evaluates **every** persisted selector for a Step
 * (primary first, then each fallback in declaration order) against a live
 * `Document` and produces a structured `EvaluatedAttempt[]` array.
 *
 * Used by the replay path so failure logs always carry the full XPath /
 * CSS / Aria expression that was tried, the `Matched` outcome, the
 * `MatchCount`, and a concrete per-attempt `FailureReason` short-code.
 *
 * Why a separate module: `replay-resolver.ts` only resolves the **primary**
 * selector — fallbacks are not actually executed at replay time today.
 * For diagnostics we need to know what each fallback *would have done*, so
 * AI debuggers can tell whether ANY recorded selector still matches.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics — every
 *     selector failure MUST include the full attempts array with
 *     Strategy/Expression/Matched/MatchCount/FailureReason.
 *   - mem://constraints/no-retry-policy — this module does NOT retry, it
 *     records what each selector returns once.
 *
 * @see ./failure-logger.ts        — Consumer (EvaluatedAttempts → Selectors).
 * @see ./replay-resolver.ts       — Primary-only path used for actual replay.
 * @see ./live-dom-replay.ts       — Caller on the failure path.
 */

import { SelectorKindId } from "../recorder-db-schema";
import type { PersistedSelector } from "./step-persistence";

/**
 * Per-attempt outcome enum. Short, machine-readable codes — keep values
 * stable, downstream UI groups by string equality.
 */
export type AttemptFailureReason =
    | "Matched"               // Not a failure — kept so the union covers OK rows.
    | "ZeroMatches"           // Expression evaluated cleanly but returned 0 nodes.
    | "XPathSyntaxError"      // doc.evaluate threw.
    | "CssSyntaxError"        // querySelector threw.
    | "UnresolvedAnchor"      // XPathRelative pointed at a missing/cyclic anchor.
    | "EmptyExpression"       // Stored expression is "" — recorder bug or stale data.
    | "EvaluationThrew";      // Catch-all for unexpected DOM exceptions.

export type AttemptStrategy = "XPathFull" | "XPathRelative" | "Css" | "Aria" | "Unknown";

export interface EvaluatedAttempt {
    readonly SelectorId: number;
    readonly Strategy: AttemptStrategy;
    readonly Expression: string;            // Stored expression (may be relative).
    readonly ResolvedExpression: string;    // Anchor-joined / final expression actually evaluated.
    readonly IsPrimary: boolean;
    readonly Matched: boolean;
    readonly MatchCount: number;
    readonly FailureReason: AttemptFailureReason;
    readonly FailureDetail: string | null;  // Human sentence; null when Matched.
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Evaluates every selector in declaration order (primary always first in
 * the returned array regardless of input order). Never throws — every
 * exception is converted to an `EvaluatedAttempt` row with a
 * `FailureReason` short-code and `FailureDetail` sentence.
 */
export function evaluateAllSelectors(
    selectors: ReadonlyArray<PersistedSelector>,
    doc: Document,
): ReadonlyArray<EvaluatedAttempt> {
    if (selectors.length === 0) { return []; }

    const byId = new Map(selectors.map((s) => [s.SelectorId, s]));
    const ordered = orderPrimaryFirst(selectors);

    return ordered.map((s) => evaluateOne(s, byId, doc));
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

const MAX_ANCHOR_DEPTH = 16;

function orderPrimaryFirst(
    selectors: ReadonlyArray<PersistedSelector>,
): ReadonlyArray<PersistedSelector> {
    const primary = selectors.filter((s) => s.IsPrimary === 1);
    const fallback = selectors.filter((s) => s.IsPrimary !== 1);
    return [...primary, ...fallback];
}

function evaluateOne(
    selector: PersistedSelector,
    byId: Map<number, PersistedSelector>,
    doc: Document,
): EvaluatedAttempt {
    const strategy = strategyOf(selector.SelectorKindId);
    const isPrimary = selector.IsPrimary === 1;

    if (selector.Expression.length === 0) {
        return failure(selector, strategy, isPrimary, "", "EmptyExpression",
            "Stored Expression is empty — recorder produced no value or row was corrupted.");
    }

    let resolved: string;
    try {
        resolved = resolveExpression(selector, byId);
    } catch (err) {
        return failure(selector, strategy, isPrimary, "", "UnresolvedAnchor",
            extractMessage(err));
    }

    if (strategy === "Css" || strategy === "Aria") {
        return evaluateCss(selector, strategy, isPrimary, resolved, doc);
    }
    return evaluateXPath(selector, strategy, isPrimary, resolved, doc);
}

function evaluateXPath(
    selector: PersistedSelector,
    strategy: AttemptStrategy,
    isPrimary: boolean,
    expression: string,
    doc: Document,
): EvaluatedAttempt {
    let count = 0;
    try {
        const r = doc.evaluate(
            expression, doc, null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
        );
        count = r.snapshotLength;
    } catch (err) {
        return failure(selector, strategy, isPrimary, expression, "XPathSyntaxError",
            extractMessage(err));
    }
    if (count === 0) {
        return failure(selector, strategy, isPrimary, expression, "ZeroMatches",
            `XPath '${expression}' returned 0 nodes.`);
    }
    return success(selector, strategy, isPrimary, expression, count);
}

function evaluateCss(
    selector: PersistedSelector,
    strategy: AttemptStrategy,
    isPrimary: boolean,
    expression: string,
    doc: Document,
): EvaluatedAttempt {
    let count = 0;
    try {
        const list = doc.querySelectorAll(expression);
        count = list.length;
    } catch (err) {
        return failure(selector, strategy, isPrimary, expression, "CssSyntaxError",
            extractMessage(err));
    }
    if (count === 0) {
        return failure(selector, strategy, isPrimary, expression, "ZeroMatches",
            `Selector '${expression}' returned 0 nodes.`);
    }
    return success(selector, strategy, isPrimary, expression, count);
}

function resolveExpression(
    selector: PersistedSelector,
    byId: Map<number, PersistedSelector>,
): string {
    return resolveOne(selector, byId, [], 0);
}

function resolveOne(
    selector: PersistedSelector,
    byId: Map<number, PersistedSelector>,
    chain: number[],
    depth: number,
): string {
    if (depth > MAX_ANCHOR_DEPTH) {
        throw new Error(`Anchor chain exceeded max depth ${MAX_ANCHOR_DEPTH} — cycle suspected.`);
    }
    if (chain.includes(selector.SelectorId)) {
        throw new Error(`Cycle detected in anchor chain at SelectorId ${selector.SelectorId}.`);
    }
    chain.push(selector.SelectorId);

    if (selector.SelectorKindId === SelectorKindId.XPathRelative) {
        if (selector.AnchorSelectorId === null) {
            throw new Error(`XPathRelative selector ${selector.SelectorId} has no AnchorSelectorId.`);
        }
        const anchor = byId.get(selector.AnchorSelectorId);
        if (anchor === undefined) {
            throw new Error(`Anchor selector ${selector.AnchorSelectorId} not in provided set.`);
        }
        const anchorXPath = resolveOne(anchor, byId, chain, depth + 1);
        return joinRelative(anchorXPath, selector.Expression);
    }
    return selector.Expression;
}

function joinRelative(anchor: string, relative: string): string {
    const stripped = relative.startsWith(".") ? relative.slice(1) : relative;
    if (stripped.length === 0) { return anchor; }
    if (stripped.startsWith("/")) { return `${anchor}${stripped}`; }
    return `${anchor}/${stripped}`;
}

function strategyOf(kindId: number): AttemptStrategy {
    if (kindId === SelectorKindId.XPathFull) { return "XPathFull"; }
    if (kindId === SelectorKindId.XPathRelative) { return "XPathRelative"; }
    if (kindId === SelectorKindId.Css) { return "Css"; }
    if (kindId === SelectorKindId.Aria) { return "Aria"; }
    return "Unknown";
}

function success(
    selector: PersistedSelector,
    strategy: AttemptStrategy,
    isPrimary: boolean,
    resolved: string,
    count: number,
): EvaluatedAttempt {
    return {
        SelectorId: selector.SelectorId,
        Strategy: strategy,
        Expression: selector.Expression,
        ResolvedExpression: resolved,
        IsPrimary: isPrimary,
        Matched: true,
        MatchCount: count,
        FailureReason: "Matched",
        FailureDetail: null,
    };
}

function failure(
    selector: PersistedSelector,
    strategy: AttemptStrategy,
    isPrimary: boolean,
    resolved: string,
    reason: AttemptFailureReason,
    detail: string,
): EvaluatedAttempt {
    return {
        SelectorId: selector.SelectorId,
        Strategy: strategy,
        Expression: selector.Expression,
        ResolvedExpression: resolved,
        IsPrimary: isPrimary,
        Matched: false,
        MatchCount: 0,
        FailureReason: reason,
        FailureDetail: detail,
    };
}

function extractMessage(err: unknown): string {
    if (err instanceof Error) { return err.message; }
    if (typeof err === "string") { return err; }
    try { return JSON.stringify(err); } catch { return String(err); }
}
