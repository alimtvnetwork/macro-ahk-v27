/**
 * Chrome extension execution world for an injected standalone script.
 *
 * - `Main`     — runs in the page's JavaScript context. Required when the
 *                script must access `window.RiseupAsiaMacroExt`, page-defined
 *                globals, or page event listeners.
 * - `Isolated` — runs in the extension's content-script sandbox. Required
 *                when the script calls `chrome.*` APIs or must be hidden
 *                from the page.
 *
 * Replaces the legacy string union `"MAIN" | "ISOLATED"`.
 */
export const enum InjectionWorld {
    Main = "MAIN",
    Isolated = "ISOLATED",
}
