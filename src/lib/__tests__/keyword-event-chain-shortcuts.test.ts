/**
 * Tests for the chain shortcut matcher.
 */

import { describe, expect, it } from "vitest";
import {
    describeRunShortcut,
    describeStopShortcut,
    isTypingTarget,
    matchChainShortcut,
    type ChainShortcutEvent,
} from "@/lib/keyword-event-chain-shortcuts";

const ev = (overrides: Partial<ChainShortcutEvent> = {}): ChainShortcutEvent => ({
    key: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
});

const fakeEl = (tag: string, contentEditable = false): EventTarget => ({
    tagName: tag,
    isContentEditable: contentEditable,
} as unknown as EventTarget);

describe("isTypingTarget", () => {
    it("flags inputs, textareas, selects", () => {
        expect(isTypingTarget(fakeEl("INPUT"))).toBe(true);
        expect(isTypingTarget(fakeEl("TEXTAREA"))).toBe(true);
        expect(isTypingTarget(fakeEl("SELECT"))).toBe(true);
        expect(isTypingTarget(fakeEl("input"))).toBe(true); // case-insensitive
    });
    it("flags contenteditable elements", () => {
        expect(isTypingTarget(fakeEl("DIV", true))).toBe(true);
    });
    it("ignores buttons and divs", () => {
        expect(isTypingTarget(fakeEl("BUTTON"))).toBe(false);
        expect(isTypingTarget(fakeEl("DIV"))).toBe(false);
    });
    it("is null-safe", () => {
        expect(isTypingTarget(null)).toBe(false);
    });
});

describe("matchChainShortcut — Run", () => {
    it("matches Ctrl+Enter when idle and events exist", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true }),
            { chainRunning: false, enabledCount: 2 },
        )).toBe("run");
    });

    it("matches Cmd+Enter (metaKey) when idle and events exist", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", metaKey: true }),
            { chainRunning: false, enabledCount: 1 },
        )).toBe("run");
    });

    it("ignores Enter without a primary modifier", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter" }),
            { chainRunning: false, enabledCount: 1 },
        )).toBeNull();
    });

    it("ignores Ctrl+Shift+Enter so Shift+Enter newline insertion isn't shadowed", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true, shiftKey: true }),
            { chainRunning: false, enabledCount: 1 },
        )).toBeNull();
    });

    it("ignores Ctrl+Alt+Enter (reserved for OS/extension chords)", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true, altKey: true }),
            { chainRunning: false, enabledCount: 1 },
        )).toBeNull();
    });

    it("does not run from inside an input field", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true, target: fakeEl("INPUT") }),
            { chainRunning: false, enabledCount: 2 },
        )).toBeNull();
    });

    it("does not run while the chain is already running", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true }),
            { chainRunning: true, enabledCount: 2 },
        )).toBeNull();
    });

    it("does not run when there is nothing enabled to run", () => {
        expect(matchChainShortcut(
            ev({ key: "Enter", ctrlKey: true }),
            { chainRunning: false, enabledCount: 0 },
        )).toBeNull();
    });
});

describe("matchChainShortcut — Stop", () => {
    it("matches plain Escape while running", () => {
        expect(matchChainShortcut(
            ev({ key: "Escape" }),
            { chainRunning: true, enabledCount: 0 },
        )).toBe("stop");
    });

    it("ignores Escape while idle (so users can still close popovers)", () => {
        expect(matchChainShortcut(
            ev({ key: "Escape" }),
            { chainRunning: false, enabledCount: 5 },
        )).toBeNull();
    });

    it("ignores Escape with modifiers", () => {
        expect(matchChainShortcut(
            ev({ key: "Escape", ctrlKey: true }),
            { chainRunning: true, enabledCount: 0 },
        )).toBeNull();
        expect(matchChainShortcut(
            ev({ key: "Escape", shiftKey: true }),
            { chainRunning: true, enabledCount: 0 },
        )).toBeNull();
    });

    it("does not stop from inside a text field — Escape is a common 'cancel edit' reflex", () => {
        expect(matchChainShortcut(
            ev({ key: "Escape", target: fakeEl("INPUT") }),
            { chainRunning: true, enabledCount: 0 },
        )).toBeNull();
    });
});

describe("shortcut labels", () => {
    it("uses ⌘ on macOS and Ctrl elsewhere", () => {
        expect(describeRunShortcut(true)).toBe("⌘ Enter");
        expect(describeRunShortcut(false)).toBe("Ctrl+Enter");
    });
    it("describes Stop as Esc", () => {
        expect(describeStopShortcut()).toBe("Esc");
    });
});
