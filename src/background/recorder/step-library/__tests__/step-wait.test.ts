/**
 * Tests for step-wait.ts — auto-detect, validation, storage,
 * evaluation, and the wait loop with a stub clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_WAIT_CONFIG,
    clearAllStepWaits,
    clearStepWait,
    detectSelectorKind,
    evaluateSelector,
    isConditionSatisfied,
    readAllStepWaits,
    readStepWait,
    validateSelector,
    waitForSelector,
    writeStepWait,
    type ElementLike,
    type WaitConfig,
} from "../step-wait";

beforeEach(() => clearAllStepWaits());
afterEach(() => clearAllStepWaits());

/* ------------------------------------------------------------------ */
/*  Auto-detection                                                     */
/* ------------------------------------------------------------------ */

describe("detectSelectorKind", () => {
    it.each([
        ["/html/body/div", "XPath"],
        ["./span", "XPath"],
        ["(/html/body)[1]", "XPath"],
        ["(./span)[1]", "XPath"],
        ["//button[@id='x']", "XPath"],
        ["#login", "Css"],
        ["button.primary", "Css"],
        ["div > span", "Css"],
        ["[data-test=ok]", "Css"],
        ["", "Css"],
    ])("%s → %s", (input, expected) => {
        expect(detectSelectorKind(input)).toBe(expected);
    });
});

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

describe("validateSelector", () => {
    it("rejects empty input", () => {
        const r = validateSelector("", "Css", { skipLiveCheck: true });
        expect(r.Ok).toBe(false);
    });

    it("accepts simple CSS without a live document", () => {
        const r = validateSelector("button.primary", "Css", { skipLiveCheck: true });
        expect(r.Ok).toBe(true);
    });

    it("rejects XPath that does not look like XPath", () => {
        const r = validateSelector("button.primary", "XPath", { skipLiveCheck: true });
        expect(r.Ok).toBe(false);
    });

    it("uses the live document for CSS errors when available", () => {
        const doc = {
            querySelector: vi.fn(() => { throw new Error("bad pseudo"); }),
        } as unknown as Document;
        const r = validateSelector(":nope:nope", "Css", { doc });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toContain("bad pseudo");
    });

    it("uses the live document for XPath errors when available", () => {
        const doc = {
            evaluate: vi.fn(() => { throw new Error("bad axis"); }),
        } as unknown as Document;
        const r = validateSelector("//bad[", "XPath", { doc });
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toContain("bad axis");
    });
});

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

describe("step-wait storage", () => {
    const sample: WaitConfig = {
        Selector: ".loading",
        Kind: "Css",
        Condition: "Disappears",
        TimeoutMs: 3_000,
    };

    it("round-trips a single config", () => {
        writeStepWait(42, sample);
        expect(readStepWait(42)).toEqual(sample);
    });

    it("readAllStepWaits returns the full map keyed by stepId", () => {
        writeStepWait(1, sample);
        writeStepWait(2, { ...sample, Selector: "//div[@id='x']", Kind: "XPath" });
        const map = readAllStepWaits();
        expect(map.size).toBe(2);
        expect(map.get(2)?.Kind).toBe("XPath");
    });

    it("clearStepWait removes a single row", () => {
        writeStepWait(7, sample);
        clearStepWait(7);
        expect(readStepWait(7)).toBeNull();
    });

    it("rejects non-positive stepId", () => {
        expect(() => writeStepWait(0, sample)).toThrow();
        expect(() => writeStepWait(-1, sample)).toThrow();
    });

    it("rejects empty selector", () => {
        expect(() => writeStepWait(1, { ...sample, Selector: "  " })).toThrow();
    });

    it("clamps timeout into the supported range", () => {
        const saved = writeStepWait(1, { ...sample, TimeoutMs: 999_999 });
        expect(saved.TimeoutMs).toBe(60_000);
        const saved2 = writeStepWait(1, { ...sample, TimeoutMs: 10 });
        expect(saved2.TimeoutMs).toBe(250);
    });

    it("recovers from corrupt JSON", () => {
        localStorage.setItem("marco.step-library.wait.v1", "{not json");
        expect(readAllStepWaits().size).toBe(0);
    });

    it("infers Kind from selector when missing in stored row", () => {
        // Simulate a hand-edited file with no Kind field.
        localStorage.setItem("marco.step-library.wait.v1", JSON.stringify({
            "5": { Selector: "//button", Condition: "Appears", TimeoutMs: 1000 },
        }));
        const v = readStepWait(5);
        expect(v?.Kind).toBe("XPath");
    });
});

/* ------------------------------------------------------------------ */
/*  Evaluation + condition                                             */
/* ------------------------------------------------------------------ */

