/**
 * Riseup Macro SDK — HTTP Module
 *
 * Axios instance with interceptors for automatic bearer token injection,
 * 401 recovery, and 429 retry. All API calls go through this layer.
 *
 * See: memory/architecture/networking/centralized-api-registry
 */

import axios from "axios";
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import { sendMessage } from "./bridge";
import { extractBearerTokenFromBridgePayload } from "./auth-response";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;
const TOKEN_PREVIEW_LENGTH = 12;

/* ------------------------------------------------------------------ */
/*  Axios instance                                                     */
/* ------------------------------------------------------------------ */

const client: AxiosInstance = axios.create({
    timeout: DEFAULT_TIMEOUT_MS,
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
});

/* ------------------------------------------------------------------ */
/*  Request interceptor — auto-inject bearer token                     */
/* ------------------------------------------------------------------ */

client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        // Skip auth injection if explicitly disabled
        if ((config as unknown as Record<string, unknown>).__skipAuth) {
            return config;
        }

        try {
            const token = await resolveAuthToken();

            if (token) {
                config.headers.Authorization = `Bearer ${token}`;

                const preview = token.substring(0, TOKEN_PREVIEW_LENGTH);
                console.log(`[marco-sdk:http] Auth injected: Bearer ${preview}...`);
            }
        } catch {
            console.warn("[marco-sdk:http] Failed to resolve auth token — proceeding without");
        }

        return config;
    },
    (error: AxiosError) => Promise.reject(error),
);

/* ------------------------------------------------------------------ */
/*  Response interceptor — 401 recovery + 429 retry                    */
/* ------------------------------------------------------------------ */

interface RetryConfig extends InternalAxiosRequestConfig {
    __retryCount?: number;
    headers: InternalAxiosRequestConfig['headers'];
}

client.interceptors.response.use(
    (response: import("axios").AxiosResponse) => response,
    async (error: AxiosError) => {
        const config = error.config as RetryConfig | undefined;

        if (!config) {
            return Promise.reject(error);
        }

        const status = error.response?.status;
        const retryCount = config.__retryCount ?? 0;

        // 401 — attempt token refresh once
        if (status === 401 && retryCount === 0) {
            console.log("[marco-sdk:http] 401 received — invalidating token cache and refreshing");
            invalidateCachedToken();
            try {
                const refreshResult = await sendMessage<unknown>("AUTH_REFRESH");
                const newToken = extractBearerTokenFromBridgePayload(refreshResult);

                if (newToken) {
                    config.headers.Authorization = `Bearer ${newToken}`;
                    config.__retryCount = 1;
                    return client(config);
                }
            } catch {
                console.error(`[marco-sdk:http] Token refresh failed\n  Path: marco_bearer_token refresh via cookie/localStorage\n  Missing: Valid JWT for re-authentication\n  Reason: Refresh attempt threw — user may need to re-authenticate`);
            }
        }

        // 429 — retry with backoff
        if (status === 429 && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * (retryCount + 1);
            console.log(`[marco-sdk:http] 429 rate limited — retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);

            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            config.__retryCount = retryCount + 1;
            return client(config);
        }

        return Promise.reject(error);
    },
);

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export { client as httpClient };

/* ------------------------------------------------------------------ */
/*  Token resolution — bridge with localStorage fallback              */
/* ------------------------------------------------------------------ */

const LOCALSTORAGE_TOKEN_KEY = "marco_bearer_token";
const BRIDGE_TIMEOUT_MS = 3_000;

/** Diagnostic: last token resolution result, readable by startup waterfall. */
export interface AuthResolutionDiag {
    source: "bridge" | "localStorage" | "none";
    durationMs: number;
    bridgeOutcome: "hit" | "timeout" | "error" | "skipped";
}

let lastAuthDiag: AuthResolutionDiag | null = null;

/** Returns the most recent auth resolution diagnostic (for startup waterfall). */
export function getLastAuthDiag(): AuthResolutionDiag | null {
    return lastAuthDiag;
}

/* ------------------------------------------------------------------ */
/*  Token cache — prevents repeated 3s bridge timeouts per request    */
/* ------------------------------------------------------------------ */

let cachedToken: string | null = null;
let cacheExpiresAt = 0;
let inflightResolve: Promise<string | null> | null = null;
const TOKEN_CACHE_TTL_MS = 60_000; // re-resolve every 60s

/** Clears the cached token (call on 401 or manual refresh). */
export function invalidateCachedToken(): void {
    cachedToken = null;
    cacheExpiresAt = 0;
    inflightResolve = null;
}

async function resolveAuthToken(): Promise<string | null> {
    // Fast path: return cached token if still valid
    if (cachedToken && Date.now() < cacheExpiresAt) {
        return cachedToken;
    }

    // Dedup: if a resolution is already in flight, wait for it
    if (inflightResolve) {
        return inflightResolve;
    }

    inflightResolve = resolveAuthTokenInner();
    try {
        const token = await inflightResolve;
        if (token) {
            cachedToken = token;
            cacheExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS;
        }
        return token;
    } finally {
        inflightResolve = null;
    }
}

async function resolveAuthTokenInner(): Promise<string | null> {
    const t0 = performance.now();
    let bridgeOutcome: AuthResolutionDiag["bridgeOutcome"] = "skipped";

    // Try bridge first (fast path when extension relay is active)
    try {
        const bridgeResult = await Promise.race([
            sendMessage<unknown>("AUTH_GET_TOKEN"),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), BRIDGE_TIMEOUT_MS)),
        ]);
        const bridgeToken = extractBearerTokenFromBridgePayload(bridgeResult);
        if (bridgeToken) {
            const ms = performance.now() - t0;
            bridgeOutcome = "hit";
            lastAuthDiag = { source: "bridge", durationMs: ms, bridgeOutcome };
            console.log("[marco-sdk:auth] ✅ Bridge token resolved in %.1fms", ms);
            return bridgeToken;
        }
        bridgeOutcome = "timeout";
        console.log("[marco-sdk:auth] ⏱ Bridge returned null after %.1fms — falling back to localStorage",
            performance.now() - t0);
    } catch {
        bridgeOutcome = "error";
        console.log("[marco-sdk:auth] ❌ Bridge error after %.1fms — falling back to localStorage",
            performance.now() - t0);
    }

    // Fallback: read from localStorage (written by macro controller's auth module)
    try {
        const stored = localStorage.getItem(LOCALSTORAGE_TOKEN_KEY);
        if (stored) {
            const ms = performance.now() - t0;
            lastAuthDiag = { source: "localStorage", durationMs: ms, bridgeOutcome };
            console.log("[marco-sdk:auth] 🔑 localStorage fallback resolved in %.1fms (bridge: %s)", ms, bridgeOutcome);
            return stored;
        }
    } catch {
        // localStorage unavailable
    }

    const ms = performance.now() - t0;
    lastAuthDiag = { source: "none", durationMs: ms, bridgeOutcome };
    console.warn("[marco-sdk:auth] ⚠ No token from any source after %.1fms (bridge: %s)", ms, bridgeOutcome);
    return null;
}
