/**
 * Marco Extension — Hotkey Executor: Edge-Case Tests
 *
 * Complements `hotkey-executor.test.ts` with deeper coverage of payload
 * parsing edge cases (modifier-only chords, unknown keys, malformed JSON
 * shapes) and chord sequencing (multi-chord ordering, inter-chord gap,
 * final WaitMs gating, target-element dispatch, and modifier propagation
 * through every dispatched event).
 */

import { describe, expect, it, vi } from "vitest";

import {
    dispatchChord,
    executeHotkeyStep,
    parseChord,
    parseHotkeyPayload,
    type HotkeyDispatchEnv,
    type ParsedChord,
} from "../hotkey-executor";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

interface CapturedEvent {
    readonly type: string;
    readonly key: string;
    readonly code: string;
    readonly ctrlKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    readonly metaKey: boolean;
}

interface RecordingEnv extends HotkeyDispatchEnv {
    readonly captured: CapturedEvent[];
    readonly timeoutDelays: number[];
}

function makeRecordingEnv(querySelectorImpl?: (sel: string) => Element | null): RecordingEnv {
    const captured: CapturedEvent[] = [];
    const timeoutDelays: number[] = [];
    const fakeDoc = {
        querySelector: querySelectorImpl ?? (() => null),
        dispatchEvent: (e: Event) => {
            const ke = e as KeyboardEvent;
            captured.push({
                type: ke.type,
                key: ke.key,
                code: ke.code,
                ctrlKey: ke.ctrlKey,
                altKey: ke.altKey,
                shiftKey: ke.shiftKey,
                metaKey: ke.metaKey,
            });
            return true;
        },
    };
    const env: HotkeyDispatchEnv & { captured: CapturedEvent[]; timeoutDelays: number[] } = {
        document: fakeDoc as unknown as Document,
        setTimeout: ((cb: () => void, ms: number) => { timeoutDelays.push(ms); cb(); return 0; }) as typeof setTimeout,
        captured,
        timeoutDelays,
    };
    return env as RecordingEnv;
}

/* ------------------------------------------------------------------ */
/*  parseChord — modifier-only & unknown-key edge cases                */
/* ------------------------------------------------------------------ */

describe("parseChord — modifiers-only", () => {
    it("rejects a single bare modifier", () => {
        expect(() => parseChord("Ctrl")).toThrow(/no non-modifier key/);
    });

    it("rejects a chord made only of modifiers", () => {
        expect(() => parseChord("Ctrl+Shift+Alt")).toThrow(/no non-modifier key/);
    });

    it("rejects modifier-only with all four modifiers", () => {
        expect(() => parseChord("Ctrl+Alt+Shift+Meta")).toThrow(/no non-modifier key/);
    });

    it("accepts modifier aliases (Cmd/Command/Super/Win all map to Meta)", () => {
        expect(parseChord("Cmd+K").MetaKey).toBe(true);
        expect(parseChord("Command+K").MetaKey).toBe(true);
        expect(parseChord("Super+K").MetaKey).toBe(true);
        expect(parseChord("Win+K").MetaKey).toBe(true);
    });

    it("accepts Control as an alias for Ctrl", () => {
        const c = parseChord("Control+S");
        expect(c.CtrlKey).toBe(true);
        expect(c.Key).toBe("S");
    });

    it("is case-insensitive on modifier names", () => {
        const c = parseChord("CTRL+sHiFt+a");
        expect(c.CtrlKey).toBe(true);
        expect(c.ShiftKey).toBe(true);
        expect(c.Key).toBe("a");
    });
});

