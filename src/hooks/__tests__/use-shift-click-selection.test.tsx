/**
 * Tests for `useShiftClickSelection` and the pure `reduceSelectionClick`
 * reducer. We test the reducer directly for the full transition table, then
 * exercise the React binding for selection-pruning on list mutation.
 */

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import {
    computeRange,
    modifiersFromMouseEvent,
    reduceSelectionClick,
    useShiftClickSelection,
    type ShiftClickModifiers,
} from "@/hooks/use-shift-click-selection";

const NONE: ShiftClickModifiers = { shiftKey: false, toggleKey: false };
const SHIFT: ShiftClickModifiers = { shiftKey: true, toggleKey: false };
const TOGGLE: ShiftClickModifiers = { shiftKey: false, toggleKey: true };

describe("computeRange", () => {
    it("returns inclusive range in list order regardless of click order", () => {
        const ids = ["a", "b", "c", "d", "e"];
        expect(computeRange(ids, "b", "d")).toEqual(["b", "c", "d"]);
        expect(computeRange(ids, "d", "b")).toEqual(["b", "c", "d"]);
    });
    it("returns single id when from === to", () => {
        expect(computeRange(["a", "b"], "a", "a")).toEqual(["a"]);
    });
    it("returns empty when an id is missing", () => {
        expect(computeRange(["a", "b"], "a", "z")).toEqual([]);
    });
});

describe("reduceSelectionClick", () => {
    const ids = ["a", "b", "c", "d", "e"];

    it("plain click selects only that row and sets anchor", () => {
        const r = reduceSelectionClick(new Set(["a", "b"]), "a", ids, "c", NONE);
        expect([...r.next]).toEqual(["c"]);
        expect(r.nextAnchor).toBe("c");
    });

    it("toggle adds an unselected id and keeps existing", () => {
        const r = reduceSelectionClick(new Set(["a"]), "a", ids, "c", TOGGLE);
        expect([...r.next].sort()).toEqual(["a", "c"]);
        expect(r.nextAnchor).toBe("c");
    });

    it("toggle removes an already-selected id", () => {
        const r = reduceSelectionClick(new Set(["a", "c"]), "a", ids, "c", TOGGLE);
        expect([...r.next]).toEqual(["a"]);
        expect(r.nextAnchor).toBe("c");
    });

    it("shift-click extends from anchor in list order", () => {
        const r = reduceSelectionClick(new Set(["b"]), "b", ids, "d", SHIFT);
        expect([...r.next]).toEqual(["b", "c", "d"]);
        expect(r.nextAnchor).toBe("b");
    });

    it("shift-click downward then upward replaces with new range", () => {
        let r = reduceSelectionClick(new Set(["b"]), "b", ids, "e", SHIFT);
        expect([...r.next]).toEqual(["b", "c", "d", "e"]);
        r = reduceSelectionClick(r.next, r.nextAnchor, ids, "c", SHIFT);
        expect([...r.next]).toEqual(["b", "c"]);
    });

    it("shift-click with no anchor falls back to plain click", () => {
        const r = reduceSelectionClick(new Set<string>(), null, ids, "c", SHIFT);
        expect([...r.next]).toEqual(["c"]);
        expect(r.nextAnchor).toBe("c");
    });

    it("shift-click with stale anchor falls back to plain click", () => {
        const r = reduceSelectionClick(new Set(["x"]), "x", ids, "c", SHIFT);
        expect([...r.next]).toEqual(["c"]);
        expect(r.nextAnchor).toBe("c");
    });

    it("shift-click on the anchor itself selects only the anchor", () => {
        const r = reduceSelectionClick(new Set(["a", "b"]), "b", ids, "b", SHIFT);
        expect([...r.next]).toEqual(["b"]);
    });
});

describe("modifiersFromMouseEvent", () => {
    it("uses metaKey on mac, ctrlKey otherwise", () => {
        const e = { shiftKey: false, ctrlKey: true, metaKey: false };
        expect(modifiersFromMouseEvent(e, false).toggleKey).toBe(true);
        expect(modifiersFromMouseEvent(e, true).toggleKey).toBe(false);
        const mac = { shiftKey: true, ctrlKey: false, metaKey: true };
        expect(modifiersFromMouseEvent(mac, true)).toEqual({ shiftKey: true, toggleKey: true });
    });
});

describe("useShiftClickSelection", () => {
    it("selects, range-extends, and clears", () => {
        const ids = ["a", "b", "c", "d"];
        const { result } = renderHook(() => useShiftClickSelection(ids));
        act(() => { result.current.handleClick("b", NONE); });
        expect([...result.current.selected]).toEqual(["b"]);
        act(() => { result.current.handleClick("d", SHIFT); });
        expect([...result.current.selected]).toEqual(["b", "c", "d"]);
        act(() => { result.current.clear(); });
        expect(result.current.selected.size).toBe(0);
        expect(result.current.anchor).toBeNull();
    });

    it("prunes selection when ids disappear from the list", () => {
        const { result, rerender } = renderHook(
            ({ ids }: { ids: string[] }) => useShiftClickSelection(ids),
            { initialProps: { ids: ["a", "b", "c"] } },
        );
        act(() => { result.current.handleClick("a", NONE); });
        act(() => { result.current.handleClick("c", TOGGLE); });
        expect([...result.current.selected].sort()).toEqual(["a", "c"]);

        rerender({ ids: ["a", "b"] });
        // After re-render, the pruning effect runs. Wait a tick.
        expect([...result.current.selected]).toEqual(["a"]);
    });

    it("setSelection replaces the selection wholesale", () => {
        const { result } = renderHook(() => useShiftClickSelection(["a", "b", "c"]));
        act(() => { result.current.setSelection(["a", "c"]); });
        expect([...result.current.selected].sort()).toEqual(["a", "c"]);
    });
});
