/**
 * WorkspaceMembership — verbatim shape from the workspaces endpoint.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.1
 */

export interface WorkspaceMembership {
    workspace_id: string;
    user_id: string;
    role: string;
    email: string;
    monthly_credit_limit: number | null;
    invited_at: string;
    joined_at: string;
}