describe("parseChord — unknown / non-letter keys", () => {
    it("preserves multi-letter named keys verbatim", () => {
        expect(parseChord("Enter").Key).toBe("Enter");
        expect(parseChord("Tab").Code).toBe("Tab");
        expect(parseChord("Escape").Code).toBe("Escape");
    });

    it("aliases Esc → Escape and arrow shorthands", () => {
        expect(parseChord("Esc").Code).toBe("Escape");
        expect(parseChord("Up").Code).toBe("ArrowUp");
        expect(parseChord("Down").Code).toBe("ArrowDown");
        expect(parseChord("Left").Code).toBe("ArrowLeft");
        expect(parseChord("Right").Code).toBe("ArrowRight");
    });

    it("maps single digits to Digit codes", () => {
        const c = parseChord("Ctrl+5");
        expect(c.Key).toBe("5");
        expect(c.Code).toBe("Digit5");
    });

    it("falls through unknown named keys without throwing", () => {
        // F-keys and exotic names aren't in the map but should round-trip.
        expect(parseChord("F12").Code).toBe("F12");
        expect(parseChord("MediaPlayPause").Code).toBe("MediaPlayPause");
        expect(parseChord("PrintScreen").Code).toBe("PrintScreen");
    });

    it("uppercases single-character key codes only", () => {
        // Single-letter Key is preserved as-typed; Code is uppercased into KeyX.
        const lower = parseChord("a");
        expect(lower.Key).toBe("a");
        expect(lower.Code).toBe("KeyA");
        const upper = parseChord("A");
        expect(upper.Key).toBe("A");
        expect(upper.Code).toBe("KeyA");
    });

    it("tolerates extra whitespace around segments", () => {
        const c = parseChord("  Ctrl  +  Shift  +  S  ");
        expect(c.CtrlKey).toBe(true);
        expect(c.ShiftKey).toBe(true);
        expect(c.Key).toBe("S");
    });

    it("ignores empty segments from leading/trailing/double pluses", () => {
        // "Ctrl++S" → segments ["Ctrl", "", "S"]; empty filtered out.
        const c = parseChord("Ctrl++S");
        expect(c.CtrlKey).toBe(true);
        expect(c.Key).toBe("S");
    });

    it("rejects whitespace-only chords as empty", () => {
        expect(() => parseChord("   ")).toThrow(/empty chord/);
    });

    it("rejects two non-modifier keys regardless of order", () => {
        expect(() => parseChord("Enter+Tab")).toThrow(/multiple non-modifier/);
        expect(() => parseChord("Ctrl+Enter+Tab")).toThrow(/multiple non-modifier/);
    });
});

/* ------------------------------------------------------------------ */
/*  parseHotkeyPayload — JSON shape edge cases                         */
/* ------------------------------------------------------------------ */

describe("parseHotkeyPayload — shape edge cases", () => {
    it("rejects whitespace-only JSON", () => {
        expect(() => parseHotkeyPayload("   ")).toThrow(/empty PayloadJson/);
    });

    it("rejects JSON arrays at the root (caught by missing Keys property)", () => {
        // Arrays pass `typeof raw === "object"` but lack a Keys field, so
        // they're rejected by the Keys validation step.
        expect(() => parseHotkeyPayload("[]")).toThrow(/Keys must be a non-empty array/);
    });

    it("rejects JSON primitives at the root", () => {
        expect(() => parseHotkeyPayload("42")).toThrow(/must be a JSON object/);
        expect(() => parseHotkeyPayload('"oops"')).toThrow(/must be a JSON object/);
        expect(() => parseHotkeyPayload("null")).toThrow(/must be a JSON object/);
    });

    it("reports JSON parse errors verbatim", () => {
        expect(() => parseHotkeyPayload("{not json")).toThrow(/invalid PayloadJson/);
    });

    it("rejects non-string entries inside Keys", () => {
        expect(() => parseHotkeyPayload('{"Keys":["A", 7]}')).toThrow(/entries must be strings/);
        expect(() => parseHotkeyPayload('{"Keys":[null]}')).toThrow(/entries must be strings/);
    });

    it("accepts WaitMs of zero (explicit no-op gate)", () => {
        const p = parseHotkeyPayload('{"Keys":["A"],"WaitMs":0}');
        expect(p.WaitMs).toBe(0);
    });

    it("rejects non-finite WaitMs", () => {
        // JSON.parse cannot represent Infinity/NaN, so cover via the typeof
        // guard with a string that fails the number check.
        expect(() => parseHotkeyPayload('{"Keys":["A"],"WaitMs":"500"}')).toThrow(/non-negative number/);
    });

    it("accepts WaitMs absent (treated as 0)", () => {
        const p = parseHotkeyPayload('{"Keys":["A"]}');
        expect(p.WaitMs).toBeUndefined();
    });

    it("rejects non-string Selector", () => {
        expect(() => parseHotkeyPayload('{"Keys":["A"],"Selector":12}')).toThrow(/Selector must be a string/);
    });

    it("preserves Selector when present", () => {
        const p = parseHotkeyPayload('{"Keys":["A"],"Selector":"#x"}');
        expect(p.Selector).toBe("#x");
    });
});

/* ------------------------------------------------------------------ */
/*  dispatchChord — modifier propagation                                */
/* ------------------------------------------------------------------ */

