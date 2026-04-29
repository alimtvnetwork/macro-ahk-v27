/**
 * Marco Extension — Keyword Event playback tests
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { KeywordEvent } from "@/hooks/use-keyword-events";
import { parseCombo, runKeywordEvent } from "@/lib/keyword-event-playback";

describe("parseCombo", () => {
    it("parses modifier chord", () => {
        const p = parseCombo("Ctrl+Shift+Enter");
        expect(p).toEqual({ Key: "Enter", Ctrl: true, Shift: true, Alt: false, Meta: false });
    });
    it("treats meta/cmd/command as Meta", () => {
        expect(parseCombo("Cmd+K").Meta).toBe(true);
        expect(parseCombo("Command+K").Meta).toBe(true);
        expect(parseCombo("Meta+K").Meta).toBe(true);
    });
});

function makeEvent(steps: KeywordEvent["Steps"], enabled = true): KeywordEvent {
    return { Id: "ev1", Keyword: "test", Description: "", Enabled: enabled, Steps: steps };
}

describe("runKeywordEvent", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("dispatches keydown+keyup for each Key step", async () => {
        const target = document.createElement("div");
        const events: string[] = [];
        target.addEventListener("keydown", (e) => events.push(`down:${e.key}`));
        target.addEventListener("keyup", (e) => events.push(`up:${e.key}`));

        const ev = makeEvent([
            { Kind: "Key", Id: "s1", Combo: "Enter" },
            { Kind: "Key", Id: "s2", Combo: "Tab" },
        ]);
        const result = await runKeywordEvent(ev, { target });
        expect(result.Completed).toBe(true);
        expect(result.StepsRun).toBe(2);
        expect(events).toEqual(["down:Enter", "up:Enter", "down:Tab", "up:Tab"]);
    });

    it("waits the specified duration between steps", async () => {
        const target = document.createElement("div");
        const seen: string[] = [];
        target.addEventListener("keydown", (e) => seen.push(e.key));

        const ev = makeEvent([
            { Kind: "Key", Id: "s1", Combo: "A" },
            { Kind: "Wait", Id: "s2", DurationMs: 1000 },
            { Kind: "Key", Id: "s3", Combo: "B" },
        ]);
        const promise = runKeywordEvent(ev, { target });
        await vi.advanceTimersByTimeAsync(0);
        expect(seen).toEqual(["A"]);
        await vi.advanceTimersByTimeAsync(1000);
        const result = await promise;
        expect(seen).toEqual(["A", "B"]);
        expect(result.StepsRun).toBe(3);
    });

    it("aborts mid-wait when signal fires", async () => {
        const target = document.createElement("div");
        const ctrl = new AbortController();
        const ev = makeEvent([{ Kind: "Wait", Id: "s1", DurationMs: 5000 }]);
        const promise = runKeywordEvent(ev, { target, signal: ctrl.signal });
        ctrl.abort();
        const result = await promise;
        expect(result.Aborted).toBe(true);
        expect(result.Completed).toBe(false);
    });

    it("skips disabled events", async () => {
        const ev = makeEvent([{ Kind: "Key", Id: "s1", Combo: "Enter" }], false);
        const result = await runKeywordEvent(ev, { target: document.body });
        expect(result.StepsRun).toBe(0);
        expect(result.Completed).toBe(false);
    });
});
