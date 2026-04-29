/**
 * Marco Extension — Token Seeder
 *
 * Reads session cookies and the page's localStorage, then seeds a JWT into
 * the target tab only when a valid JWT is already available. It never calls
 * the auth-token endpoint and never seeds raw opaque cookie values.
 *
 * v1.68.1 FIX: Raw session cookies are NOT JWTs — seeding them into
 * localStorage[marco_bearer_token] caused Tier 1 resolution to return
 *
 * @see spec/05-chrome-extension/04-cookie-and-auth.md — Cookie & auth strategy
 * @see spec/05-chrome-extension/36-cookie-only-bearer.md — Cookie-only bearer flow
 */

import { readCookieValueFromCandidates } from "../cookie-helpers";
import { readAllProjects } from "./project-helpers";
import type { CookieBinding } from "../../shared/project-types";
import { logBgWarnError, logCaughtError, BgLogTag} from "../bg-logger";

const SESSION_COOKIE_NAME_FALLBACKS = [
    "lovable-session-id-v2",
    "lovable-session-id.id",
    "__Secure-lovable-session-id.id",
    "__Host-lovable-session-id.id",
    "lovable-session-id",
] as const;

const LS_SESSION_KEY = "lovable-session-id";
const LS_SESSION_COOKIE_KEY = "lovable-session-id.id";
const LS_MARCO_BEARER_KEY = "marco_bearer_token";
const RESTRICTED_URL_RE = /^(chrome|edge|brave|opera|about|devtools|chrome-extension):\/\//i;
const warnedInaccessibleTabs = new Set<string>();

/** Reason taxonomy for a seed-access failure. Surfaced in diagnostics UI. */
export type AccessDeniedCode =
    | "RESPECTIVE_HOST_PERMISSION"
    | "MISSING_HOST_PERMISSION"
    | "PAGE_CONTENTS_BLOCKED"
    | "EXTENSIONS_GALLERY_BLOCKED"
    | "RESTRICTED_SCHEME"
    | "NO_HOST_PATTERN"
    | "PERMISSION_NOT_GRANTED"
    | "GENERIC_CANNOT_SCRIPT"
    | "UNKNOWN";

/** Per-tab structured failure record for the diagnostics panel. */
export interface InaccessibleSeedTarget {
    tabId: number;
    tabUrl: string;
    reason: string;
    code: AccessDeniedCode;
    firstFailureAt: number;
    lastFailureAt: number;
    attemptCount: number;
    cooldownMs: number;
}

const inaccessibleSeedTargets = new Map<string, InaccessibleSeedTarget>();
const INACCESSIBLE_SEED_COOLDOWN_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Diagnostics public API                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns a snapshot of every tab currently flagged inaccessible,
 * including the exact detected reason and remaining cooldown. Used by
 * the diagnostics panel (GET_TOKEN_SEEDER_DIAGNOSTICS).
 */
export function getInaccessibleSeedTargets(): readonly InaccessibleSeedTarget[] {
    return Array.from(inaccessibleSeedTargets.values()).map((entry) => ({ ...entry }));
}

/** Cooldown window length used for "expires-at" calculations. */
export function getInaccessibleSeedCooldownMs(): number {
    return INACCESSIBLE_SEED_COOLDOWN_MS;
}

