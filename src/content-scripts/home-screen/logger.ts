/**
 * Thin shim around `RiseupAsiaMacroExt.Logger` (memory `error-logging-via-namespace-logger`).
 * Falls back to `console.error` when the namespace isn't injected (e.g. in unit tests).
 *
 * NEVER call `console.error` directly from feature code — always go through `logError`.
 */
import type { CaughtError } from "./types";

const SCOPE_PREFIX = "HomeScreen.";

interface NamespaceLogger {
    error: (scope: string, caught: CaughtError) => void;
    warn?: (scope: string, message: string) => void;
}

interface MaybeNamespaceWindow {
    RiseupAsiaMacroExt?: { Logger?: NamespaceLogger };
}

function getLogger(): NamespaceLogger | null {
    try {
        const w = window as unknown as MaybeNamespaceWindow;
        return w.RiseupAsiaMacroExt?.Logger ?? null;
    } catch {
        return null;
    }
}

export function logError(scope: string, caught: CaughtError): void {
    const fullScope = `${SCOPE_PREFIX}${scope}`;
    const logger = getLogger();
    if (logger) {
        logger.error(fullScope, caught);
        return;
    }
    console.error(fullScope, caught);
}

export function logWarn(scope: string, message: string): void {
    const fullScope = `${SCOPE_PREFIX}${scope}`;
    const logger = getLogger();
    if (logger?.warn) {
        logger.warn(fullScope, message);
        return;
    }
    console.warn(fullScope, message);
}