describe("dispatchChord", () => {
    it("propagates every modifier flag onto both keydown and keyup", () => {
        const env = makeRecordingEnv();
        const chord: ParsedChord = {
            Key: "K", Code: "KeyK",
            CtrlKey: true, AltKey: true, ShiftKey: true, MetaKey: true,
        };
        dispatchChord(env, chord);
        expect(env.captured).toEqual([
            { type: "keydown", key: "K", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true },
            { type: "keyup",   key: "K", code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true },
        ]);
    });

    it("dispatches to a target element when provided (not the document)", () => {
        const docEvents: string[] = [];
        const targetEvents: string[] = [];
        const fakeDoc = {
            querySelector: () => null,
            dispatchEvent: (e: Event) => { docEvents.push(e.type); return true; },
        };
        const target = {
            dispatchEvent: (e: Event) => { targetEvents.push(e.type); return true; },
        } as unknown as Element;
        const env: HotkeyDispatchEnv = {
            document: fakeDoc as unknown as Document,
            setTimeout: ((cb: () => void) => { cb(); return 0; }) as typeof setTimeout,
        };
        dispatchChord(env, { Key: "A", Code: "KeyA", CtrlKey: false, AltKey: false, ShiftKey: false, MetaKey: false }, target);
        expect(targetEvents).toEqual(["keydown", "keyup"]);
        expect(docEvents).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/*  executeHotkeyStep — multi-chord sequencing                          */
/* ------------------------------------------------------------------ */

describe("executeHotkeyStep — multi-chord sequencing", () => {
    it("dispatches three chords in order with two 16ms inter-chord gaps and no trailing wait when WaitMs is 0", async () => {
        const env = makeRecordingEnv();
        await executeHotkeyStep({ Keys: ["Ctrl+S", "Tab", "Enter"], WaitMs: 0 }, env);

        // 3 chords × (keydown, keyup) = 6 events, in chord order.
        expect(env.captured.map((c) => `${c.type}:${c.key}`)).toEqual([
            "keydown:S", "keyup:S",
            "keydown:Tab", "keyup:Tab",
            "keydown:Enter", "keyup:Enter",
        ]);
        // First chord has Ctrl held; second and third do not.
        expect(env.captured[0].ctrlKey).toBe(true);
        expect(env.captured[2].ctrlKey).toBe(false);
        expect(env.captured[4].ctrlKey).toBe(false);
        // Two gaps between the three chords; no trailing wait.
        expect(env.timeoutDelays).toEqual([16, 16]);
    });

    it("issues a final WaitMs gate after the last chord when > 0", async () => {
        const env = makeRecordingEnv();
        await executeHotkeyStep({ Keys: ["A", "B"], WaitMs: 250 }, env);
        // 1 inter-chord gap + 1 final wait.
        expect(env.timeoutDelays).toEqual([16, 250]);
    });

    it("dispatches a single chord with no inter-chord gap and no trailing wait", async () => {
        const env = makeRecordingEnv();
        await executeHotkeyStep({ Keys: ["Enter"] }, env);
        expect(env.captured).toHaveLength(2);
        expect(env.timeoutDelays).toEqual([]);
    });

    it("treats omitted WaitMs as 0 (no trailing setTimeout)", async () => {
        const env = makeRecordingEnv();
        await executeHotkeyStep({ Keys: ["A", "B", "C"] }, env);
        // Two inter-chord gaps; no final wait.
        expect(env.timeoutDelays).toEqual([16, 16]);
    });

    it("propagates per-chord modifiers independently across the sequence", async () => {
        const env = makeRecordingEnv();
        await executeHotkeyStep({ Keys: ["Ctrl+S", "Shift+Tab", "Alt+F4"] }, env);
        expect(env.captured[0]).toMatchObject({ key: "S", ctrlKey: true,  shiftKey: false, altKey: false });
        expect(env.captured[2]).toMatchObject({ key: "Tab", ctrlKey: false, shiftKey: true, altKey: false });
        expect(env.captured[4]).toMatchObject({ key: "F4", ctrlKey: false, shiftKey: false, altKey: true });
    });

    it("aborts the whole sequence on the first invalid chord without dispatching it", async () => {
        const env = makeRecordingEnv();
        await expect(
            executeHotkeyStep({ Keys: ["Enter", "A+B", "Tab"] }, env),
        ).rejects.toThrow(/multiple non-modifier/);
        // First chord dispatched; second threw before any events fired.
        expect(env.captured.map((c) => `${c.type}:${c.key}`)).toEqual([
            "keydown:Enter", "keyup:Enter",
        ]);
    });

    it("dispatches to the matched selector target for every chord", async () => {
        const targetEvents: string[] = [];
        const target = {
            dispatchEvent: (e: Event) => { targetEvents.push(`${e.type}:${(e as KeyboardEvent).key}`); return true; },
        } as unknown as Element;
        const env = makeRecordingEnv((sel) => sel === "#field" ? target : null);
        await executeHotkeyStep({ Keys: ["A", "B"], Selector: "#field" }, env);
        expect(targetEvents).toEqual([
            "keydown:A", "keyup:A",
            "keydown:B", "keyup:B",
        ]);
        // Document should NOT have received any of these chord events.
        expect(env.captured).toHaveLength(0);
    });

    it("treats empty-string Selector as no selector (dispatches to document, no querySelector call)", async () => {
        const querySelector = vi.fn(() => null);
        const env = makeRecordingEnv(querySelector);
        await executeHotkeyStep({ Keys: ["Enter"], Selector: "" }, env);
        expect(querySelector).not.toHaveBeenCalled();
        expect(env.captured.map((c) => c.type)).toEqual(["keydown", "keyup"]);
    });
});
