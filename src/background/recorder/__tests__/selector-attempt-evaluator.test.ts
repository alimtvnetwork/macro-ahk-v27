// @vitest-environment jsdom

/**
 * Selector Attempt Evaluator — unit tests.
 *
 * Covers the pure helper that evaluates EVERY persisted selector
 * (primary + fallbacks) against a live Document and returns a structured
 * EvaluatedAttempt[] with Strategy, ResolvedExpression, Matched,
 * MatchCount, and FailureReason short-codes.
 */

import { describe, it, expect } from "vitest";
import { evaluateAllSelectors } from "../selector-attempt-evaluator";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

function sel(over: Partial<PersistedSelector> & { Id: number; Kind: number; Expr: string; Primary: 0 | 1; Anchor?: number | null }): PersistedSelector {
    return {
        SelectorId: over.Id,
        StepId: 1,
        SelectorKindId: over.Kind,
        Expression: over.Expr,
        AnchorSelectorId: over.Anchor ?? null,
        IsPrimary: over.Primary,
    };
}

describe("evaluateAllSelectors", () => {
    it("returns empty array when no selectors supplied", () => {
        expect(evaluateAllSelectors([], document)).toEqual([]);
    });

    it("evaluates an XPathFull primary that matches one node", () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const out = evaluateAllSelectors(
            [sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//button[@id='go']", Primary: 1 })],
            document,
        );
        expect(out).toHaveLength(1);
        expect(out[0].Matched).toBe(true);
        expect(out[0].MatchCount).toBe(1);
        expect(out[0].FailureReason).toBe("Matched");
        expect(out[0].FailureDetail).toBeNull();
        expect(out[0].Strategy).toBe("XPathFull");
        expect(out[0].ResolvedExpression).toBe("//button[@id='go']");
    });

    it("reports ZeroMatches with a descriptive detail when the XPath misses", () => {
        document.body.innerHTML = `<div></div>`;
        const out = evaluateAllSelectors(
            [sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//button[@id='missing']", Primary: 1 })],
            document,
        );
        expect(out[0].Matched).toBe(false);
        expect(out[0].MatchCount).toBe(0);
        expect(out[0].FailureReason).toBe("ZeroMatches");
        expect(out[0].FailureDetail).toContain("//button[@id='missing']");
    });

    it("flags XPath syntax errors as XPathSyntaxError", () => {
        const out = evaluateAllSelectors(
            [sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//[[broken", Primary: 1 })],
            document,
        );
        expect(out[0].Matched).toBe(false);
        expect(out[0].FailureReason).toBe("XPathSyntaxError");
        expect(out[0].FailureDetail).not.toBeNull();
    });

    it("flags CSS syntax errors as CssSyntaxError", () => {
        const out = evaluateAllSelectors(
            [sel({ Id: 1, Kind: SelectorKindId.Css, Expr: "###", Primary: 1 })],
            document,
        );
        expect(out[0].Matched).toBe(false);
        expect(out[0].FailureReason).toBe("CssSyntaxError");
    });

    it("flags empty Expression as EmptyExpression", () => {
        const out = evaluateAllSelectors(
            [sel({ Id: 1, Kind: SelectorKindId.Css, Expr: "", Primary: 1 })],
            document,
        );
        expect(out[0].FailureReason).toBe("EmptyExpression");
    });

    it("orders primary first regardless of input order", () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const out = evaluateAllSelectors(
            [
                sel({ Id: 2, Kind: SelectorKindId.Css, Expr: "#go", Primary: 0 }),
                sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//button[@id='go']", Primary: 1 }),
            ],
            document,
        );
        expect(out.map((a) => a.SelectorId)).toEqual([1, 2]);
        expect(out[0].IsPrimary).toBe(true);
    });

    it("evaluates an XPathRelative against its anchor", () => {
        document.body.innerHTML = `<form id="f"><button>Send</button></form>`;
        const out = evaluateAllSelectors(
            [
                sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//form[@id='f']", Primary: 0 }),
                sel({ Id: 2, Kind: SelectorKindId.XPathRelative, Expr: "./button", Primary: 1, Anchor: 1 }),
            ],
            document,
        );
        const primary = out.find((a) => a.IsPrimary)!;
        expect(primary.ResolvedExpression).toBe("//form[@id='f']/button");
        expect(primary.Matched).toBe(true);
    });

    it("flags an XPathRelative whose anchor is missing as UnresolvedAnchor", () => {
        const out = evaluateAllSelectors(
            [sel({ Id: 2, Kind: SelectorKindId.XPathRelative, Expr: "./button", Primary: 1, Anchor: 99 })],
            document,
        );
        expect(out[0].FailureReason).toBe("UnresolvedAnchor");
        expect(out[0].FailureDetail).toContain("99");
    });

    it("includes ALL attempts in the output even when one matches", () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const out = evaluateAllSelectors(
            [
                sel({ Id: 1, Kind: SelectorKindId.XPathFull, Expr: "//button[@id='nope']", Primary: 1 }),
                sel({ Id: 2, Kind: SelectorKindId.Css, Expr: "#go", Primary: 0 }),
            ],
            document,
        );
        expect(out).toHaveLength(2);
        expect(out[0].Matched).toBe(false);   // primary missed
        expect(out[1].Matched).toBe(true);    // fallback matched — drift case
    });
});
