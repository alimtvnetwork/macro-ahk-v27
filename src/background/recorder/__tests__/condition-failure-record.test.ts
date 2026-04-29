/**
 * Tests for condition-failure-record.ts + condition-failure-flatten.ts (Spec 19 §3.4).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
    buildConditionFailureRecord,
    MAX_LOG_TAIL,
} from "../condition-failure-record";
import { flattenConditionSelectors } from "../condition-failure-flatten";
import type {
    Condition,
    ConditionWaitOutcome,
} from "../condition-evaluator";

function failureOutcome(): Extract<ConditionWaitOutcome, { Ok: false }> {
    return {
        Ok: false,
        DurationMs: 50,
        Polls: 3,
        Reason: "ConditionTimeout",
        Detail: "Condition not met within 50ms",
        LastEvaluation: [
            { Selector: "//button[@id='go']", Kind: "XPath", Matcher: "Visible", Result: false },
        ],
    };
}

describe("flattenConditionSelectors", () => {
    it("collects all leaf selectors and the XPath subset", () => {
        const c: Condition = {
            All: [
                { Selector: "//div[@id='a']", Matcher: { Kind: "Exists" } },
                {
                    Any: [
                        { Selector: "#b", Matcher: { Kind: "Visible" } },
                        { Not: { Selector: "//span[1]", Matcher: { Kind: "Exists" } } },
                    ],
                },
            ],
        };
        const out = flattenConditionSelectors(c);
        expect(out.Selectors).toEqual(["//div[@id='a']", "#b", "//span[1]"]);
        expect(out.XPath).toEqual(["//div[@id='a']", "//span[1]"]);
    });

    it("returns empty arrays for vacuous All:[]", () => {
        const out = flattenConditionSelectors({ All: [] });
        expect(out.Selectors).toEqual([]);
        expect(out.XPath).toEqual([]);
    });
});

describe("buildConditionFailureRecord", () => {
    const condition: Condition = {
        Selector: "//button[@id='go']",
        Matcher: { Kind: "Visible" },
    };

    it("populates every §3.4 field with defaults when context is omitted", () => {
        const rec = buildConditionFailureRecord({
            Condition: condition,
            Outcome: failureOutcome(),
        });
        expect(rec.Reason).toBe("ConditionTimeout");
        expect(rec.ConditionSerialized).toContain("\"Visible\"");
        expect(rec.LastEvaluation).toHaveLength(1);
        expect(rec.Selectors).toEqual(["//button[@id='go']"]);
        expect(rec.XPath).toEqual(["//button[@id='go']"]);
        expect(rec.Vars).toEqual({});
        expect(rec.Row).toEqual({});
        expect(rec.LogTail).toEqual([]);
    });

    it("honours ReasonOverride for URL/route reasons", () => {
        const rec = buildConditionFailureRecord({
            Condition: condition,
            Outcome: failureOutcome(),
            ReasonOverride: "InvalidUrlPattern",
        });
        expect(rec.Reason).toBe("InvalidUrlPattern");
    });

    it("trims LogTail to the last MAX_LOG_TAIL lines", () => {
        const lines = Array.from({ length: MAX_LOG_TAIL + 25 }, (_, i) => `line-${i}`);
        const rec = buildConditionFailureRecord({
            Condition: condition,
            Outcome: failureOutcome(),
            LogTail: lines,
        });
        expect(rec.LogTail).toHaveLength(MAX_LOG_TAIL);
        expect(rec.LogTail[0]).toBe(`line-25`);
        expect(rec.LogTail[MAX_LOG_TAIL - 1]).toBe(`line-${MAX_LOG_TAIL + 24}`);
    });

    it("passes Vars and Row through verbatim", () => {
        const rec = buildConditionFailureRecord({
            Condition: condition,
            Outcome: failureOutcome(),
            Vars: { Region: "APAC" },
            Row: { Email: "x@y.z" },
        });
        expect(rec.Vars).toEqual({ Region: "APAC" });
        expect(rec.Row).toEqual({ Email: "x@y.z" });
    });
});
