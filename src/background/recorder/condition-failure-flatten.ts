/**
 * Marco Extension — Condition Selector Flattener (Spec 19 §3.4)
 *
 * Walks a {@link Condition} tree and collects every leaf predicate's
 * selector expression. Returns the full flat list plus the XPath subset
 * (filtered via the same `Auto`-detection rule used by the evaluator).
 *
 * Pure — no DOM. Consumed by `buildConditionFailureRecord` to populate
 * `Selectors[]` and `XPath[]` per §3.4 of spec 19.
 */

import { resolveSelectorKind } from "./condition-evaluator";
import type { Condition, Predicate } from "./condition-evaluator";

export interface FlattenedSelectors {
    readonly Selectors: ReadonlyArray<string>;
    readonly XPath: ReadonlyArray<string>;
}

export function flattenConditionSelectors(c: Condition): FlattenedSelectors {
    const all: string[] = [];
    const xpath: string[] = [];
    walk(c);
    return { Selectors: all, XPath: xpath };

    function walk(node: Condition): void {
        if ("All" in node) { for (const child of node.All) walk(child); return; }
        if ("Any" in node) { for (const child of node.Any) walk(child); return; }
        if ("Not" in node) { walk(node.Not); return; }
        collectLeaf(node);
    }

    function collectLeaf(p: Predicate): void {
        all.push(p.Selector);
        const kind = resolveSelectorKind(p.SelectorKind ?? "Auto", p.Selector);
        if (kind === "XPath") xpath.push(p.Selector);
    }
}