/** Test/UI helper — clears the entire inaccessible cache. */
export function clearInaccessibleSeedTargets(): void {
    inaccessibleSeedTargets.clear();
    warnedInaccessibleTabs.clear();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Seeds a verified JWT auth token into the target tab's localStorage.
 *
 * Resolution order:
 * 1. Read existing Supabase JWT from page localStorage (sb-*-auth-token)
 * 2. Read a JWT directly from session cookies
 * 3. If neither works, DO NOT seed — let macro controller handle it
 */
export async function seedTokensIntoTab(tabId: number): Promise<void> {
    const tabUrl = await getTabUrl(tabId);
    const isSupportedTab = tabUrl !== null && isSupportedTargetUrl(tabUrl);

    if (!isSupportedTab) {
        return;
    }

    if (tabUrl !== null && isKnownInaccessibleTarget(tabId, tabUrl)) {
        return;
    }

    const hasTabAccess = await canAccessTabContents(tabId, tabUrl);

    if (!hasTabAccess) {
        return;
    }

    // Step 1: Check if page already has a Supabase JWT in localStorage
    const existingJwt = await readSupabaseJwtFromTab(tabId);

    if (existingJwt !== null) {
        console.log("[token-seeder] Found existing Supabase JWT in tab %d — seeding into marco keys", tabId);
        await injectJwtIntoTab(tabId, existingJwt);
        return;
    }

    // Step 2: Read session cookie directly and only seed it if it is already a JWT
    const projectId = extractProjectIdFromTabUrl(tabUrl);
    const sessionCookieNames = await resolveSessionCookieNamesFromProjects();
    const sessionLookup = await readCookieValueByNameCandidates(sessionCookieNames, tabUrl);

    if (sessionLookup.value !== null && sessionLookup.value.startsWith("eyJ") && sessionLookup.value.split(".").length === 3) {
        console.log("[token-seeder] Found JWT directly in session cookie — seeding into tab %d", tabId);
        await injectJwtIntoTab(tabId, sessionLookup.value);
        return;
    }

    // Step 3: Check if session cookie exists (for diagnostics only)
    if (sessionLookup.value !== null) {
        logBgWarnError(BgLogTag.TOKEN_SEEDER, `Session cookie exists for project ${projectId ?? "unknown"} but no JWT is available — NOT seeding raw cookie`);
    } else {
        console.log("[token-seeder] No session cookies found — skipping seed");
    }
}

/* ------------------------------------------------------------------ */
/*  JWT Injection (runs in page context)                               */
/* ------------------------------------------------------------------ */

/** Injects a verified JWT into the tab's localStorage marco keys. */
async function injectJwtIntoTab(tabId: number, jwt: string): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: writeJwtToLocalStorage,
            args: [
                jwt,
                LS_SESSION_KEY,
                LS_SESSION_COOKIE_KEY,
                LS_MARCO_BEARER_KEY,
            ],
        });

        console.log("[token-seeder] Seeded JWT into tab %d localStorage", tabId);
    } catch (seedError) {
        if (isTabAccessDeniedError(seedError)) {
            const tabUrl = await getTabUrl(tabId);
            const reason = seedError instanceof Error ? seedError.message : String(seedError);
            warnInaccessibleTabOnce(
                tabId,
                tabUrl ?? "unknown-tab-url",
                reason,
                classifyAccessDeniedError(reason),
            );
            return;
        }

        logCaughtError(BgLogTag.TOKEN_SEEDER, `Failed to seed JWT into tab\n  Path: chrome.scripting.executeScript → tabId=${tabId}, world=MAIN → localStorage["${LS_MARCO_BEARER_KEY}"]\n  Missing: JWT bearer token in tab localStorage\n  Reason: ${seedError instanceof Error ? seedError.message : String(seedError)}`, seedError);
    }
}

/** Writes a JWT to localStorage marco keys. Runs in MAIN world. */
function writeJwtToLocalStorage(
    jwt: string,
    sessionKey: string,
    sessionCookieKey: string,
    marcoBearerKey: string,
): void {
    try {
        localStorage.setItem(sessionKey, jwt);
        localStorage.setItem(sessionCookieKey, jwt);
        localStorage.setItem(marcoBearerKey, jwt);
    } catch { // allow-swallow: localStorage unavailable on this origin; seeding is best-effort
        // localStorage may be unavailable — fail silently
    }
}

/* ------------------------------------------------------------------ */
/*  Supabase JWT Reader (runs in page context)                         */
/* ------------------------------------------------------------------ */

/** Reads an existing Supabase JWT from the tab's localStorage. */
async function readSupabaseJwtFromTab(tabId: number): Promise<string | null> {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: scanSupabaseLocalStorageForJwt,
        });

        const jwt = results?.[0]?.result;
        return typeof jwt === "string" && jwt.startsWith("eyJ") ? jwt : null;
    } catch (readError) {
        if (isTabAccessDeniedError(readError)) {
            const tabUrl = await getTabUrl(tabId);
            const reason = readError instanceof Error ? readError.message : String(readError);
            warnInaccessibleTabOnce(
                tabId,
                tabUrl ?? "unknown-tab-url",
                reason,
                classifyAccessDeniedError(reason),
            );
        }
        return null;
    }
}

