/**
 * Marco Extension — Live Tree Filter
 *
 * Pure helpers used by {@link RecorderLiveTreePanel} to filter the
 * `Project → StepGroup → SubGroup → Steps` forest by a free-text query
 * entered in the panel's search box. Kept side-effect-free so it can be
 * unit-tested in isolation from React.
 *
 * Match contract:
 *   - **Case-insensitive** substring match on `Group.Name`, `Step.Label`,
 *     and the step kind label (e.g. "Click", "Type") so users can search
 *     `"submit"` and locate every Submit step.
 *   - When a group's own name matches, the entire subtree is included so
 *     the user can drill in normally.
 *   - When only a descendant matches, ancestors are kept as breadcrumbs
 *     so the matching node is reachable without losing context.
 *   - Empty / whitespace-only queries return the input unchanged so the
 *     panel renders the full tree at zero cost.
 */

import { stepKindLabel } from "@/hooks/use-step-library";
import type { StepGroupRow, StepRow } from "@/background/recorder/step-library/db";

export interface LiveTreeNode {
    readonly Group: StepGroupRow;
    readonly Children: LiveTreeNode[];
}

export interface LiveTreeFilterResult {
    /** Filtered forest — empty iff there are zero matches. */
    readonly Forest: LiveTreeNode[];
    /** GroupIds that should be force-expanded so matches are visible. */
    readonly ExpandIds: ReadonlySet<number>;
    /** Per-group filtered step lists (only matching steps when filtering). */
    readonly StepsByGroup: ReadonlyMap<number, ReadonlyArray<StepRow>>;
    /** Total number of step rows that matched. */
    readonly StepMatchCount: number;
    /** Total number of group rows that matched (by name). */
    readonly GroupMatchCount: number;
}

function normalize(query: string): string {
    return query.trim().toLowerCase();
}

function stepMatches(step: StepRow, q: string): boolean {
    const label = (step.Label ?? "").toLowerCase();
    if (label.includes(q)) { return true; }
    return stepKindLabel(step.StepKindId).toLowerCase().includes(q);
}

export function filterLiveTree(
    forest: ReadonlyArray<LiveTreeNode>,
    stepsByGroup: ReadonlyMap<number, ReadonlyArray<StepRow>>,
    rawQuery: string,
): LiveTreeFilterResult {
    const q = normalize(rawQuery);
    if (q.length === 0) {
        return {
            Forest: forest.map((n) => cloneNode(n)),
            ExpandIds: new Set(),
            StepsByGroup: stepsByGroup,
            StepMatchCount: 0,
            GroupMatchCount: 0,
        };
    }

    const expand = new Set<number>();
    const filteredSteps = new Map<number, ReadonlyArray<StepRow>>();
    let stepMatchCount = 0;
    let groupMatchCount = 0;

    /**
     * Recursive walker. Returns `null` when the node and its descendants
     * have no matches; otherwise returns a pruned clone with only the
     * branches that lead to a match.
     *
     * `inheritedMatch` is `true` when an ancestor's name matched — in that
     * case the entire subtree is included verbatim (no per-node filtering)
     * so the user sees the matched group's full content.
     */
    function walk(node: LiveTreeNode, inheritedMatch: boolean): LiveTreeNode | null {
        const groupNameMatch = node.Group.Name.toLowerCase().includes(q);
        const effectiveMatch = inheritedMatch || groupNameMatch;
        const ownSteps = stepsByGroup.get(node.Group.StepGroupId) ?? [];

        const matchedSteps = effectiveMatch
            ? ownSteps
            : ownSteps.filter((s) => stepMatches(s, q));

        const children = node.Children
            .map((c) => walk(c, effectiveMatch))
            .filter((c): c is LiveTreeNode => c !== null);

        const hasOwnMatch = effectiveMatch || matchedSteps.length > 0;
        if (!hasOwnMatch && children.length === 0) { return null; }

        if (groupNameMatch) { groupMatchCount += 1; }
        // Always count the steps we'll surface, including those auto-included
        // when the parent group matched, so the result count matches what the
        // user actually sees in the tree.
        stepMatchCount += matchedSteps.length;
        if (matchedSteps.length > 0) {
            filteredSteps.set(node.Group.StepGroupId, matchedSteps);
        }
        expand.add(node.Group.StepGroupId);
        return { Group: node.Group, Children: children };
    }

    const filteredForest = forest
        .map((n) => walk(n, false))
        .filter((n): n is LiveTreeNode => n !== null);

    return {
        Forest: filteredForest,
        ExpandIds: expand,
        StepsByGroup: filteredSteps,
        StepMatchCount: stepMatchCount,
        GroupMatchCount: groupMatchCount,
    };
}

function cloneNode(node: LiveTreeNode): LiveTreeNode {
    return { Group: node.Group, Children: node.Children.map(cloneNode) };
}
