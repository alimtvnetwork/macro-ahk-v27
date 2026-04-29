/**
 * Marco Extension — openExtensionOptions
 *
 * Opens the extension's options page from any UI surface, transparently
 * choosing the best transport for the current runtime:
 *
 *   • **Extension context** — uses `chrome.runtime.openOptionsPage()` so
 *     Chrome focuses the existing tab if already open.
 *   • **Fallback (popup, content script, or no openOptionsPage support)** —
 *     opens `chrome.runtime.getURL("src/options/options.html")` in a new tab.
 *   • **Preview / Vite dev** — opens `/options` in a new tab so the React
 *     app's Options route is reachable from the floating controller.
 *
 * Returns whether a navigation was attempted; never throws.
 */

interface ChromeRuntimeLike {
    id?: string;
    openOptionsPage?: (cb?: (() => void) | undefined) => void;
    getURL?: (path: string) => string;
}

interface ChromeTabsLike {
    create?: (props: { url: string }) => Promise<unknown> | void;
}

interface ChromeApiLike {
    runtime?: ChromeRuntimeLike;
    tabs?: ChromeTabsLike;
}

function getChrome(): ChromeApiLike | null {
    const api = (globalThis as { chrome?: ChromeApiLike }).chrome;
    if (api === undefined) { return null; }
    if (api.runtime?.id === undefined) { return null; }
    return api;
}

const PREVIEW_OPTIONS_PATH = "/options";
const EXTENSION_OPTIONS_PATH = "src/options/options.html";

export function openExtensionOptions(): boolean {
    const api = getChrome();

    if (api?.runtime?.openOptionsPage !== undefined) {
        try {
            api.runtime.openOptionsPage();
            return true;
        } catch (err) {
            console.warn("[openExtensionOptions] openOptionsPage failed, falling back", err);
        }
    }

    if (api?.runtime?.getURL !== undefined && api.tabs?.create !== undefined) {
        try {
            const url = api.runtime.getURL(EXTENSION_OPTIONS_PATH);
            void api.tabs.create({ url });
            return true;
        } catch (err) {
            console.warn("[openExtensionOptions] tabs.create failed, falling back", err);
        }
    }

    if (typeof window !== "undefined") {
        const opened = window.open(PREVIEW_OPTIONS_PATH, "_blank", "noopener,noreferrer");
        return opened !== null;
    }

    return false;
}
