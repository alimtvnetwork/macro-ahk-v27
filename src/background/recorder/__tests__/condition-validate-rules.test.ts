/**
 * Tests for the §3.5 save-time reject rules in validateCondition.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { validateCondition, type Condition } from "../condition-evaluator";

describe("validateCondition — §3.5 reject rules", () => {
    it("rejects depth > 8 and tags the deepest path", () => {
        let node: Condition = { Selector: "#x", Matcher: { Kind: "Exists" } };
        for (let i = 0; i < 9; i++) node = { Not: node };
        expect(() => validateCondition(node)).toThrow(/exceeds depth 8 at Not\.Not/);
    });

    it("rejects empty AttrEquals.Name with predicate path", () => {
        const c: Condition = {
            All: [
                { Selector: "#x", Matcher: { Kind: "Exists" } },
                { Selector: "#y", Matcher: { Kind: "AttrEquals", Name: "", Value: "v" } },
            ],
        };
        expect(() => validateCondition(c)).toThrow(/AttrEquals requires non-empty Name at All\[1\]\.AttrEquals/);
    });

    it("rejects empty AttrContains.Name", () => {
        const c: Condition = {
            Selector: "#z",
            Matcher: { Kind: "AttrContains", Name: "", Value: "v" },
        };
        expect(() => validateCondition(c)).toThrow(/AttrContains requires non-empty Name at AttrContains/);
    });

    it("rejects negative Count.N", () => {
        const c: Condition = {
            Any: [
                { Selector: ".row", Matcher: { Kind: "Count", Op: "gte", N: -1 } },
            ],
        };
        expect(() => validateCondition(c)).toThrow(/Count\.N must be >= 0 at Any\[0\]\.Count \(got -1\)/);
    });

    it("rejects bad TextRegex with predicate path", () => {
        const c: Condition = {
            Not: { Selector: "#s", Matcher: { Kind: "TextRegex", Pattern: "(unclosed" } },
        };
        expect(() => validateCondition(c)).toThrow(/bad regex \/\(unclosed\/ at Not\.TextRegex/);
    });

    it("accepts a well-formed tree", () => {
        const c: Condition = {
            All: [
                { Selector: "#a", Matcher: { Kind: "AttrEquals", Name: "data-state", Value: "ready" } },
                { Selector: ".row", Matcher: { Kind: "Count", Op: "gte", N: 0 } },
            ],
        };
        expect(() => validateCondition(c)).not.toThrow();
    });
});
