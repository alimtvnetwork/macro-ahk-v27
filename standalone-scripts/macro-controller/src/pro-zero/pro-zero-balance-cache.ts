/**
 * pro-zero-balance-cache — IndexedDB short-term cache for /credit-balance results.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §9.1
 *
 * TTL is read from `Settings.ProZeroCreditBalanceCacheTtlMinutes` via
 * `pro-zero-cache-ttl`. Stale entries are returned as `null` (caller refetches).
 */

import { PRO_ZERO_DB_STORE } from './pro-zero-constants';
import { openProZeroDb } from './pro-zero-idb-open';
import { getProZeroCacheTtlMs } from './pro-zero-cache-ttl';
import type { ProZeroCacheEntry } from './pro-zero-cache-entry';
import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';
import { logError } from '../error-utils';

function isFresh(entry: ProZeroCacheEntry): boolean {
    return Date.now() - entry.fetchedAtMs < getProZeroCacheTtlMs();
}

function readFromStore(db: IDBDatabase, workspaceId: string): Promise<ProZeroCacheEntry | null> {
    return new Promise(function (resolve): void {
        const tx = db.transaction(PRO_ZERO_DB_STORE, 'readonly');
        const req = tx.objectStore(PRO_ZERO_DB_STORE).get(workspaceId);
        req.onsuccess = function (): void { resolve((req.result as ProZeroCacheEntry | undefined) ?? null); };
        req.onerror = function (): void { resolve(null); };
    });
}

function writeToStore(db: IDBDatabase, entry: ProZeroCacheEntry): Promise<void> {
    return new Promise(function (resolve, reject): void {
        const tx = db.transaction(PRO_ZERO_DB_STORE, 'readwrite');
        tx.objectStore(PRO_ZERO_DB_STORE).put(entry);
        tx.oncomplete = function (): void { resolve(); };
        tx.onerror = function (): void { reject(tx.error || new Error('IDB put failed')); };
    });
}

export async function readProZeroCache(workspaceId: string): Promise<CreditBalanceResponseTyped | null> {
    try {
        const db = await openProZeroDb();
        const entry = await readFromStore(db, workspaceId);
        if (!entry || !isFresh(entry)) return null;

        return entry.creditBalance;
    } catch (caught: unknown) {
        logError('ProZeroBalanceCache.read', 'IDB read failed', caught);

        return null;
    }
}

export async function writeProZeroCache(workspaceId: string, creditBalance: CreditBalanceResponseTyped): Promise<void> {
    try {
        const db = await openProZeroDb();
        await writeToStore(db, { workspaceId, fetchedAtMs: Date.now(), creditBalance });
    } catch (caught: unknown) {
        logError('ProZeroBalanceCache.write', 'IDB write failed', caught);
    }
}