/** Scans localStorage for Supabase auth keys and returns the access_token JWT. Runs in MAIN world. */
// eslint-disable-next-line sonarjs/cognitive-complexity -- localStorage scan with priority matching
function scanSupabaseLocalStorageForJwt(): string | null {
    try {
        const len = localStorage.length;

        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Match Supabase auth token keys: sb-<ref>-auth-token
            const isSupabaseKey = key.startsWith("sb-") && key.includes("-auth-token");
            if (!isSupabaseKey) continue;

            const raw = localStorage.getItem(key);
            if (!raw || raw.length < 20) continue;

            try {
                const parsed = JSON.parse(raw);
                const accessToken = parsed?.access_token;

                if (typeof accessToken === "string" && accessToken.startsWith("eyJ")) {
                    return accessToken;
                }

                // Check nested session object
                const session = parsed?.currentSession ?? parsed?.session;
                if (session?.access_token && typeof session.access_token === "string" && session.access_token.startsWith("eyJ")) {
                    return session.access_token;
                }
            } catch {
                // Not JSON — check if raw value is a JWT
                if (raw.startsWith("eyJ") && raw.split(".").length === 3) {
                    return raw;
                }
            }
        }
    } catch { // allow-swallow: localStorage unavailable; caller falls back to null
        // localStorage unavailable
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isSupportedTargetUrl(url: string): boolean {
    return url.includes("lovable.dev")
        || url.includes("lovable.app")
        || url.includes("lovableproject.com")
        || url.includes("localhost");
}

async function canAccessTabContents(tabId: number, tabUrl: string): Promise<boolean> {
    if (RESTRICTED_URL_RE.test(tabUrl)) {
        recordInaccessibleTarget(tabId, tabUrl, `Restricted browser scheme: ${tabUrl.split(":")[0]}://`, "RESTRICTED_SCHEME");
        return false;
    }

    const originPattern = toOriginPermissionPattern(tabUrl);

    if (originPattern === null) {
        warnInaccessibleTabOnce(tabId, tabUrl, "No valid origin pattern could be derived for host permission verification.", "NO_HOST_PATTERN");
        return false;
    }

    if (chrome.permissions?.contains === undefined) {
        return true;
    }

    try {
        const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });

        if (!hasPermission) {
            warnInaccessibleTabOnce(tabId, tabUrl, `Host permission is not granted for ${originPattern}.`, "PERMISSION_NOT_GRANTED");
            return false;
        }

        const canExecuteScript = await probeTabScriptingAccess(tabId, tabUrl);

        if (!canExecuteScript) {
            return false;
        }

        clearInaccessibleWarning(tabId, tabUrl);
        return true;
    } catch (permissionError) {
        logBgWarnError(
            BgLogTag.TOKEN_SEEDER,
            `Permission preflight failed for tab ${tabId} (${tabUrl}) — proceeding with token seed attempt`,
            permissionError instanceof Error ? permissionError : undefined,
        );
        return true;
    }
}

function toOriginPermissionPattern(url: string): string | null {
    try {
        const parsedUrl = new URL(url);
        return `${parsedUrl.origin}/*`;
    } catch {
        return null;
    }
}

async function probeTabScriptingAccess(tabId: number, tabUrl: string): Promise<boolean> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: tokenSeederAccessProbe,
        });
        return true;
    } catch (probeError) {
        if (isTabAccessDeniedError(probeError)) {
            const reason = probeError instanceof Error ? probeError.message : String(probeError);
            warnInaccessibleTabOnce(tabId, tabUrl, reason, classifyAccessDeniedError(reason));
            return false;
        }

        logBgWarnError(
            BgLogTag.TOKEN_SEEDER,
            `Scripting access probe failed for tab ${tabId} (${tabUrl}) — proceeding with token seed attempt`,
            probeError instanceof Error ? probeError : undefined,
        );
        return true;
    }
}

function tokenSeederAccessProbe(): boolean {
    return true;
}

function isTabAccessDeniedError(error: unknown): boolean {
    return classifyAccessDeniedError(extractErrorMessage(error)) !== "UNKNOWN";
}

function extractErrorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : typeof error === "string"
            ? error
            : "";
}

/** Classifies a Chrome error message into a stable AccessDeniedCode. */
function classifyAccessDeniedError(message: string): AccessDeniedCode {
    const normalized = message.toLowerCase();

    if (normalized.includes("must request permission to access the respective host")) {
        return "RESPECTIVE_HOST_PERMISSION";
    }
    if (normalized.includes("missing host permission for the tab")) {
        return "MISSING_HOST_PERMISSION";
    }
    if (normalized.includes("the extensions gallery cannot be scripted")) {
        return "EXTENSIONS_GALLERY_BLOCKED";
    }
    if (normalized.includes("cannot access contents of the page")) {
        return "PAGE_CONTENTS_BLOCKED";
    }
    if (normalized.includes("cannot be scripted")) {
        return "GENERIC_CANNOT_SCRIPT";
    }
    return "UNKNOWN";
}

function recordInaccessibleTarget(
    tabId: number,
    tabUrl: string,
    reason: string,
    code: AccessDeniedCode,
): InaccessibleSeedTarget {
    const key = `${tabId}::${tabUrl}`;
    const now = Date.now();
    const existing = inaccessibleSeedTargets.get(key);

    const entry: InaccessibleSeedTarget = {
        tabId,
        tabUrl,
        reason,
        code,
        firstFailureAt: existing?.firstFailureAt ?? now,
        lastFailureAt: now,
        attemptCount: (existing?.attemptCount ?? 0) + 1,
        cooldownMs: INACCESSIBLE_SEED_COOLDOWN_MS,
    };

    inaccessibleSeedTargets.set(key, entry);
    return entry;
}

