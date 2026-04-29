/**
 * pro-zero-credit-summary — orchestrator that produces MacroCreditSummary.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §3, §8, §12.6
 *
 * Branches on WorkspacePlan. For PRO_ZERO: read IDB cache → fetch → write
 * cache + async SQLite upsert. For OTHER: skip credit-balance call entirely
 * (caller falls back to existing in-controller calculation).
 */

import { WorkspacePlan } from './workspace-plan';
import { MacroCreditSource } from './macro-credit-source';
import { CreditBalanceFetchStatus } from './credit-balance-fetch-status';
import { mapWorkspacePlan, isProZeroPlan } from './workspace-plan-mapper';
import { fetchProZeroCreditBalance } from './pro-zero-credit-balance-client';
import { readProZeroCache, writeProZeroCache } from './pro-zero-balance-cache';
import { upsertWorkspacesRow } from './pro-zero-workspaces-store';
import { logSkippedNonProZero } from './pro-zero-logger';
import type { MacroCreditSummary } from './macro-credit-summary';
import type { WorkspaceInfoTyped } from './workspace-info-typed';
import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';
import type { CreditBalanceFetchResult } from './credit-balance-fetch-result';

export type ProZeroSummaryOutcome =
    | { isOk: true; summary: MacroCreditSummary; balance: CreditBalanceResponseTyped }
    | { isOk: false; failure: CreditBalanceFetchResult };

function buildSummary(balance: CreditBalanceResponseTyped): MacroCreditSummary {
    return {
        Total: balance.total_granted,
        AvailableCredits: balance.total_remaining,
        TotalUsed: balance.total_billing_period_used,
        Source: MacroCreditSource.CREDIT_BALANCE,
    };
}

async function resolveBalance(workspaceId: string): Promise<CreditBalanceFetchResult> {
    const cached = await readProZeroCache(workspaceId);
    if (cached) return { status: CreditBalanceFetchStatus.SUCCESS, data: cached };

    return fetchProZeroCreditBalance(workspaceId);
}

function persistOnSuccess(workspace: WorkspaceInfoTyped, balance: CreditBalanceResponseTyped): void {
    void writeProZeroCache(workspace.id, balance);
    upsertWorkspacesRow(workspace, balance);
}

export async function buildProZeroCreditSummary(workspace: WorkspaceInfoTyped): Promise<ProZeroSummaryOutcome> {
    const plan = mapWorkspacePlan(workspace.plan);
    if (!isProZeroPlan(plan)) { logSkippedNonProZero(plan); return skippedFailure(plan); }
    const result = await resolveBalance(workspace.id);
    if (result.status !== CreditBalanceFetchStatus.SUCCESS) return { isOk: false, failure: result };
    persistOnSuccess(workspace, result.data);

    return { isOk: true, summary: buildSummary(result.data), balance: result.data };
}

function skippedFailure(_plan: WorkspacePlan): ProZeroSummaryOutcome {
    return { isOk: false, failure: { status: CreditBalanceFetchStatus.PARSE_ERROR, reason: 'NON_PRO_ZERO_PLAN' } };
}
