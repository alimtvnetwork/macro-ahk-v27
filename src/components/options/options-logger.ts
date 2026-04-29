/**
 * Options-page logger shim — mirrors `src/hooks/popup-logger.ts` and
 * `src/content-scripts/home-screen/logger.ts`.
 *
 * The Options page runs in the extension's own UI context (chrome-extension://
 * options.html) and does NOT receive the `RiseupAsiaMacroExt` MAIN-world SDK,
 * so the namespace logger is never present here. This shim still routes
 * through a `logError` helper so:
 *   1. Feature code follows the project-wide rule "no bare console.error"
 *      (memory `error-logging-via-namespace-logger`).
 *   2. The single fallback site is easy to upgrade later (e.g. wire to
 *      `chrome.runtime.sendMessage({ type: "LOG_ERROR", ... })` when Options
 *      observability needs to flow into the SQLite session log).
 *
 * NEVER call `console.error` directly from Options components/views.
 */

const SCOPE_PREFIX = "Options.";

/**
 * Logs an error scoped to the Options page. `message` should follow the
 * project's CODE-RED convention (exact path, what was missing, reason).
 */
export function logError(scope: string, message: string, caught?: unknown): void {
    const fullScope = `${SCOPE_PREFIX}${scope}`;
    if (caught !== undefined) {
        console.error(`[${fullScope}] ${message}`, caught);
    } else {
        console.error(`[${fullScope}] ${message}`);
    }
}