function warnInaccessibleTabOnce(
    tabId: number,
    tabUrl: string,
    reason: string,
    code: AccessDeniedCode = "UNKNOWN",
): void {
    const key = `${tabId}::${tabUrl}`;

    recordInaccessibleTarget(tabId, tabUrl, reason, code);

    if (warnedInaccessibleTabs.has(key)) {
        return;
    }

    warnedInaccessibleTabs.add(key);
    logBgWarnError(
        BgLogTag.TOKEN_SEEDER,
        `Skipping JWT seed for inaccessible tab\n  Path: chrome.scripting.executeScript → tabId=${tabId}, world=MAIN → localStorage["${LS_MARCO_BEARER_KEY}"]\n  Missing: MAIN-world scripting access to tab contents\n  Code: ${code}\n  Reason: ${reason}`,
    );
}

function clearInaccessibleWarning(tabId: number, tabUrl: string): void {
    const key = `${tabId}::${tabUrl}`;
    warnedInaccessibleTabs.delete(key);
    inaccessibleSeedTargets.delete(key);
}

function isKnownInaccessibleTarget(tabId: number, tabUrl: string): boolean {
    const key = `${tabId}::${tabUrl}`;
    const entry = inaccessibleSeedTargets.get(key);

    if (entry === undefined) {
        return false;
    }

    if (Date.now() - entry.lastFailureAt < INACCESSIBLE_SEED_COOLDOWN_MS) {
        return true;
    }

    inaccessibleSeedTargets.delete(key);
    warnedInaccessibleTabs.delete(key);
    return false;
}

async function getTabUrl(tabId: number): Promise<string | null> {
    try {
        const tab = await chrome.tabs.get(tabId);
        return tab.url ?? null;
    } catch {
        return null;
    }
}

/** Extracts project ID from a tab URL.
 *  Supports editor URLs and preview hostnames on lovable.app/lovableproject.com.
 */
function extractProjectIdFromTabUrl(url: string | null): string | null {
    if (!url) return null;

    // Pattern 1: /projects/{id} (editor URL)
    const pathMatch = url.match(/\/projects\/([^/?#]+)/);
    if (pathMatch) return pathMatch[1];

    try {
        const hostname = new URL(url).hostname;
        const firstLabel = hostname.split(".")[0] ?? "";

        // Pattern 2: id-preview--{uuid}.{domain}
        const idPreviewLabelMatch = firstLabel.match(/^id-preview--([a-f0-9-]{36})$/i);
        if (idPreviewLabelMatch) return idPreviewLabelMatch[1];

        // Pattern 3: {uuid}--preview.{domain} or {uuid}-preview.{domain}
        const previewSuffixLabelMatch = firstLabel.match(/^([a-f0-9-]{36})(?:--preview|-preview)$/i);
        if (previewSuffixLabelMatch) return previewSuffixLabelMatch[1];

        // Pattern 4: bare UUID subdomain: {uuid}.lovableproject.com
        const bareUuidLabelMatch = firstLabel.match(/^([a-f0-9-]{36})$/i);
        if (bareUuidLabelMatch) return bareUuidLabelMatch[1];
    } catch { // allow-swallow: malformed URL; fallback regex checks below handle the parse failure
        // Ignore malformed URLs and continue with fallback regex checks.
    }

    const subdomainMatch = url.match(/id-preview--([a-f0-9-]{36})\./i);
    if (subdomainMatch) return subdomainMatch[1];

    const altSubdomainMatch = url.match(/([a-f0-9-]{36})(?:--preview|-preview)\./i);
    if (altSubdomainMatch) return altSubdomainMatch[1];

    const bareUuidSubdomainMatch = url.match(/https?:\/\/([a-f0-9-]{36})\.[^/]+/i);
    if (bareUuidSubdomainMatch) return bareUuidSubdomainMatch[1];

    return null;
}

interface CookieLookupResult {
    value: string | null;
    cookieName: string | null;
}

async function readCookieValueByNameCandidates(
    cookieNames: readonly string[],
    primaryUrl?: string | null,
): Promise<CookieLookupResult> {
    for (const cookieName of cookieNames) {
        const value = await readCookieValueFromCandidates(cookieName, primaryUrl);

        if (value !== null) {
            return { value, cookieName };
        }
    }

    return { value: null, cookieName: null };
}

async function resolveSessionCookieNamesFromProjects(): Promise<readonly string[]> {
    try {
        const projects = await readAllProjects();
        const cookieBindings: CookieBinding[] = [];

        for (const project of projects) {
            if (project.cookies && project.cookies.length > 0) {
                cookieBindings.push(...project.cookies);
            }
        }

        const names = cookieBindings
            .filter((binding) => binding.role === "session")
            .map((binding) => binding.cookieName)
            .filter((cookieName): cookieName is string => typeof cookieName === "string" && cookieName.length > 0);

        return [...new Set([...names, ...SESSION_COOKIE_NAME_FALLBACKS])];
    } catch {
        return SESSION_COOKIE_NAME_FALLBACKS;
    }
}
