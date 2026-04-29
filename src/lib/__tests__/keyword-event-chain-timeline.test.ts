/**
 * Tests for the pure timeline reducer used by the chain progress log.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
    EMPTY_TIMELINE,
    MAX_TIMELINE_ENTRIES,
    __resetTimelineIdsForTests,
    describeStep,
    recordChainEnd,
    recordEventEnd,
    recordEventStart,
    recordStep,
    startTimeline,
} from "@/lib/keyword-event-chain-timeline";
import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";

const ev = (id: string, keyword = "go"): KeywordEvent => ({
    Id: id,
    Keyword: keyword,
    Description: "",
    Steps: [],
    Enabled: true,
});

const keyStep: KeywordEventStep = { Kind: "Key", Id: "s1", Combo: "Ctrl+Enter" };
const waitStep: KeywordEventStep = { Kind: "Wait", Id: "s2", DurationMs: 250 };

beforeEach(() => { __resetTimelineIdsForTests(); });

describe("describeStep", () => {
    it("formats key combos", () => {
        expect(describeStep(keyStep)).toBe("Key Ctrl+Enter");
    });
    it("formats waits with ms", () => {
        expect(describeStep(waitStep)).toBe("Wait 250ms");
    });
    it("flags empty combos", () => {
        expect(describeStep({ Kind: "Key", Id: "x", Combo: "  " })).toBe("Key (empty)");
    });
});

describe("timeline reducer", () => {
    it("starts empty until startTimeline", () => {
        expect(EMPTY_TIMELINE.Entries.length).toBe(0);
        expect(EMPTY_TIMELINE.StartedAtMs).toBeNull();
        const s = startTimeline(1_000);
        expect(s.StartedAtMs).toBe(1_000);
        expect(s.Entries.length).toBe(0);
    });

    it("records an event start with offset ms", () => {
        const s0 = startTimeline(1_000);
        const s1 = recordEventStart(s0, ev("a"), 0, 2, 1_120);
        expect(s1.Entries.length).toBe(1);
        const e = s1.Entries[0];
        expect(e.Kind).toBe("EventStart");
        if (e.Kind === "EventStart") {
            expect(e.AtMs).toBe(120);
            expect(e.Keyword).toBe("go");
            expect(e.Index).toBe(0);
            expect(e.Total).toBe(2);
        }
    });

    it("clamps negative offsets to zero", () => {
        const s0 = startTimeline(2_000);
        const s1 = recordEventStart(s0, ev("a"), 0, 1, 1_500);
        const e = s1.Entries[0];
        if (e.Kind === "EventStart") { expect(e.AtMs).toBe(0); }
    });

    it("records steps with labels", () => {
        const s0 = startTimeline(0);
        const s1 = recordStep(s0, ev("a"), keyStep, 0, 50);
        const s2 = recordStep(s1, ev("a"), waitStep, 1, 80);
        expect(s2.Entries.length).toBe(2);
        const a = s2.Entries[0];
        const b = s2.Entries[1];
        if (a.Kind === "Step") { expect(a.Label).toBe("Key Ctrl+Enter"); }
        if (b.Kind === "Step") { expect(b.Label).toBe("Wait 250ms"); expect(b.StepIndex).toBe(1); }
    });

    it("records event end and chain end", () => {
        let s = startTimeline(0);
        s = recordEventEnd(s, ev("a"), { Completed: true, Aborted: false, StepsRun: 1 }, 100);
        s = recordChainEnd(s, { Completed: 1, Attempted: 1, Aborted: false }, 110);
        expect(s.Entries.length).toBe(2);
        const end = s.Entries[0];
        const chain = s.Entries[1];
        if (end.Kind === "EventEnd") { expect(end.Completed).toBe(true); }
        if (chain.Kind === "ChainEnd") {
            expect(chain.Completed).toBe(1);
            expect(chain.Attempted).toBe(1);
            expect(chain.Aborted).toBe(false);
        }
    });

    it("appends entries in order without mutating prior state", () => {
        const s0 = startTimeline(0);
        const s1 = recordEventStart(s0, ev("a"), 0, 1, 0);
        const s2 = recordStep(s1, ev("a"), keyStep, 0, 1);
        expect(s0.Entries.length).toBe(0);
        expect(s1.Entries.length).toBe(1);
        expect(s2.Entries.length).toBe(2);
        expect(s2.Entries[0].Kind).toBe("EventStart");
        expect(s2.Entries[1].Kind).toBe("Step");
    });

    it("caps the log at MAX_TIMELINE_ENTRIES with FIFO eviction", () => {
        let s = startTimeline(0);
        const total = MAX_TIMELINE_ENTRIES + 25;
        for (let i = 0; i < total; i += 1) {
            s = recordStep(s, ev("a"), keyStep, i, i);
        }
        expect(s.Entries.length).toBe(MAX_TIMELINE_ENTRIES);
        const first = s.Entries[0];
        const last = s.Entries[s.Entries.length - 1];
        if (first.Kind === "Step") { expect(first.StepIndex).toBe(25); }
        if (last.Kind === "Step") { expect(last.StepIndex).toBe(total - 1); }
    });

    it("assigns unique ids to entries", () => {
        let s = startTimeline(0);
        s = recordEventStart(s, ev("a"), 0, 1, 0);
        s = recordStep(s, ev("a"), keyStep, 0, 1);
        s = recordEventEnd(s, ev("a"), { Completed: true, Aborted: false, StepsRun: 1 }, 2);
        const ids = s.Entries.map(e => e.Id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
