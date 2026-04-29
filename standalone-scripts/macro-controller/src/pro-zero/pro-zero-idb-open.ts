/**
 * pro-zero-idb-open — minimal typed IndexedDB opener for the pro_0 cache.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §9.1
 *
 * Single-store DB keyed by `workspaceId`. Promise-wrapped per browser idiom.
 * On failure, the promise rejects — callers wrap in try/catch and Logger.error.
 */

import { PRO_ZERO_DB_NAME, PRO_ZERO_DB_STORE, PRO_ZERO_DB_VERSION } from './pro-zero-constants';

function ensureStore(req: IDBOpenDBRequest): void {
    req.onupgradeneeded = function (): void {
        const db = req.result;
        if (!db.objectStoreNames.contains(PRO_ZERO_DB_STORE)) {
            db.createObjectStore(PRO_ZERO_DB_STORE, { keyPath: 'workspaceId' });
        }
    };
}

export function openProZeroDb(): Promise<IDBDatabase> {
    return new Promise(function (resolve, reject): void {
        const req = indexedDB.open(PRO_ZERO_DB_NAME, PRO_ZERO_DB_VERSION);
        ensureStore(req);
        req.onsuccess = function (): void { resolve(req.result); };
        req.onerror = function (): void { reject(req.error || new Error('IDB open failed')); };
    });
}
