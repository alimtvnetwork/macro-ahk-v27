/**
 * Tests for condition-evaluator.ts (Spec 18 §2-§5).
 */

/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    evaluateCondition,
    validateCondition,
    waitForCondition,
    type Condition,
    type PredicateEvaluation,
} from "../condition-evaluator";

describe("predicate matchers", () => {
    beforeEach(() => { document.body.innerHTML = ""; });

    it("Exists returns true when element present", () => {
        document.body.innerHTML = `<div id="x"></div>`;
        const c: Condition = { Selector: "#x", Matcher: { Kind: "Exists" } };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("Exists returns false when missing", () => {
        const c: Condition = { Selector: "#nope", Matcher: { Kind: "Exists" } };
        expect(evaluateCondition(c, { Doc: document })).toBe(false);
    });

    it("Visible respects display:none", () => {
        document.body.innerHTML = `<div id="x" style="display:none">hi</div>`;
        const c: Condition = { Selector: "#x", Matcher: { Kind: "Visible" } };
        expect(evaluateCondition(c, { Doc: document })).toBe(false);
    });

    it("TextContains is case-insensitive when CaseSensitive=false", () => {
        document.body.innerHTML = `<span id="s">All Done!</span>`;
        const c: Condition = {
            Selector: "#s",
            Matcher: { Kind: "TextContains", Value: "done", CaseSensitive: false },
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("TextEquals trims whitespace", () => {
        document.body.innerHTML = `<span id="s">  Ready  </span>`;
        const c: Condition = {
            Selector: "#s",
            Matcher: { Kind: "TextEquals", Value: "Ready" },
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("TextRegex matches", () => {
        document.body.innerHTML = `<span id="s">order #4421 ok</span>`;
        const c: Condition = {
            Selector: "#s",
            Matcher: { Kind: "TextRegex", Pattern: "#\\d+", Flags: "" },
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("AttrEquals matches HTML attribute", () => {
        document.body.innerHTML = `<input id="i" data-state="ready">`;
        const c: Condition = {
            Selector: "#i",
            Matcher: { Kind: "AttrEquals", Name: "data-state", Value: "ready" },
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("Count.gte counts elements", () => {
        document.body.innerHTML = `<li class="row"></li><li class="row"></li><li class="row"></li>`;
        const c: Condition = {
            Selector: ".row",
            Matcher: { Kind: "Count", Op: "gte", N: 3 },
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("Negate flips the result", () => {
        document.body.innerHTML = `<div id="x"></div>`;
        const c: Condition = { Selector: "#x", Matcher: { Kind: "Exists" }, Negate: true };
        expect(evaluateCondition(c, { Doc: document })).toBe(false);
    });
});

describe("boolean tree", () => {
    beforeEach(() => { document.body.innerHTML = ""; });

    it("All:[] is vacuously true", () => {
        expect(evaluateCondition({ All: [] }, { Doc: document })).toBe(true);
    });

    it("Any:[] is false", () => {
        expect(evaluateCondition({ Any: [] }, { Doc: document })).toBe(false);
    });

    it("Not flips a leaf", () => {
        document.body.innerHTML = `<div id="x"></div>`;
        const c: Condition = { Not: { Selector: "#x", Matcher: { Kind: "Exists" } } };
        expect(evaluateCondition(c, { Doc: document })).toBe(false);
    });

    it("All requires every child true", () => {
        document.body.innerHTML = `<div id="a"></div><div id="b"></div>`;
        const c: Condition = {
            All: [
                { Selector: "#a", Matcher: { Kind: "Exists" } },
                { Selector: "#b", Matcher: { Kind: "Exists" } },
            ],
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("Any short-circuits on first true", () => {
        document.body.innerHTML = `<div id="b"></div>`;
        const c: Condition = {
            Any: [
                { Selector: "#missing", Matcher: { Kind: "Exists" } },
                { Selector: "#b", Matcher: { Kind: "Exists" } },
            ],
        };
        expect(evaluateCondition(c, { Doc: document })).toBe(true);
    });

    it("populates Trace when provided", () => {
        document.body.innerHTML = `<div id="x"></div>`;
        const trace: PredicateEvaluation[] = [];
        evaluateCondition(
            { All: [{ Selector: "#x", Matcher: { Kind: "Exists" } }] },
            { Doc: document, Trace: trace },
        );
        expect(trace).toHaveLength(1);
        expect(trace[0]?.Result).toBe(true);
    });
});

describe("validateCondition", () => {
    it("rejects invalid regex patterns", () => {
        const c: Condition = {
            Selector: "#x",
            Matcher: { Kind: "TextRegex", Pattern: "(unclosed" },
        };
        expect(() => validateCondition(c)).toThrow(/InvalidSelector/);
    });

    it("accepts well-formed compound trees", () => {
        const c: Condition = {
            All: [
                { Not: { Selector: ".loading", Matcher: { Kind: "Visible" } } },
                { Selector: ".result", Matcher: { Kind: "Count", Op: "gte", N: 1 } },
            ],
        };
        expect(() => validateCondition(c)).not.toThrow();
    });
});

describe("waitForCondition", () => {
    afterEach(() => { document.body.innerHTML = ""; });

    it("resolves when condition becomes true mid-poll", async () => {
        const result = await waitForCondition(
            { Selector: "#late", Matcher: { Kind: "Exists" } },
            {
                Doc: document,
                TimeoutMs: 1000,
                PollMs: 5,
                Sleep: async () => {
                    if (document.getElementById("late") === null) {
                        const el = document.createElement("div");
                        el.id = "late";
                        document.body.appendChild(el);
                    }
                },
            },
        );
        expect(result.Ok).toBe(true);
    });

    it("returns ConditionTimeout with last evaluation trace", async () => {
        let nowMs = 0;
        const result = await waitForCondition(
            { Selector: "#never", Matcher: { Kind: "Exists" } },
            {
                Doc: document,
                TimeoutMs: 50,
                PollMs: 10,
                Now: () => nowMs,
                Sleep: async (ms) => { nowMs += ms; },
            },
        );
        expect(result.Ok).toBe(false);
        if (result.Ok === false) {
            expect(result.Reason).toBe("ConditionTimeout");
            expect(result.LastEvaluation.length).toBeGreaterThan(0);
        }
    });

    it("returns InvalidSelector on bad regex", async () => {
        const result = await waitForCondition(
            { Selector: "#x", Matcher: { Kind: "TextRegex", Pattern: "(bad" } },
            { Doc: document, TimeoutMs: 100 },
        );
        expect(result.Ok).toBe(false);
        if (result.Ok === false) expect(result.Reason).toBe("InvalidSelector");
    });
});
