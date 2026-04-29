/**
 * Marco Extension — Promote Fallback Selector to Primary
 *
 * Pure helper used by the failure post-mortem "Comparison view" so the user
 * can one-click promote a matching fallback selector to PRIMARY without
 * editing anything else about the Step. Returns the new selector list with
 * exactly one `IsPrimary === 1` row; the previous primary is demoted.
 *
 * Schema invariant honoured (step-persistence.ts):
 *   - Exactly one selector per Step has `IsPrimary = 1` (enforced by the
 *     partial unique index `IxSelectorPrimaryPerStep`).
 *
 * The persistence side effect (UPDATE Selector ...) is intentionally NOT
 * here — callers in the UI layer wrap this with their async DB writer so
 * the helper stays unit-testable without sql.js.
 *
 * @see ./step-persistence.ts        — PersistedSelector shape, schema rules.
 * @see ./selector-comparison.ts     — Source of the SelectorAttemptComparison
 *                                     the UI clicked on.
 */

import type { PersistedSelector } from "./step-persistence";

export type PromotionErrorCode =
    | "TargetNotFound"     // SelectorId not present in the input list.
    | "AlreadyPrimary"     // SelectorId is already the primary.
    | "EmptyInput";        // The selector list is empty.

export interface PromotionError {
    readonly Code: PromotionErrorCode;
    readonly Message: string;
}

export interface PromotionResult {
    /** Updated selector list (primary first), or null when error. */
    readonly Selectors: ReadonlyArray<PersistedSelector> | null;
    /** Selector demoted from primary, or null when there was no prior primary. */
    readonly DemotedSelectorId: number | null;
    /** Selector promoted to primary, or null on error. */
    readonly PromotedSelectorId: number | null;
    /** Non-null when promotion was rejected. */
    readonly Error: PromotionError | null;
}

/**
 * Promote one selector (by SelectorId) to primary, demoting any other
 * primary in the same list. Returns a new array; input is not mutated.
 *
 * Refuses promotion when the target is already primary or missing — the
 * UI surfaces these as toasts rather than silently no-op'ing so the user
 * knows the click had no effect.
 */
export function promoteSelectorToPrimary(
    selectors: ReadonlyArray<PersistedSelector>,
    targetSelectorId: number,
): PromotionResult {
    if (selectors.length === 0) {
        return fail("EmptyInput", "No selectors to promote.");
    }

    const target = selectors.find((s) => s.SelectorId === targetSelectorId);
    if (target === undefined) {
        return fail(
            "TargetNotFound",
            `Selector ${targetSelectorId} is not part of this step's selector list.`,
        );
    }

    if (target.IsPrimary === 1) {
        return fail(
            "AlreadyPrimary",
            `Selector ${targetSelectorId} is already the primary selector.`,
        );
    }

    const previousPrimary = selectors.find((s) => s.IsPrimary === 1) ?? null;

    const updated: PersistedSelector[] = selectors.map((s) => {
        if (s.SelectorId === targetSelectorId) return { ...s, IsPrimary: 1 };
        if (s.IsPrimary === 1)                 return { ...s, IsPrimary: 0 };
        return s;
    });

    // Sort: primary first, then by original SelectorId for stability.
    updated.sort((a, b) => {
        if (a.IsPrimary !== b.IsPrimary) return a.IsPrimary === 1 ? -1 : 1;
        return a.SelectorId - b.SelectorId;
    });

    return {
        Selectors: updated,
        DemotedSelectorId: previousPrimary?.SelectorId ?? null,
        PromotedSelectorId: target.SelectorId,
        Error: null,
    };
}

function fail(code: PromotionErrorCode, message: string): PromotionResult {
    return {
        Selectors: null,
        DemotedSelectorId: null,
        PromotedSelectorId: null,
        Error: { Code: code, Message: message },
    };
}
