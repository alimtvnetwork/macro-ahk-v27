// @vitest-environment jsdom

/**
 * Selector-attempt comparison tests.
 */

import { describe, it, expect } from "vitest";
import { compareSelectorAttempts } from "../selector-comparison";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

function makeSel(
    id: number, kindId: number, expr: string, isPrimary = 0,
    anchorId: number | null = null,
): PersistedSelector {
    return {
        SelectorId: id, StepId: 1,
        SelectorKindId: kindId, Expression: expr,
        AnchorSelectorId: anchorId, IsPrimary: isPrimary,
    };
}

describe("compareSelectorAttempts", () => {
    it("flags every selector match-state and surfaces the matched element", () => {
        document.body.innerHTML = `
            <button id="go" class="primary" aria-label="Go">Go</button>
            <button class="primary">Other</button>
        `;
        const selectors: PersistedSelector[] = [
            makeSel(1, SelectorKindId.XPathFull,  '//button[@id="go"]', 1),
            makeSel(2, SelectorKindId.Css,        "#go"),
            makeSel(3, SelectorKindId.Css,        ".primary"),  // 2 matches
            makeSel(4, SelectorKindId.Aria,       '[aria-label="Go"]'),
        ];

        const cmp = compareSelectorAttempts(selectors, document);
        expect(cmp.PrimaryMatched).toBe(true);
        expect(cmp.AnyFallbackMatched).toBe(true);
        expect(cmp.DriftDetected).toBe(false);

        // Primary first
        expect(cmp.Attempts[0].IsPrimary).toBe(true);
        expect(cmp.Attempts[0].SelectorId).toBe(1);
        expect(cmp.Attempts[0].Element?.Id).toBe("go");

        const css = cmp.Attempts.find((a) => a.SelectorId === 3)!;
        expect(css.Matched).toBe(true);
        expect(css.MatchCount).toBe(2);
    });

    it("detects drift when the primary fails but a fallback still resolves", () => {
        document.body.innerHTML = `<button class="primary">Go</button>`;
        const selectors: PersistedSelector[] = [
            makeSel(1, SelectorKindId.XPathFull,  '//button[@id="go"]', 1), // fails — id removed
            makeSel(2, SelectorKindId.Css,        ".primary"),              // still matches
        ];
        const cmp = compareSelectorAttempts(selectors, document);
        expect(cmp.PrimaryMatched).toBe(false);
        expect(cmp.AnyFallbackMatched).toBe(true);
        expect(cmp.DriftDetected).toBe(true);
        expect(cmp.Attempts[0].Matched).toBe(false);
        expect(cmp.Attempts[0].Element).toBeNull();
    });

    it("reports zero matches when nothing in the DOM resolves", () => {
        document.body.innerHTML = `<div></div>`;
        const selectors: PersistedSelector[] = [
            makeSel(1, SelectorKindId.Css,        "#missing", 1),
            makeSel(2, SelectorKindId.XPathFull,  '//button[@id="missing"]'),
        ];
        const cmp = compareSelectorAttempts(selectors, document);
        expect(cmp.PrimaryMatched).toBe(false);
        expect(cmp.AnyFallbackMatched).toBe(false);
        expect(cmp.DriftDetected).toBe(false);
        expect(cmp.Attempts.every((a) => !a.Matched)).toBe(true);
    });

    it("captures resolver/DOM errors per selector without throwing", () => {
        document.body.innerHTML = `<div></div>`;
        const selectors: PersistedSelector[] = [
            makeSel(1, SelectorKindId.Css,        ":::not-a-selector", 1),
        ];
        const cmp = compareSelectorAttempts(selectors, document);
        expect(cmp.Attempts[0].Matched).toBe(false);
        expect(cmp.Attempts[0].Error).not.toBeNull();
    });

    it("expands relative XPath via its anchor chain before evaluating", () => {
        document.body.innerHTML = `<form id="f"><input name="email" /></form>`;
        const selectors: PersistedSelector[] = [
            makeSel(1, SelectorKindId.XPathFull,     '//form[@id="f"]'),
            makeSel(2, SelectorKindId.XPathRelative, './/input[@name="email"]', 1, 1),
        ];
        const cmp = compareSelectorAttempts(selectors, document);
        const primary = cmp.Attempts.find((a) => a.IsPrimary)!;
        expect(primary.Matched).toBe(true);
        expect(primary.ResolvedExpression).toContain('//form[@id="f"]');
        expect(primary.Element?.TagName).toBe("input");
    });
});
