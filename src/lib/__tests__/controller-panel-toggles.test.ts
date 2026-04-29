/**
 * Marco Extension — controller-panel-toggles tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_PANEL_TOGGLES,
    __resetPanelTogglesForTests,
    loadPanelToggles,
    savePanelToggles,
    type PanelToggles,
} from "@/lib/controller-panel-toggles";

const STORAGE_KEY = "marco-floating-controller-panels-v1";

beforeEach(() => { __resetPanelTogglesForTests(); });
afterEach(() => { __resetPanelTogglesForTests(); });

describe("loadPanelToggles", () => {
    it("returns DEFAULT_PANEL_TOGGLES when no entry exists", () => {
        expect(loadPanelToggles("sess-A")).toEqual(DEFAULT_PANEL_TOGGLES);
    });

    it("returns defaults for an empty SessionId", () => {
        expect(loadPanelToggles("")).toEqual(DEFAULT_PANEL_TOGGLES);
    });

    it("returns defaults when storage holds malformed JSON", () => {
        window.localStorage.setItem(STORAGE_KEY, "not-json{{{");
        expect(loadPanelToggles("sess-A")).toEqual(DEFAULT_PANEL_TOGGLES);
    });

    it("ignores entries with the wrong shape", () => {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ Sessions: { "sess-A": { Actions: "yes" } }, Order: ["sess-A"] }),
        );
        expect(loadPanelToggles("sess-A")).toEqual(DEFAULT_PANEL_TOGGLES);
    });
});

describe("savePanelToggles", () => {
    it("round-trips a single session", () => {
        const t: PanelToggles = { Actions: false, Tree: true, Hotkey: true };
        savePanelToggles("sess-A", t);
        expect(loadPanelToggles("sess-A")).toEqual(t);
    });

    it("isolates per-session state", () => {
        savePanelToggles("sess-A", { Actions: true, Tree: true, Hotkey: false });
        savePanelToggles("sess-B", { Actions: false, Tree: false, Hotkey: true });
        expect(loadPanelToggles("sess-A")).toEqual({ Actions: true, Tree: true, Hotkey: false });
        expect(loadPanelToggles("sess-B")).toEqual({ Actions: false, Tree: false, Hotkey: true });
    });

    it("overwrites the previous entry for the same session", () => {
        savePanelToggles("sess-A", { Actions: true, Tree: true, Hotkey: true });
        savePanelToggles("sess-A", { Actions: false, Tree: false, Hotkey: false });
        expect(loadPanelToggles("sess-A")).toEqual({ Actions: false, Tree: false, Hotkey: false });
    });

    it("ignores writes with an empty SessionId", () => {
        savePanelToggles("", { Actions: false, Tree: true, Hotkey: true });
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("trims to the most recent 20 sessions (LRU)", () => {
        for (let i = 0; i < 25; i += 1) {
            savePanelToggles(`sess-${i}`, { Actions: i % 2 === 0, Tree: false, Hotkey: false });
        }
        // Earliest 5 should have been evicted; latest 20 retained.
        expect(loadPanelToggles("sess-0")).toEqual(DEFAULT_PANEL_TOGGLES);
        expect(loadPanelToggles("sess-4")).toEqual(DEFAULT_PANEL_TOGGLES);
        expect(loadPanelToggles("sess-5").Actions).toBe(false); // 5 % 2 !== 0
        expect(loadPanelToggles("sess-24").Actions).toBe(true); // 24 % 2 === 0
    });

    it("re-touching a session moves it to the MRU end so it survives trimming", () => {
        savePanelToggles("sess-keep", { Actions: false, Tree: true, Hotkey: false });
        // Bury it under 24 newer writes, but re-touch halfway through.
        for (let i = 0; i < 12; i += 1) { savePanelToggles(`sess-x${i}`, DEFAULT_PANEL_TOGGLES); }
        savePanelToggles("sess-keep", { Actions: false, Tree: true, Hotkey: true });
        for (let i = 12; i < 25; i += 1) { savePanelToggles(`sess-x${i}`, DEFAULT_PANEL_TOGGLES); }
        expect(loadPanelToggles("sess-keep")).toEqual({ Actions: false, Tree: true, Hotkey: true });
    });
});
