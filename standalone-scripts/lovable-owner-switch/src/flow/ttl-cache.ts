/**
 * Owner Switch — TTL cache (Q5 default: 24h).
 *
 * Generic `Map<string, V>` wrapper with per-entry monotonic expiry. Used
 * to cache `LoginEmail → WorkspaceId` and `OwnerEmail → UserId` lookups
 * during a single popup session so a 100-row CSV doesn't issue 200
 * redundant GETs.
 *
 * Not persisted across reloads — kept in-memory only. P10's per-row
 * driver instantiates one cache per task.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface TtlCacheOptions {
    TtlMs?: number;
}

interface CacheEntry<V> {
    Value: V;
    ExpiresAt: number;
}

export class TtlCache<V> {
    private readonly store: Map<string, CacheEntry<V>>;
    private readonly ttlMs: number;

    public constructor(options: TtlCacheOptions = {}) {
        this.store = new Map<string, CacheEntry<V>>();
        this.ttlMs = options.TtlMs ?? DEFAULT_TTL_MS;
    }

    public get(key: string): V | null {
        const entry = this.store.get(key);

        if (entry === undefined || entry.ExpiresAt <= Date.now()) {
            return null;
        }

        return entry.Value;
    }

    public set(key: string, value: V): void {
        this.store.set(key, { Value: value, ExpiresAt: Date.now() + this.ttlMs });
    }

    public clear(): void {
        this.store.clear();
    }
}
