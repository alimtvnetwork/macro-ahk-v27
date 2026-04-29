/**
 * pro-zero-cache-entry — typed shape persisted to IndexedDB.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §9.1
 */

import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';

export interface ProZeroCacheEntry {
    workspaceId: string;
    fetchedAtMs: number;
    creditBalance: CreditBalanceResponseTyped;
}
