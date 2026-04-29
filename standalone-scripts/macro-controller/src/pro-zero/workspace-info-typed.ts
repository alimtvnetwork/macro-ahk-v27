/**
 * WorkspaceInfoTyped — only the fields the pro_0 flow consumes are required.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.2
 *
 * Distinct from `types/credit-types.WorkspaceInfo` (legacy/loose). This shape
 * is the strict typed view used inside the pro_0 branch.
 */

import type { WorkspaceMembership } from './workspace-membership';

export interface WorkspaceInfoTyped {
    id: string;
    name: string;
    /** Raw wire value — mapped to WorkspacePlan via workspace-plan-mapper. */
    plan: string;
    plan_type: string;
    credits_used: number;
    credits_granted: number;
    total_credits_used: number;
    billing_period_credits_used: number;
    billing_period_credits_limit: number;
    billing_period_start_date: string;
    billing_period_end_date: string;
    membership: WorkspaceMembership;
}
