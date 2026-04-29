/**
 * Marco Extension — Mini Selector Tester
 *
 * Pure helper that evaluates an arbitrary CSS or XPath selector against a
 * Document and reports match count + a snapshot of the first matched
 * element. Auto-detects kind (XPath if expression starts with `/` or `(`,
 * otherwise CSS) but accepts an explicit override.
 *
 * Reuses the {@link DomContext} shape from `failure-logger` so the result
 * round-trips through the same diagnostic pipelines as failure reports
 * and selector comparisons.
 *
 * @see ./selector-comparison.ts — Per-step selector comparison.
 * @see ./failure-logger.ts      — DomContext shape.
 */

import type { DomContext } from "./failure-logger";

export type SelectorTestKind = "Css" | "XPath" | "Auto";

export interface SelectorTestResult {
    readonly Expression: string;
    /** Detected or supplied kind actually used for the lookup. */
    readonly Kind: "Css" | "XPath";
    readonly MatchCount: number;
    readonly FirstMatch: DomContext | null;
    readonly Error: string | null;
}

/** Detect the selector kind from the expression's leading character. */
export function detectSelectorKind(expression: string): "Css" | "XPath" {
    const trimmed = expression.trimStart();
    if (trimmed.startsWith("/") || trimmed.startsWith("(") || trimmed.startsWith("./")) {
        return "XPath";
    }
    return "Css";
}

/** Run the selector against `doc` and report the outcome. */
export function testSelector(
    expression: string,
    doc: Document,
    kind: SelectorTestKind = "Auto",
): SelectorTestResult {
    const trimmed = expression.trim();
    if (trimmed.length === 0) {
        return {
            Expression: expression,
            Kind: kind === "XPath" ? "XPath" : "Css",
            MatchCount: 0,
            FirstMatch: null,
            Error: "Selector is empty",
        };
    }

    const useKind: "Css" | "XPath" = kind === "Auto" ? detectSelectorKind(trimmed) : kind;

    try {
        if (useKind === "XPath") {
            const snapshot = doc.evaluate(
                trimmed, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null,
            );
            const count = snapshot.snapshotLength;
            const first = count > 0 ? snapshot.snapshotItem(0) : null;
            return {
                Expression: trimmed,
                Kind: "XPath",
                MatchCount: count,
                FirstMatch: first instanceof Element ? readDomContext(first) : null,
                Error: null,
            };
        }
        const list = doc.querySelectorAll(trimmed);
        return {
            Expression: trimmed,
            Kind: "Css",
            MatchCount: list.length,
            FirstMatch: list.length > 0 ? readDomContext(list[0]) : null,
            Error: null,
        };
    } catch (err) {
        return {
            Expression: trimmed,
            Kind: useKind,
            MatchCount: 0,
            FirstMatch: null,
            Error: err instanceof Error ? err.message : String(err),
        };
    }
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
