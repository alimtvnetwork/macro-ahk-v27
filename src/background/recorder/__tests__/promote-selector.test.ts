/**
 * Tests — Promote Fallback Selector to Primary
 */

import { describe, it, expect } from "vitest";
import { promoteSelectorToPrimary } from "../promote-selector";
import type { PersistedSelector } from "../step-persistence";

const sel = (id: number, isPrimary: 0 | 1, expr = `expr-${id}`): PersistedSelector => ({
    SelectorId: id,
    StepId: 1,
    SelectorKindId: 3, // Css
    Expression: expr,
    AnchorSelectorId: null,
    IsPrimary: isPrimary,
});

describe("promoteSelectorToPrimary", () => {
    it("demotes the previous primary and promotes the target", () => {
        const list = [sel(10, 1), sel(11, 0), sel(12, 0)];
        const r = promoteSelectorToPrimary(list, 11);
        expect(r.Error).toBeNull();
        expect(r.PromotedSelectorId).toBe(11);
        expect(r.DemotedSelectorId).toBe(10);
        const updated = r.Selectors!;
        expect(updated.find((s) => s.SelectorId === 11)!.IsPrimary).toBe(1);
        expect(updated.find((s) => s.SelectorId === 10)!.IsPrimary).toBe(0);
        expect(updated.find((s) => s.SelectorId === 12)!.IsPrimary).toBe(0);
    });

    it("places the new primary first in the returned list", () => {
        const list = [sel(10, 1), sel(11, 0), sel(12, 0)];
        const r = promoteSelectorToPrimary(list, 12);
        expect(r.Selectors![0].SelectorId).toBe(12);
        expect(r.Selectors![0].IsPrimary).toBe(1);
    });

    it("does not mutate the input list", () => {
        const list = [sel(10, 1), sel(11, 0)];
        const snapshot = JSON.parse(JSON.stringify(list));
        promoteSelectorToPrimary(list, 11);
        expect(list).toEqual(snapshot);
    });

    it("rejects when the target SelectorId is not in the list", () => {
        const r = promoteSelectorToPrimary([sel(10, 1), sel(11, 0)], 999);
        expect(r.Error?.Code).toBe("TargetNotFound");
        expect(r.Selectors).toBeNull();
    });

    it("rejects when the target is already primary", () => {
        const r = promoteSelectorToPrimary([sel(10, 1), sel(11, 0)], 10);
        expect(r.Error?.Code).toBe("AlreadyPrimary");
    });

    it("rejects when the input list is empty", () => {
        const r = promoteSelectorToPrimary([], 1);
        expect(r.Error?.Code).toBe("EmptyInput");
    });

    it("handles lists with no existing primary (DemotedSelectorId === null)", () => {
        const list = [sel(10, 0), sel(11, 0)];
        const r = promoteSelectorToPrimary(list, 11);
        expect(r.Error).toBeNull();
        expect(r.DemotedSelectorId).toBeNull();
        expect(r.Selectors!.find((s) => s.SelectorId === 11)!.IsPrimary).toBe(1);
    });

    it("preserves all non-IsPrimary fields on every selector", () => {
        const list = [sel(10, 1, "old-primary"), sel(11, 0, "fallback-css")];
        const r = promoteSelectorToPrimary(list, 11);
        const promoted = r.Selectors!.find((s) => s.SelectorId === 11)!;
        expect(promoted.Expression).toBe("fallback-css");
        expect(promoted.SelectorKindId).toBe(3);
        expect(promoted.StepId).toBe(1);
    });
});
