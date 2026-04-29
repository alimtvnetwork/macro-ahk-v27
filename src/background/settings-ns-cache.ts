/**
 * Marco Extension — Settings Namespace Script Cache (Phase 10)
 *
 * Caches the built settings namespace IIFE so it doesn't rebuild
 * on every injection when settings haven't changed.
 * Invalidated on SAVE_SETTINGS.
 *
 * @see .lovable/memory/architecture/settings-namespace.md — Settings namespace
 * @see .lovable/memory/architecture/injection-pipeline-optimization.md — Pipeline perf
 */

let _cache: { hash: string; script: string } | null = null;

/** Simple deterministic hash of settings + guide key for cache comparison. */
export function hashSettingsKey(settings: Record<string, unknown>, guideKey: string): string {
    return JSON.stringify({ ...settings, guideKey });
}

/** Returns cached script if hash matches, or null for a miss. */
export function getSettingsNsCache(hash: string): string | null {
    if (_cache && _cache.hash === hash) return _cache.script;
    return null;
}

/** Stores the built script in the cache. */
export function setSettingsNsCache(hash: string, script: string): void {
    _cache = { hash, script };
}

/** Invalidate the settings namespace cache (called on SAVE_SETTINGS). */
export function invalidateSettingsNsCache(): void {
    _cache = null;
    console.log("[injection:settings] Phase 10: settings namespace cache invalidated");
}