function stubElement(visible: boolean): ElementLike {
    return {
        offsetWidth: visible ? 10 : 0,
        offsetHeight: visible ? 10 : 0,
        getClientRects: () => ({ length: visible ? 1 : 0 }),
    };
}

describe("isConditionSatisfied", () => {
    it("Appears → true when at least one match", () => {
        expect(isConditionSatisfied({ Condition: "Appears" }, [stubElement(false)])).toBe(true);
        expect(isConditionSatisfied({ Condition: "Appears" }, [])).toBe(false);
    });

    it("Disappears → true when zero matches", () => {
        expect(isConditionSatisfied({ Condition: "Disappears" }, [])).toBe(true);
        expect(isConditionSatisfied({ Condition: "Disappears" }, [stubElement(true)])).toBe(false);
    });

    it("Visible → true only when at least one match has layout", () => {
        expect(isConditionSatisfied({ Condition: "Visible" }, [stubElement(true)])).toBe(true);
        expect(isConditionSatisfied({ Condition: "Visible" }, [stubElement(false)])).toBe(false);
    });
});

describe("evaluateSelector", () => {
    it("returns [] when no document is available", () => {
        const r = evaluateSelector({ Selector: ".x", Kind: "Css" }, { doc: null });
        expect(r).toEqual([]);
    });

    it("uses querySelectorAll for CSS", () => {
        const root = {
            querySelectorAll: vi.fn(() => {
                const arr = [stubElement(true), stubElement(true)];
                return {
                    forEach: (cb: (el: ElementLike) => void) => arr.forEach(cb),
                };
            }),
        } as unknown as ParentNode;
        const r = evaluateSelector(
            { Selector: ".x", Kind: "Css" },
            { doc: {} as Document, root },
        );
        expect(r.length).toBe(2);
    });

    it("uses document.evaluate for XPath", () => {
        const snapshot = [stubElement(true)];
        const doc = {
            evaluate: vi.fn(() => ({
                snapshotLength: snapshot.length,
                snapshotItem: (i: number) => snapshot[i] as unknown as Node,
            })),
        } as unknown as Document;
        const r = evaluateSelector(
            { Selector: "//div", Kind: "XPath" },
            { doc, root: doc as unknown as ParentNode },
        );
        expect(r.length).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Wait loop                                                          */
/* ------------------------------------------------------------------ */

describe("waitForSelector", () => {
    const cfg: WaitConfig = {
        Selector: ".ready",
        Kind: "Css",
        Condition: "Appears",
        TimeoutMs: 1_000,
    };

    /** Stub document that satisfies validateSelector's live check. */
    const stubDoc = { querySelector: () => null } as unknown as Document;

    function makeRoot(matchesAtTick: number, ticker: () => number): ParentNode {
        return {
            querySelectorAll: () => {
                const arr = ticker() >= matchesAtTick ? [stubElement(true)] : [];
                return {
                    forEach: (cb: (el: ElementLike) => void) => arr.forEach(cb),
                };
            },
        } as unknown as ParentNode;
    }

    it("succeeds immediately when the condition is already true", async () => {
        let now = 1000;
        const r = await waitForSelector(cfg, {
            doc: stubDoc,
            root: makeRoot(0, () => now),
            now: () => now,
            sleep: async (ms) => { now += ms; },
        });
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.MatchCount).toBe(1);
    });

    it("succeeds after polling until the element appears", async () => {
        let now = 1000;
        const r = await waitForSelector(cfg, {
            doc: stubDoc,
            root: makeRoot(1300, () => now),
            now: () => now,
            sleep: async (ms) => { now += ms; },
            pollIntervalMs: 50,
        });
        expect(r.Ok).toBe(true);
        if (r.Ok) expect(r.DurationMs).toBeGreaterThanOrEqual(300);
    });

    it("times out when the condition never holds", async () => {
        let now = 1000;
        const r = await waitForSelector(cfg, {
            doc: stubDoc,
            root: makeRoot(Infinity, () => now),
            now: () => now,
            sleep: async (ms) => { now += ms; },
            pollIntervalMs: 100,
        });
        expect(r.Ok).toBe(false);
        if (!r.Ok) {
            expect(r.Reason).toBe("Timeout");
            expect(r.DurationMs).toBeGreaterThanOrEqual(1_000);
        }
    });

    it("returns InvalidSelector for empty selector without polling", async () => {
        const r = await waitForSelector(
            { ...cfg, Selector: "" },
            { doc: stubDoc, root: {} as ParentNode },
        );
        expect(r.Ok).toBe(false);
        if (!r.Ok) expect(r.Reason).toBe("InvalidSelector");
    });
});
