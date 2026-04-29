/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/02-url-activation-guard.md
 * Hard rule: exact-match comparison only — no normalization, no startsWith, no regex.
 */
import { ALLOWED_HOME_URLS } from "./allowed-home-url.enum";
import { logError } from "./logger";

export function isHomeUrlAllowed(href: string): boolean {
    return ALLOWED_HOME_URLS.includes(href);
}

export function shouldActivateHomeScreen(): boolean {
    try {
        return isHomeUrlAllowed(window.location.href);
    } catch (caught) {
        logError("UrlGuard", caught);
        return false;
    }
}

export function watchSpaNavigation(onNavigate: () => void): () => void {
    try {
        return installNavWatchers(onNavigate);
    } catch (caught) {
        logError("UrlGuard.watch", caught);
        return () => undefined;
    }
}

function installNavWatchers(onNavigate: () => void): () => void {
    const handler = () => onNavigate();
    window.addEventListener("popstate", handler);
    const restorePush = patchHistoryMethod("pushState", handler);
    const restoreReplace = patchHistoryMethod("replaceState", handler);
    return () => detach(handler, restorePush, restoreReplace);
}

function patchHistoryMethod(name: "pushState" | "replaceState", handler: () => void): () => void {
    const original = history[name].bind(history);
    history[name] = function patched(...args: Parameters<typeof original>) {
        const result = original(...args);
        handler();
        return result;
    } as typeof history[typeof name];
    return () => { history[name] = original; };
}

function detach(handler: () => void, restorePush: () => void, restoreReplace: () => void): void {
    window.removeEventListener("popstate", handler);
    restorePush();
    restoreReplace();
}
