/**
 * Tests for the `reorderEvents` action exposed by `useKeywordEvents`.
 * Verifies the hook keeps the persisted events list in the order users
 * drop them via the panel's drag-and-drop UI.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useKeywordEvents } from "@/hooks/use-keyword-events";

const STORAGE_KEY = "marco-keyword-events-v1";

describe("useKeywordEvents — reorderEvents", () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        localStorage.clear();
    });

    function seedThree() {
        const { result } = renderHook(() => useKeywordEvents());
        let aId = "";
        let bId = "";
        let cId = "";
        act(() => { aId = result.current.addEvent("alpha"); });
        act(() => { bId = result.current.addEvent("beta"); });
        act(() => { cId = result.current.addEvent("gamma"); });
        return { result, aId, bId, cId };
    }

    it("moves an event from the start to the end", () => {
        const { result, aId, cId } = seedThree();
        expect(result.current.events.map(e => e.Keyword)).toEqual(["alpha", "beta", "gamma"]);

        act(() => { result.current.reorderEvents(aId, cId); });
        expect(result.current.events.map(e => e.Keyword)).toEqual(["beta", "gamma", "alpha"]);
    });

    it("moves an event from the end to the start", () => {
        const { result, aId, cId } = seedThree();
        act(() => { result.current.reorderEvents(cId, aId); });
        expect(result.current.events.map(e => e.Keyword)).toEqual(["gamma", "alpha", "beta"]);
    });

    it("is a no-op when fromId === toId", () => {
        const { result, bId } = seedThree();
        const before = result.current.events.map(e => e.Id);
        act(() => { result.current.reorderEvents(bId, bId); });
        expect(result.current.events.map(e => e.Id)).toEqual(before);
    });

    it("ignores unknown ids (stale drag from a removed row)", () => {
        const { result, aId } = seedThree();
        const before = result.current.events.map(e => e.Id);
        act(() => { result.current.reorderEvents(aId, "ghost-id"); });
        act(() => { result.current.reorderEvents("ghost-id", aId); });
        expect(result.current.events.map(e => e.Id)).toEqual(before);
    });

    it("persists the new order through localStorage", () => {
        const { result, aId, cId } = seedThree();
        act(() => { result.current.reorderEvents(aId, cId); });

        const raw = localStorage.getItem(STORAGE_KEY);
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw as string) as Array<{ Keyword: string }>;
        expect(parsed.map(e => e.Keyword)).toEqual(["beta", "gamma", "alpha"]);
    });

    it("preserves each event's steps and metadata after reorder", () => {
        const { result, aId, bId, cId } = seedThree();
        act(() => { result.current.addStep(aId, { Kind: "Key", Combo: "Enter" } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">); });
        act(() => { result.current.addStep(bId, { Kind: "Wait", DurationMs: 250 } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">); });

        act(() => { result.current.reorderEvents(cId, aId); });

        const byKeyword = Object.fromEntries(result.current.events.map(e => [e.Keyword, e]));
        expect(byKeyword.alpha.Steps).toHaveLength(1);
        expect(byKeyword.alpha.Steps[0]).toMatchObject({ Kind: "Key", Combo: "Enter" });
        expect(byKeyword.beta.Steps).toHaveLength(1);
        expect(byKeyword.beta.Steps[0]).toMatchObject({ Kind: "Wait", DurationMs: 250 });
        expect(byKeyword.gamma.Steps).toHaveLength(0);
    });
});
