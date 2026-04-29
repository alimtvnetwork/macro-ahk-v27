/**
 * Marco Extension — Hotkey Executor Tests
 */

import { describe, expect, it, vi } from "vitest";
import {
    executeHotkeyStep,
    parseChord,
    parseHotkeyPayload,
} from "../hotkey-executor";

describe("parseChord", () => {
    it("parses a simple key", () => {
        const c = parseChord("Enter");
        expect(c.Key).toBe("Enter");
        expect(c.CtrlKey).toBe(false);
    });
    it("parses modifiers + key", () => {
        const c = parseChord("Ctrl+Shift+S");
        expect(c.CtrlKey).toBe(true);
        expect(c.ShiftKey).toBe(true);
        expect(c.Key).toBe("S");
        expect(c.Code).toBe("KeyS");
    });
    it("rejects empty chords", () => {
        expect(() => parseChord("")).toThrow();
    });
    it("rejects multiple non-modifier keys", () => {
        expect(() => parseChord("A+B")).toThrow(/multiple non-modifier/);
    });
});

describe("parseHotkeyPayload", () => {
    it("requires non-empty Keys array", () => {
        expect(() => parseHotkeyPayload(null)).toThrow();
        expect(() => parseHotkeyPayload('{"Keys":[]}')).toThrow();
    });
    it("validates WaitMs", () => {
        expect(() => parseHotkeyPayload('{"Keys":["A"],"WaitMs":-1}')).toThrow();
        const ok = parseHotkeyPayload('{"Keys":["A"],"WaitMs":250}');
        expect(ok.WaitMs).toBe(250);
    });
});

describe("executeHotkeyStep", () => {
    it("dispatches keydown+keyup for each chord and waits at the end", async () => {
        const events: string[] = [];
        const fakeDoc = {
            querySelector: () => null,
            dispatchEvent: (e: Event) => { events.push(e.type); return true; },
        };
        const setTimeoutCalls: number[] = [];
        const env = {
            document: fakeDoc as unknown as Document,
            setTimeout: ((cb: () => void, ms: number) => { setTimeoutCalls.push(ms); cb(); return 0; }) as typeof setTimeout,
        };
        await executeHotkeyStep({ Keys: ["Ctrl+S", "Enter"], WaitMs: 500 }, env);
        expect(events).toEqual(["keydown", "keyup", "keydown", "keyup"]);
        // 16ms inter-chord pause + final 500ms wait.
        expect(setTimeoutCalls).toEqual([16, 500]);
    });

    it("throws if Selector is given but matches no element", async () => {
        const fakeDoc = {
            querySelector: () => null,
            dispatchEvent: vi.fn(),
        };
        await expect(executeHotkeyStep(
            { Keys: ["Enter"], Selector: "#nope" },
            { document: fakeDoc as unknown as Document, setTimeout: ((cb: () => void) => { cb(); return 0; }) as typeof setTimeout },
        )).rejects.toThrow(/did not match/);
    });
});
