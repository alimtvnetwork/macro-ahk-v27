/**
 * Selector replay trace — pure ordering & classification tests.
 *
 * Verifies the live-replay walk semantics:
 *   - Steps appear in declared order (primary first, then fallbacks).
 *   - The first matching attempt stops the walk; later attempts are pending.
 *   - Syntax/runtime errors classify as "errored", zero-match as "missed".
 *   - Summary counts evaluated/skipped and reports the stop position.
 */

import { describe, it, expect } from "vitest";
import { buildReplayTrace } from "../selector-replay-trace";
import type { SelectorAttempt } from "@/background/recorder/failure-logger";

function attempt(over: Partial<SelectorAttempt>): SelectorAttempt {
    return {
        SelectorId: 1,
        Strategy: "Css",
        Expression: "#x",
        ResolvedExpression: "#x",
        IsPrimary: false,
        Matched: false,
        MatchCount: 0,
        FailureReason: "ZeroMatches",
        FailureDetail: null,
        ...over,
    };
}

describe("buildReplayTrace", () => {
    it("returns empty trace for no attempts", () => {
        const t = buildReplayTrace([]);
        expect(t.Steps).toHaveLength(0);
        expect(t.Summary).toEqual({
            Total: 0, Evaluated: 0, Skipped: 0, StoppedAt: null, Outcome: "empty",
        });
    });

    it("walks primary then fallbacks in declared order", () => {
        const t = buildReplayTrace([
            attempt({ Expression: "p", IsPrimary: true }),
            attempt({ Expression: "f1" }),
            attempt({ Expression: "f2" }),
        ]);
        expect(t.Steps.map((s) => s.Order)).toEqual([1, 2, 3]);
        expect(t.Steps.map((s) => s.Role)).toEqual(["Primary", "Fallback", "Fallback"]);
        expect(t.Steps.map((s) => s.Expression)).toEqual(["p", "f1", "f2"]);
    });

    it("stops at first match and marks later attempts pending", () => {
        const t = buildReplayTrace([
            attempt({ IsPrimary: true, Matched: false, FailureReason: "ZeroMatches" }),
            attempt({ Matched: true, MatchCount: 1, FailureReason: "Matched" }),
            attempt({ Matched: false, FailureReason: "ZeroMatches" }),
        ]);
        expect(t.Steps[0].Status).toBe("missed");
        expect(t.Steps[1].Status).toBe("matched");
        expect(t.Steps[2].Status).toBe("pending");
        expect(t.Summary).toMatchObject({
            Total: 3, Evaluated: 2, Skipped: 1, StoppedAt: 2, Outcome: "matched",
        });
    });

    it("classifies syntax/runtime errors as errored", () => {
        const t = buildReplayTrace([
            attempt({ IsPrimary: true, FailureReason: "XPathSyntaxError", FailureDetail: "bad" }),
            attempt({ FailureReason: "CssSyntaxError" }),
            attempt({ FailureReason: "EvaluationThrew" }),
            attempt({ FailureReason: "UnresolvedAnchor" }),
            attempt({ FailureReason: "EmptyExpression" }),
        ]);
        expect(t.Steps.map((s) => s.Status)).toEqual([
            "errored", "errored", "errored", "errored", "errored",
        ]);
        expect(t.Summary.Outcome).toBe("exhausted");
        expect(t.Summary.StoppedAt).toBeNull();
        expect(t.Summary.Evaluated).toBe(5);
    });

    it("marks all-failed walk as exhausted", () => {
        const t = buildReplayTrace([
            attempt({ IsPrimary: true }),
            attempt({}),
        ]);
        expect(t.Summary.Outcome).toBe("exhausted");
        expect(t.Summary.StoppedAt).toBeNull();
        expect(t.Summary.Skipped).toBe(0);
    });

    it("falls back to Expression when ResolvedExpression is empty", () => {
        const t = buildReplayTrace([
            attempt({ Expression: "stored", ResolvedExpression: "" }),
        ]);
        expect(t.Steps[0].ResolvedExpression).toBe("stored");
    });

    it("emits human notes that mention the role and outcome", () => {
        const t = buildReplayTrace([
            attempt({ IsPrimary: true, Matched: true, MatchCount: 1, FailureReason: "Matched" }),
            attempt({ FailureReason: "ZeroMatches" }),
        ]);
        expect(t.Steps[0].Note).toMatch(/Primary resolved/);
        expect(t.Steps[1].Note).toMatch(/not evaluated/);
    });

    it("singularises match count of 1", () => {
        const t = buildReplayTrace([
            attempt({ IsPrimary: true, Matched: true, MatchCount: 1, FailureReason: "Matched" }),
        ]);
        expect(t.Steps[0].Note).toContain("1 match;");
    });
});
