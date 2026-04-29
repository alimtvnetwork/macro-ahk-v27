/**
 * Lib-level logger shim — used by code in `src/lib/` that may run in either
 * the extension UI context or the service worker (e.g. recorder-session-sync
 * is consumed by `src/components/**` AND `src/background/recorder/**`).
 *
 * Cannot import bg-logger (would pull SQLite + DOM-less code into the UI
 * bundle) and cannot import options-logger / popup-logger (those carry
 * surface-specific scope prefixes). This shim is the neutral fallback.
 *
 * NEVER call `console.error` directly from `src/lib/` modules.
 */

const SCOPE_PREFIX = "Lib.";

export function logError(scope: string, message: string, caught?: unknown): void {
    const fullScope = `${SCOPE_PREFIX}${scope}`;
    if (caught !== undefined) {
        console.error(`[${fullScope}] ${message}`, caught);
    } else {
        console.error(`[${fullScope}] ${message}`);
    }
}
