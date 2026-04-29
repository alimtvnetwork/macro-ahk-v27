/**
 * Lifecycle moment at which a standalone script should be injected.
 *
 * Mirrors the Chrome extension `chrome.scripting.RegisteredContentScript.runAt`
 * vocabulary, but typed as an enum so consumers can switch exhaustively
 * without resorting to magic strings.
 */
export const enum InjectionRunAt {
    DocumentStart = "document_start",
    DocumentEnd = "document_end",
    DocumentIdle = "document_idle",
}
