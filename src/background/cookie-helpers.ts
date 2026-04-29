/**
 * Marco Extension — Cookie Resolution Helpers
 *
 * Shared candidate URL resolution for platform session cookies.
 * Runs in the extension service worker (excluded from tsconfig.app.json).
 */

import { getChromeRef } from "./chrome-ref";
function _chr() { return getChromeRef(); }

interface ChromeCookie {
    value: string;
    name: string;
    domain: string;
    expirationDate?: number;
}

export type { ChromeCookie };
const DEFAULT_COOKIE_URL_CANDIDATES = [
    "https://lovable.dev/",
    "https://www.lovable.dev/",
    "https://lovable.app/",
    "https://www.lovable.app/",
    "https://lovableproject.com/",
    "https://www.lovableproject.com/",
    "https://localhost/",
    "http://localhost/",
    "https://127.0.0.1/",
    "http://127.0.0.1/",
] as const;

/** Builds an ordered list of candidate URLs for chrome.cookies.get. */
export function buildCookieUrlCandidates(primaryUrl?: string | null): string[] {
    const candidates = new Set<string>();

    appendUrlCandidate(candidates, primaryUrl);

    for (const url of DEFAULT_COOKIE_URL_CANDIDATES) {
        candidates.add(url);
    }

    return [...candidates];
}

/** Reads the first matching cookie object from the resolved candidate URLs. */
export async function readCookieFromCandidates(
    cookieName: string,
    primaryUrl?: string | null,
): Promise<ChromeCookie | null> {
    const candidateUrls = buildCookieUrlCandidates(primaryUrl);

    for (const url of candidateUrls) {
        try {
            const cookie: ChromeCookie | null = await _chr().cookies!.get({ url, name: cookieName });

            if (cookie !== null) {
                return cookie;
            }
        } catch (cookieErr) {
            // Try the next candidate URL. Debug-only because cookie-store misses are
            // expected (different domain candidates) — escalating would spam the log.
            console.debug(`[cookie-helpers] cookies.get failed for url="${url}" name="${cookieName}", trying next candidate:`, cookieErr);
        }
    }

    return null;
}

/** Reads the first matching cookie value from the resolved candidate URLs. */
export async function readCookieValueFromCandidates(
    cookieName: string,
    primaryUrl?: string | null,
): Promise<string | null> {
    const cookie = await readCookieFromCandidates(cookieName, primaryUrl);
    return cookie?.value ?? null;
}

/** Adds a normalized HTTP(S) URL candidate and its origin. */
function appendUrlCandidate(
    candidates: Set<string>,
    rawUrl?: string | null,
): void {
    if (!rawUrl) {
        return;
    }

    try {
        const parsed = new URL(rawUrl);
        const isHttpUrl = parsed.protocol === "http:" || parsed.protocol === "https:";

        if (!isHttpUrl) {
            return;
        }

        candidates.add(parsed.href);
        candidates.add(`${parsed.origin}/`);
    } catch (urlErr) {
        // Ignore malformed candidate URLs. Debug breadcrumb so a regression that
        // feeds garbage into the URL list is at least visible during development.
        console.debug(`[cookie-helpers] appendUrlCandidate dropped malformed url="${rawUrl}":`, urlErr);
    }
}
