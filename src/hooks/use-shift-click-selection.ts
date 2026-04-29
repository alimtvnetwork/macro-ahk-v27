/**
 * Marco Extension — useShiftClickSelection
 *
 * Generic Gmail-style multi-select hook. Tracks an ordered list of item ids
 * and a current selection set, plus an "anchor" id used for shift-click range
 * extension.
 *
 *   • Plain click (no modifier)     → selects only that row, anchor = row.
 *   • Ctrl/Cmd-click                → toggles that row, anchor = row.
 *   • Shift-click                   → selects every row between anchor and
 *                                     row inclusive (replaces selection).
 *                                     If no anchor yet, behaves like a plain
 *                                     click and sets the anchor.
 *
 * Designed as a pure hook so it can drive any list (keyword events, steps,
 * sessions, scripts, projects). Caller passes the current ordered ids on
 * every render — we recompute nothing extra unless the ids actually change.
 *
 * Selection survives reorder/insertion: ids that disappear from the list are
 * silently pruned so the selection set never holds dangling references.
 *
 * @see ./__tests__/use-shift-click-selection.test.tsx
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SelectionId = string | number;

export interface ShiftClickModifiers {
    readonly shiftKey: boolean;
    /** Either Ctrl (Win/Linux) or Meta/⌘ (macOS). Caller normalises. */
    readonly toggleKey: boolean;
}

export interface UseShiftClickSelectionApi<Id extends SelectionId> {
    /** Read-only Set of currently-selected ids. */
    readonly selected: ReadonlySet<Id>;
    /** Current anchor id (last "primary" click), or null if none. */
    readonly anchor: Id | null;
    /** Convenience: true when `id` is in the selection set. */
    readonly isSelected: (id: Id) => boolean;
    /**
     * Handle a click on `id` honouring shift / toggle modifiers. Returns the
     * resulting selection so callers can react synchronously if needed.
     */
    readonly handleClick: (id: Id, mods: ShiftClickModifiers) => ReadonlySet<Id>;
    /** Replace the selection with the given ids (e.g. "Select all"). */
    readonly setSelection: (ids: Iterable<Id>) => void;
    /** Empty the selection and clear the anchor. */
    readonly clear: () => void;
}

/**
 * Computes the inclusive range of ids between `from` and `to` in `orderedIds`.
 * Order of `from`/`to` does not matter. Unknown ids return an empty array.
 */
export function computeRange<Id extends SelectionId>(
    orderedIds: ReadonlyArray<Id>,
    from: Id,
    to: Id,
): Id[] {
    const fromIdx = orderedIds.indexOf(from);
    const toIdx = orderedIds.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return [];
    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    return orderedIds.slice(lo, hi + 1);
}

/**
 * Pure selection reducer — exported for unit tests so we can assert the
 * full transition table without spinning up React.
 */
export function reduceSelectionClick<Id extends SelectionId>(
    current: ReadonlySet<Id>,
    anchor: Id | null,
    orderedIds: ReadonlyArray<Id>,
    clickedId: Id,
    mods: ShiftClickModifiers,
): { next: Set<Id>; nextAnchor: Id | null } {
    if (mods.shiftKey && anchor !== null && anchor !== clickedId) {
        const range = computeRange(orderedIds, anchor, clickedId);
        if (range.length > 0) {
            return { next: new Set(range), nextAnchor: anchor };
        }
        // Range failed (anchor pruned) — treat as a plain click.
    }

    if (mods.toggleKey) {
        const next = new Set(current);
        if (next.has(clickedId)) {
            next.delete(clickedId);
        } else {
            next.add(clickedId);
        }
        return { next, nextAnchor: clickedId };
    }

    return { next: new Set<Id>([clickedId]), nextAnchor: clickedId };
}

export function useShiftClickSelection<Id extends SelectionId>(
    orderedIds: ReadonlyArray<Id>,
): UseShiftClickSelectionApi<Id> {
    const [selected, setSelected] = useState<ReadonlySet<Id>>(() => new Set<Id>());
    const [anchor, setAnchor] = useState<Id | null>(null);

    // Keep latest snapshot in a ref so handleClick stays referentially stable.
    const stateRef = useRef({ selected, anchor, orderedIds });
    stateRef.current = { selected, anchor, orderedIds };

    // Prune ids that vanished from the list (e.g. after delete/filter).
    useEffect(() => {
        const known = new Set(orderedIds);
        let mutated = false;
        const pruned = new Set<Id>();
        for (const id of selected) {
            if (known.has(id)) {
                pruned.add(id);
            } else {
                mutated = true;
            }
        }
        if (mutated) setSelected(pruned);
        if (anchor !== null && !known.has(anchor)) setAnchor(null);
    }, [orderedIds, selected, anchor]);

    const handleClick = useCallback((id: Id, mods: ShiftClickModifiers): ReadonlySet<Id> => {
        const snap = stateRef.current;
        const { next, nextAnchor } = reduceSelectionClick(
            snap.selected, snap.anchor, snap.orderedIds, id, mods,
        );
        setSelected(next);
        setAnchor(nextAnchor);
        return next;
    }, []);

    const setSelection = useCallback((ids: Iterable<Id>) => {
        setSelected(new Set(ids));
    }, []);

    const clear = useCallback(() => {
        setSelected(new Set<Id>());
        setAnchor(null);
    }, []);

    const isSelected = useCallback((id: Id) => selected.has(id), [selected]);

    return useMemo(() => ({
        selected, anchor, isSelected, handleClick, setSelection, clear,
    }), [selected, anchor, isSelected, handleClick, setSelection, clear]);
}

/**
 * Convenience: derive {shiftKey, toggleKey} from a native MouseEvent honouring
 * the platform (Cmd on macOS, Ctrl elsewhere).
 */
export function modifiersFromMouseEvent(
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    isMac: boolean,
): ShiftClickModifiers {
    return {
        shiftKey: event.shiftKey,
        toggleKey: isMac ? event.metaKey : event.ctrlKey,
    };
}
