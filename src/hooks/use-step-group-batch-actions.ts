/**
 * Marco Extension — useStepGroupBatchActions
 *
 * Cross-panel helper that powers the toolbar batch actions:
 *
 *   • `buildDeletePreview` — given selected ids, walks the full
 *     groups list and returns one `BatchDeleteRow` per *root* of the
 *     selection (no duplicate listing of descendants the user would
 *     also lose). Each row carries cascading counts for the dialog.
 *
 *   • `applyBatchRename` — commits a list of rename changes, then
 *     returns a closure that re-applies the original names. Callers
 *     wire that closure to the toast's "Undo" action.
 *
 * Pure functions on top of the existing `useStepLibrary` API — no
 * extra DB schema needed. Keeping them outside the panels means they
 * can be unit-tested without React.
 *
 * @see ./BatchRenameDialog.tsx
 * @see ./BatchDeleteDialog.tsx
 */

import { useCallback } from "react";

import type { StepGroupRow } from "@/background/recorder/step-library/db";
import type { UseStepLibraryApi } from "@/hooks/use-step-library";
import type { BatchDeleteRow } from "@/components/options/BatchDeleteDialog";
import type { BatchRenameChange } from "@/components/options/BatchRenameDialog";

/* ------------------------------------------------------------------ */
/*  Delete preview                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build the per-row delete preview shown in `BatchDeleteDialog`.
 *
 * Important: when the user selects a parent AND its child, only the
 * parent appears in the dialog — the child is implicitly deleted by
 * the cascade and listing it twice would inflate the totals. We do
 * include the child's nested+step counts in the parent's roll-up.
 */
export function buildDeletePreview(
    selectedIds: ReadonlyArray<number>,
    allGroups: ReadonlyArray<StepGroupRow>,
    stepsByGroup: ReadonlyMap<number, ReadonlyArray<unknown>>,
): BatchDeleteRow[] {
    const selected = new Set(selectedIds);
    const byParent = new Map<number | null, StepGroupRow[]>();
    const byId = new Map<number, StepGroupRow>();
    for (const g of allGroups) {
        byId.set(g.StepGroupId, g);
        const key = g.ParentStepGroupId ?? null;
        const arr = byParent.get(key) ?? [];
        arr.push(g);
        byParent.set(key, arr);
    }

    // A "root of selection" = a selected group whose nearest selected
    // ancestor is itself. Deleting the ancestor cascades, so listing
    // descendants would double-count.
    const isRoot = (g: StepGroupRow): boolean => {
        let cursor: number | null = g.ParentStepGroupId ?? null;
        while (cursor !== null) {
            if (selected.has(cursor)) return false;
            const parent = byId.get(cursor);
            cursor = parent?.ParentStepGroupId ?? null;
        }
        return true;
    };

    const countSubtree = (rootId: number): { Descendants: number; Steps: number } => {
        let descendants = 0;
        let steps = stepsByGroup.get(rootId)?.length ?? 0;
        const stack: number[] = [rootId];
        while (stack.length > 0) {
            const id = stack.pop() as number;
            const kids = byParent.get(id) ?? [];
            for (const k of kids) {
                descendants += 1;
                steps += stepsByGroup.get(k.StepGroupId)?.length ?? 0;
                stack.push(k.StepGroupId);
            }
        }
        return { Descendants: descendants, Steps: steps };
    };

    const rows: BatchDeleteRow[] = [];
    for (const id of selectedIds) {
        const g = byId.get(id);
        if (g === undefined) continue;
        if (!isRoot(g)) continue;
        const { Descendants, Steps } = countSubtree(g.StepGroupId);
        rows.push({ Group: g, DescendantCount: Descendants, StepCount: Steps });
    }
    // Stable, predictable ordering (alphabetical) so the dialog
    // doesn't shuffle as the selection set changes.
    rows.sort((a, b) => a.Group.Name.localeCompare(b.Group.Name));
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Rename application + undo                                          */
/* ------------------------------------------------------------------ */

export interface BatchRenameOutcome {
    /** Number of names actually changed (some may have failed mid-way). */
    readonly Applied: number;
    /** First error encountered, or `null` when the whole batch succeeded. */
    readonly Error: string | null;
    /**
     * Reverts every successfully-applied rename back to its original
     * name. Returns the same shape so the UI can confirm the undo
     * (or surface a partial-undo error). Safe to call exactly once.
     */
    readonly undo: () => BatchRenameOutcome;
}

export function useStepGroupBatchActions(lib: UseStepLibraryApi) {
    /**
     * Applies a batch of {Id, OldName, NewName} changes sequentially.
     * On success, the returned `undo()` reverts every Old→New back to
     * Old. We snapshot the *applied* list rather than the requested
     * one so a partial failure produces a partial undo that exactly
     * matches the on-disk state.
     */
    const applyBatchRename = useCallback(
        (changes: ReadonlyArray<BatchRenameChange>): BatchRenameOutcome => {
            const applied: BatchRenameChange[] = [];
            let firstError: string | null = null;
            for (const c of changes) {
                try {
                    lib.renameGroup(c.Id, c.NewName);
                    applied.push(c);
                } catch (err) {
                    firstError = err instanceof Error ? err.message : String(err);
                    break;
                }
            }
            const undo = (): BatchRenameOutcome => {
                const undone: BatchRenameChange[] = [];
                let undoError: string | null = null;
                for (const c of applied) {
                    try {
                        lib.renameGroup(c.Id, c.OldName);
                        undone.push({ Id: c.Id, OldName: c.NewName, NewName: c.OldName });
                    } catch (err) {
                        undoError = err instanceof Error ? err.message : String(err);
                        break;
                    }
                }
                return {
                    Applied: undone.length,
                    Error: undoError,
                    undo: () => ({ Applied: 0, Error: "Already undone", undo: () => undone[0] as never }),
                };
            };
            return { Applied: applied.length, Error: firstError, undo };
        },
        [lib],
    );

    return { applyBatchRename };
}
