/**
 * pro-zero-workspace-adapter — convert WorkspaceCredit.rawApi → WorkspaceInfoTyped.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.2, §11.4
 *
 * Centralises the ONE place where the loose `Record<string, unknown>` shape
 * from /user/workspaces is narrowed to the strict `WorkspaceInfoTyped` the
 * pro_0 branch consumes. No raw `"pro_0"` literal — that lives in the mapper.
 */

import type { WorkspaceInfoTyped } from './workspace-info-typed';
import type { WorkspaceMembership } from './workspace-membership';

function readNum(src: Record<string, unknown>, key: string): number {
    const v = src[key];

    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function readStr(src: Record<string, unknown>, key: string): string {
    const v = src[key];

    return typeof v === 'string' ? v : '';
}

function readMembership(src: Record<string, unknown>): WorkspaceMembership {
    const m = (src.membership || {}) as Record<string, unknown>;
    const limit = m.monthly_credit_limit;

    return {
        workspace_id: readStr(m, 'workspace_id'),
        user_id: readStr(m, 'user_id'),
        role: readStr(m, 'role'),
        email: readStr(m, 'email'),
        monthly_credit_limit: typeof limit === 'number' ? limit : null,
        invited_at: readStr(m, 'invited_at'),
        joined_at: readStr(m, 'joined_at'),
    };
}

function pickWorkspaceSection(rawApi: Record<string, unknown>): Record<string, unknown> {
    const inner = rawApi.workspace;
    if (inner && typeof inner === 'object') return inner as Record<string, unknown>;

    return rawApi;
}

export function adaptWorkspaceInfoTyped(rawApi: Record<string, unknown>): WorkspaceInfoTyped {
    const ws = pickWorkspaceSection(rawApi);

    return {
        id: readStr(ws, 'id'),
        name: readStr(ws, 'name'),
        plan: readStr(ws, 'plan') || readStr(rawApi, 'plan'),
        plan_type: readStr(ws, 'plan_type'),
        credits_used: readNum(ws, 'credits_used'),
        credits_granted: readNum(ws, 'credits_granted'),
        total_credits_used: readNum(ws, 'total_credits_used'),
        billing_period_credits_used: readNum(ws, 'billing_period_credits_used'),
        billing_period_credits_limit: readNum(ws, 'billing_period_credits_limit'),
        billing_period_start_date: readStr(ws, 'billing_period_start_date'),
        billing_period_end_date: readStr(ws, 'billing_period_end_date'),
        membership: readMembership(rawApi),
    };
}
