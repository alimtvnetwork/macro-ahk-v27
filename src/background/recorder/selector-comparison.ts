/**
 * Marco Extension — Selector Attempt Comparison
 *
 * Runs every persisted selector for a Step against the live DOM and reports,
 * per selector, whether the lookup succeeded and which Element (if any) was
 * matched. Used by the failure post-mortem UI ("Comparison view") so the
 * user can see at a glance:
 *
 *   - Which selectors no longer match → likely root cause of the failure.
 *   - Which selectors do still resolve → the next-best candidate to promote
 *     to primary.
 *   - When a fallback resolves to a *different* element than the primary
 *     would have → silent drift.
 *
 * Pure: caller injects the Document. No event dispatch, no chrome.*.
 *
 * @see ./replay-resolver.ts   — Same anchor/relative resolution rules.
 * @see ./failure-logger.ts    — DomContext shape reused here.
 */

import { resolveStepSelector } from "./replay-resolver";
import { SelectorKindId } from "../recorder-db-schema";
import type { PersistedSelector } from "./step-persistence";
import type { DomContext } from "./failure-logger";

const SELECTOR_KIND_NAMES: Readonly<Record<number, string>> = {
    1: "XPathFull",
    2: "XPathRelative",
    3: "Css",
    4: "Aria",
};

export interface SelectorAttemptComparison {
    readonly SelectorId: number;
    readonly Kind: string;
    readonly Expression: string;
    readonly ResolvedExpression: string;
    readonly IsPrimary: boolean;
    /** True when the lookup matched at least one element. */
    readonly Matched: boolean;
    /** Number of matches (querySelectorAll for Css/Aria, XPath snapshot for XPath). */
    readonly MatchCount: number;
    /** DOM snapshot of the *first* match (or null when no match). */
    readonly Element: DomContext | null;
    /** Resolver / DOM-API failure message (e.g. invalid XPath). */
    readonly Error: string | null;
}

export interface SelectorComparison {
    /** All attempts, primary first then in original order. */
    readonly Attempts: ReadonlyArray<SelectorAttemptComparison>;
    /** True when the primary selector matched. */
    readonly PrimaryMatched: boolean;
    /** True when at least one fallback (non-primary) matched. */
    readonly AnyFallbackMatched: boolean;
    /**
     * True when the primary fails but a fallback resolves — strong hint that
     * the user should promote the fallback or the primary needs editing.
     */
    readonly DriftDetected: boolean;
}

/**
 * Try every selector for a Step against the live DOM and report which
 * matched. Anchor chains are honored via {@link resolveStepSelector} on a
 * synthetic primary marker per selector so relative XPath fallbacks are
 * evaluated correctly.
 */
export function compareSelectorAttempts(
    selectors: ReadonlyArray<PersistedSelector>,
    doc: Document,
): SelectorComparison {
    const attempts: SelectorAttemptComparison[] = [];

    for (const sel of selectors) {
        attempts.push(evaluateOne(sel, selectors, doc));
    }

    // Sort: primary first, then by original SelectorId for stability.
    attempts.sort((a, b) => {
        if (a.IsPrimary !== b.IsPrimary) return a.IsPrimary ? -1 : 1;
        return a.SelectorId - b.SelectorId;
    });

    const primary = attempts.find((a) => a.IsPrimary) ?? null;
    const primaryMatched = primary?.Matched ?? false;
    const anyFallbackMatched = attempts.some((a) => !a.IsPrimary && a.Matched);

    return {
        Attempts: attempts,
        PrimaryMatched: primaryMatched,
        AnyFallbackMatched: anyFallbackMatched,
        DriftDetected: !primaryMatched && anyFallbackMatched,
    };
}

function evaluateOne(
    selector: PersistedSelector,
    all: ReadonlyArray<PersistedSelector>,
    doc: Document,
): SelectorAttemptComparison {
    const kind = SELECTOR_KIND_NAMES[selector.SelectorKindId] ?? `Kind${selector.SelectorKindId}`;
    const base: Omit<SelectorAttemptComparison, "Matched" | "MatchCount" | "Element" | "Error" | "ResolvedExpression"> = {
        SelectorId: selector.SelectorId,
        Kind: kind,
        Expression: selector.Expression,
        IsPrimary: selector.IsPrimary === 1,
    };

    let resolvedExpression = selector.Expression;
    try {
        // Resolve anchor chains for relative XPath; treat this single selector
        // as primary so resolveStepSelector returns its expanded expression.
        if (selector.SelectorKindId === SelectorKindId.XPathRelative) {
            const synthetic = all.map((s) => ({
                ...s,
                IsPrimary: s.SelectorId === selector.SelectorId ? 1 : 0,
            }));
            resolvedExpression = resolveStepSelector(synthetic).Expression;
        }
    } catch (err) {
        return {
            ...base,
            ResolvedExpression: resolvedExpression,
            Matched: false,
            MatchCount: 0,
            Element: null,
            Error: err instanceof Error ? err.message : String(err),
        };
    }

    try {
        const { element, count } = lookup(selector.SelectorKindId, resolvedExpression, doc);
        return {
            ...base,
            ResolvedExpression: resolvedExpression,
            Matched: element !== null,
            MatchCount: count,
            Element: element !== null ? readDomContext(element) : null,
            Error: null,
        };
    } catch (err) {
        return {
            ...base,
            ResolvedExpression: resolvedExpression,
            Matched: false,
            MatchCount: 0,
            Element: null,
            Error: err instanceof Error ? err.message : String(err),
        };
    }
}

function lookup(
    kindId: number,
    expression: string,
    doc: Document,
): { element: Element | null; count: number } {
    if (kindId === SelectorKindId.XPathFull || kindId === SelectorKindId.XPathRelative) {
        const snapshot = doc.evaluate(
            expression, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
        );
        const count = snapshot.snapshotLength;
        const first = count > 0 ? snapshot.snapshotItem(0) : null;
        return {
            element: first instanceof Element ? first : null,
            count,
        };
    }
    // Css / Aria — both are passed straight to querySelectorAll.
    const list = doc.querySelectorAll(expression);
    return {
        element: list.length > 0 ? list[0] : null,
        count: list.length,
    };
}

function readDomContext(el: Element): DomContext {
    const id = el.getAttribute("id");
    const cls = el.getAttribute("class");
    const aria = el.getAttribute("aria-label");
    const name = el.getAttribute("name");
    const type = el.getAttribute("type");
    const text = (el.textContent ?? "").trim().slice(0, 120);
    const outer = el.outerHTML?.slice(0, 240) ?? "";
    return {
        TagName: el.tagName.toLowerCase(),
        Id: id !== null && id.length > 0 ? id : null,
        ClassName: cls !== null && cls.length > 0 ? cls : null,
        AriaLabel: aria !== null && aria.length > 0 ? aria : null,
        Name: name !== null && name.length > 0 ? name : null,
        Type: type !== null && type.length > 0 ? type : null,
        TextSnippet: text,
        OuterHtmlSnippet: outer,
    };
}
