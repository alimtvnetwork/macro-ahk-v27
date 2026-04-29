/**
 * pro-zero-workspaces-store — async upsert into SQLite-backed kv store.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §9.2
 *
 * Persists `{ WorkspaceId, WorkspaceJson, CreditBalanceJson, Plan, FetchedAt }`
 * via `marco.kv.set()` (background SQLite). Failures are logged, never thrown —
 * write is fire-and-forget per spec ("async-save").
 */

import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';
import type { WorkspaceInfoTyped } from './workspace-info-typed';
import { SQLITE_WORKSPACES_KEY_PREFIX } from './pro-zero-constants';
import { logError } from '../error-utils';

export interface WorkspacesRow {
    WorkspaceId: string;
    WorkspaceJson: string;
    CreditBalanceJson: string;
    Plan: string;
    FetchedAt: string;
}

interface KvBridge { kv: { set(key: string, value: string): Promise<void> }; }

function getKv(): KvBridge['kv'] | null {
    const sdk = (window as unknown as { marco?: KvBridge }).marco;

    return sdk && sdk.kv ? sdk.kv : null;
}

function buildRow(workspace: WorkspaceInfoTyped, balance: CreditBalanceResponseTyped): WorkspacesRow {
    return {
        WorkspaceId: workspace.id,
        WorkspaceJson: JSON.stringify(workspace),
        CreditBalanceJson: JSON.stringify(balance),
        Plan: workspace.plan,
        FetchedAt: new Date().toISOString(),
    };
}

export function upsertWorkspacesRow(workspace: WorkspaceInfoTyped, balance: CreditBalanceResponseTyped): void {
    const kv = getKv();
    if (!kv) { logError('ProZeroWorkspacesStore', 'marco.kv unavailable — skipping SQLite upsert'); return; }
    const row = buildRow(workspace, balance);
    const key = SQLITE_WORKSPACES_KEY_PREFIX + workspace.id;
    kv.set(key, JSON.stringify(row)).catch(function (caught: unknown): void {
        logError('ProZeroWorkspacesStore.upsert', 'kv.set failed for ' + workspace.id, caught);
    });
}
