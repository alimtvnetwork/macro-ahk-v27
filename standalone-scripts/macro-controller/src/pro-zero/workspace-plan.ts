/**
 * WorkspacePlan — sole Enum for plan branching.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §4
 *
 * Raw wire string `"pro_0"` is owned by `workspace-plan-mapper.ts` ONLY.
 * Every other module references the Enum.
 */

export enum WorkspacePlan {
    PRO_ZERO = 'PRO_ZERO',
    OTHER = 'OTHER',
}
