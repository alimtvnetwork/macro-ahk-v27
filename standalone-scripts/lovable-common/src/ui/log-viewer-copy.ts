/**
 * Shared Logs Viewer — copy-to-clipboard handler.
 *
 * Default uses `navigator.clipboard.writeText`. Caller may inject an
 * `OnCopy` override (useful in MAIN-world contexts where clipboard
 * access is blocked and the extension content script must relay).
 * Returns `true` on success, `false` on failure — the shell uses the
 * boolean to flip the button label between "Copied ✓" and
 * "Copy failed" per `mem://standards/error-logging-via-namespace-logger`
 * (no swallowed errors — failure is surfaced to the user).
 */

import { formatEntriesAsText } from "./log-viewer-format";
import type { LogViewerEntry } from "./log-viewer-types";

const defaultCopy = async (text: string): Promise<boolean> => {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
        return false;
    }

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

export const copyEntriesToClipboard = async (
    entries: ReadonlyArray<LogViewerEntry>,
    onCopy?: (text: string) => Promise<boolean>,
): Promise<boolean> => {
    const text = formatEntriesAsText(entries);
    const handler = onCopy ?? defaultCopy;

    return handler(text);
};
