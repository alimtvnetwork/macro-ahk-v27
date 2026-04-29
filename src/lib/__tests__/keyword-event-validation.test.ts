/**
 * Tests for `keyword-event-validation` — the pure helpers that gate the
 * per-event Run button in the Keyword Events editor.
 */

import { describe, expect, it } from "vitest";

import type { KeywordEvent } from "@/hooks/use-keyword-events";
import {
    isEventRunnable,
    KEYWORD_EVENT_VALIDATION_LIMITS,
    validateCombo,
    validateEventSteps,
    validateWait,
} from "@/lib/keyword-event-validation";

const mkEvent = (overrides: Partial<KeywordEvent> = {}): KeywordEvent => ({
    Id: "ev1",
    Keyword: "test",
    Description: "",
    Enabled: true,
    Steps: [],
    ...overrides,
});

describe("validateCombo", () => {
    it("accepts a single named key", () => {
        expect(validateCombo("Enter").Valid).toBe(true);
        expect(validateCombo("Tab").Valid).toBe(true);
        expect(validateCombo("F5").Valid).toBe(true);
    });

    it("accepts modifier+key combos", () => {
        expect(validateCombo("Ctrl+Enter").Valid).toBe(true);
        expect(validateCombo("Ctrl+Shift+Tab").Valid).toBe(true);
        expect(validateCombo("Meta+a").Valid).toBe(true);
    });

    it("accepts single-character keys", () => {
        expect(validateCombo("a").Valid).toBe(true);
        expect(validateCombo("Z").Valid).toBe(true);
        expect(validateCombo("1").Valid).toBe(true);
        expect(validateCombo("?").Valid).toBe(true);
    });

    it("rejects empty / whitespace combos", () => {
        const r1 = validateCombo("");
        expect(r1.Valid).toBe(false);
        if (!r1.Valid) { expect(r1.Reason).toBe("Empty"); }

        const r2 = validateCombo("   ");
        expect(r2.Valid).toBe(false);
        if (!r2.Valid) { expect(r2.Reason).toBe("Empty"); }

        const r3 = validateCombo("+");
        expect(r3.Valid).toBe(false);
        if (!r3.Valid) { expect(r3.Reason).toBe("Empty"); }
    });

    it("rejects modifier-only combos", () => {
        const r = validateCombo("Ctrl+Shift");
        expect(r.Valid).toBe(false);
        if (!r.Valid) {
            expect(r.Reason).toBe("ModifiersOnly");
            expect(r.Message).toMatch(/modifier/i);
        }
    });

    it("rejects unknown named keys", () => {
        const r = validateCombo("Ctrl+Banana");
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("UnknownKey"); }
    });

    it("rejects combos with multiple non-modifier keys", () => {
        const r = validateCombo("Enter+Tab");
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("MultipleKeys"); }
    });

    it("is case-insensitive for modifier and named-key tokens", () => {
        expect(validateCombo("CTRL+enter").Valid).toBe(true);
        expect(validateCombo("control+ESCAPE").Valid).toBe(true);
        expect(validateCombo("cmd+a").Valid).toBe(true);
    });
});

describe("validateWait", () => {
    it("accepts non-negative integers", () => {
        const r = validateWait("500");
        expect(r.Valid).toBe(true);
        if (r.Valid) { expect(r.Ms).toBe(500); }
    });

    it("accepts 0", () => {
        const r = validateWait("0");
        expect(r.Valid).toBe(true);
        if (r.Valid) { expect(r.Ms).toBe(0); }
    });

    it("floors fractional values", () => {
        const r = validateWait("250.7");
        expect(r.Valid).toBe(true);
        if (r.Valid) { expect(r.Ms).toBe(250); }
    });

    it("rejects empty input", () => {
        const r = validateWait("");
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("Empty"); }
    });

    it("rejects non-numeric input", () => {
        const r = validateWait("abc");
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("NotANumber"); }
    });

    it("rejects negative values", () => {
        const r = validateWait("-100");
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("Negative"); }
    });

    it("rejects values larger than the configured maximum", () => {
        const r = validateWait(String(KEYWORD_EVENT_VALIDATION_LIMITS.MaxWaitMs + 1));
        expect(r.Valid).toBe(false);
        if (!r.Valid) { expect(r.Reason).toBe("TooLarge"); }
    });

    it("rejects Infinity", () => {
        const r = validateWait("Infinity");
        expect(r.Valid).toBe(false);
        if (!r.Valid) {
            // Either NotFinite or TooLarge is acceptable; both block Run.
            expect(["NotFinite", "TooLarge"]).toContain(r.Reason);
        }
    });
});

describe("validateEventSteps + isEventRunnable", () => {
    it("returns no issues for a clean event", () => {
        const ev = mkEvent({
            Steps: [
                { Id: "s1", Kind: "Key", Combo: "Ctrl+Enter" },
                { Id: "s2", Kind: "Wait", DurationMs: 250 },
            ],
        });
        expect(validateEventSteps(ev)).toHaveLength(0);
        expect(isEventRunnable(ev)).toBe(true);
    });

    it("flags every malformed step with its index and stepId", () => {
        const ev = mkEvent({
            Steps: [
                { Id: "s1", Kind: "Key", Combo: "" },
                { Id: "s2", Kind: "Key", Combo: "Ctrl" },
                { Id: "s3", Kind: "Wait", DurationMs: -5 },
                { Id: "s4", Kind: "Key", Combo: "Enter" }, // ok
            ],
        });
        const issues = validateEventSteps(ev);
        expect(issues.map(i => i.StepId)).toEqual(["s1", "s2", "s3"]);
        expect(issues.map(i => i.Index)).toEqual([0, 1, 2]);
        expect(isEventRunnable(ev)).toBe(false);
    });

    it("treats disabled events as non-runnable even when valid", () => {
        const ev = mkEvent({
            Enabled: false,
            Steps: [{ Id: "s1", Kind: "Key", Combo: "Enter" }],
        });
        expect(isEventRunnable(ev)).toBe(false);
    });

    it("treats empty step lists as non-runnable", () => {
        expect(isEventRunnable(mkEvent({ Steps: [] }))).toBe(false);
    });

    it("flags NaN / non-finite stored wait durations", () => {
        const ev = mkEvent({
            Steps: [
                { Id: "s1", Kind: "Wait", DurationMs: Number.NaN },
                { Id: "s2", Kind: "Wait", DurationMs: Number.POSITIVE_INFINITY },
            ],
        });
        const issues = validateEventSteps(ev);
        expect(issues).toHaveLength(2);
    });
});
