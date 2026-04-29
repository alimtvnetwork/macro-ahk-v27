/**
 * Marco Extension — live-tree-filter tests
 */

import { describe, expect, it } from "vitest";

import { filterLiveTree, type LiveTreeNode } from "@/lib/live-tree-filter";
import { StepKindId } from "@/background/recorder/step-library/schema";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";

function makeGroup(id: number, name: string, parent: number | null = null): StepGroupRow {
    return {
        StepGroupId: id,
        ProjectId: 1,
        ParentStepGroupId: parent,
        Name: name,
        Description: null,
        OrderIndex: id,
        IsArchived: false,
        CreatedAt: "2026-04-27T00:00:00.000Z",
        UpdatedAt: "2026-04-27T00:00:00.000Z",
    };
}

function makeStep(id: number, groupId: number, label: string | null, kind: StepKindId = StepKindId.Click): StepRow {
    return {
        StepId: id,
        StepGroupId: groupId,
        OrderIndex: id,
        StepKindId: kind,
        Label: label,
        PayloadJson: "{}",
        TargetStepGroupId: null,
        IsDisabled: false,
        CreatedAt: "2026-04-27T00:00:00.000Z",
        UpdatedAt: "2026-04-27T00:00:00.000Z",
    };
}

/**
 *  Login          (1)
 *    Forms        (2)
 *      [Click  Submit button]
 *      [Type   Email field]
 *  Checkout       (3)
 *    [Click Pay]
 */
function fixture(): { forest: LiveTreeNode[]; stepsByGroup: Map<number, StepRow[]> } {
    const login = makeGroup(1, "Login");
    const forms = makeGroup(2, "Forms", 1);
    const checkout = makeGroup(3, "Checkout");

    const forest: LiveTreeNode[] = [
        { Group: login, Children: [{ Group: forms, Children: [] }] },
        { Group: checkout, Children: [] },
    ];
    const stepsByGroup = new Map<number, StepRow[]>([
        [2, [makeStep(10, 2, "Submit button", StepKindId.Click), makeStep(11, 2, "Email field", StepKindId.Type)]],
        [3, [makeStep(20, 3, "Pay", StepKindId.Click)]],
    ]);
    return { forest, stepsByGroup };
}

describe("filterLiveTree", () => {
    it("returns the input unchanged for an empty query", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "");
        expect(r.Forest).toHaveLength(2);
        expect(r.ExpandIds.size).toBe(0);
        expect(r.StepMatchCount).toBe(0);
        expect(r.GroupMatchCount).toBe(0);
        expect(r.StepsByGroup).toBe(stepsByGroup);
    });

    it("returns the input unchanged for whitespace-only queries", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "   ");
        expect(r.Forest).toHaveLength(2);
        expect(r.StepsByGroup).toBe(stepsByGroup);
    });

    it("matches by group name and includes the whole subtree", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "login");
        expect(r.GroupMatchCount).toBe(1);
        expect(r.Forest).toHaveLength(1);
        expect(r.Forest[0].Group.Name).toBe("Login");
        // Forms steps should remain available because the parent matched.
        expect(r.StepsByGroup.get(2)).toHaveLength(2);
    });

    it("keeps ancestors when a descendant step matches", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "submit");
        expect(r.Forest).toHaveLength(1);
        expect(r.Forest[0].Group.Name).toBe("Login");
        expect(r.Forest[0].Children).toHaveLength(1);
        expect(r.Forest[0].Children[0].Group.Name).toBe("Forms");
        expect(r.StepsByGroup.get(2)).toHaveLength(1);
        expect(r.StepsByGroup.get(2)?.[0].Label).toBe("Submit button");
        expect(r.StepMatchCount).toBe(1);
        // Both ancestors should be flagged for auto-expansion.
        expect(r.ExpandIds.has(1)).toBe(true);
        expect(r.ExpandIds.has(2)).toBe(true);
    });

    it("matches by step kind label (e.g. searching 'type')", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "type");
        expect(r.StepMatchCount).toBe(1);
        expect(r.StepsByGroup.get(2)?.[0].Label).toBe("Email field");
    });

    it("returns an empty forest when nothing matches", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "nonexistent-zzzzz");
        expect(r.Forest).toHaveLength(0);
        expect(r.StepMatchCount).toBe(0);
        expect(r.GroupMatchCount).toBe(0);
        expect(r.ExpandIds.size).toBe(0);
    });

    it("is case-insensitive", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "CHECKOUT");
        expect(r.GroupMatchCount).toBe(1);
        expect(r.Forest[0].Group.Name).toBe("Checkout");
    });

    it("can match multiple branches simultaneously", () => {
        const { forest, stepsByGroup } = fixture();
        const r = filterLiveTree(forest, stepsByGroup, "click");
        // Click kind label appears under Forms ('Submit button') and Checkout ('Pay').
        expect(r.Forest).toHaveLength(2);
        expect(r.StepMatchCount).toBe(2);
    });
});
