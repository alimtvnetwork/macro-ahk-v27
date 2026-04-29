/**
 * Marco Extension — Hot Reload
 *
 * Polls build-meta.json for changes and auto-reloads the extension
 * when a new build is detected.
 *
 * PERF-1 (2026-04-25): build-meta.json is now only emitted in development
 * builds (see vite.config.extension.ts → generateBuildMeta is gated by
 * `isDev`). As a defense-in-depth measure, the polling loop also
 * short-circuits at startup when the manifest version_name does not
 * include "dev", so a stale build-meta.json shipped by accident cannot
 * keep the MV3 service worker awake every second in production.
 *
 * The interval ID is now captured and a `stopHotReload()` API is exposed
 * for tests and explicit teardown.
 *
 * See spec/22-app-issues/15-deploy-no-auto-reload.md
 */

import { syncCacheWithBuildId } from "./injection-cache";

const HOT_RELOAD_INTERVAL_MS = 1000;
const BUILD_META_URL = "build-meta.json";

let lastKnownBuildId: string | null = null;
let pollingTimerId: ReturnType<typeof setInterval> | null = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Returns true when the running extension build is a dev/deploy build.
 * Production release builds set version_name without the "dev" suffix
 * (see vite.config.extension.ts → copyManifest()).
 */
function isDevBuild(): boolean {
    try {
        const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & { version_name?: string };
        const versionName = manifest.version_name ?? "";
        return versionName.toLowerCase().includes("dev");
    } catch {
        // If we cannot read the manifest, fail safe and treat as production.
        return false;
    }
}

/** Starts the hot-reload polling loop (no-op in production). */
export function startHotReload(): void {
    if (pollingTimerId !== null) {
        return;
    }

    if (!isDevBuild()) {
        console.log("[hot-reload] Disabled (production build) — not polling build-meta.json");
        return;
    }

    void pollBuildMeta();
    pollingTimerId = setInterval(() => void pollBuildMeta(), HOT_RELOAD_INTERVAL_MS);
    console.log("[hot-reload] Polling started (every %dms, dev build only)", HOT_RELOAD_INTERVAL_MS);
}

/** Stops the polling loop. Safe to call when not started. */
export function stopHotReload(): void {
    if (pollingTimerId === null) {
        return;
    }
    clearInterval(pollingTimerId);
    pollingTimerId = null;
    console.log("[hot-reload] Polling stopped");
}

/* ------------------------------------------------------------------ */
/*  Polling Logic                                                      */
/* ------------------------------------------------------------------ */

/** Fetches build-meta.json and triggers reload if buildId changed. */
async function pollBuildMeta(): Promise<void> {
    try {
        const metaUrl = chrome.runtime.getURL(BUILD_META_URL);
        const response = await fetch(metaUrl, { cache: "no-store" });
        const isNotFound = !response.ok;

        if (isNotFound) {
            return;
        }

        const meta = await response.json() as { buildId?: string };
        const currentBuildId = meta.buildId ?? null;
        const hasBuildId = currentBuildId !== null;

        if (!hasBuildId) {
            return;
        }

        const isFirstPoll = lastKnownBuildId === null;

        if (isFirstPoll) {
            lastKnownBuildId = currentBuildId;
            console.log("[hot-reload] Baseline buildId: %s", currentBuildId);
            return;
        }

        const isBuildChanged = currentBuildId !== lastKnownBuildId;

        if (isBuildChanged) {
            const previousBuildId = lastKnownBuildId;
            lastKnownBuildId = currentBuildId;
            const cacheSyncResult = await syncCacheWithBuildId(currentBuildId);
            console.log(
                "[hot-reload] Build changed: %s → %s — cleared %d cache entries, reloading!",
                previousBuildId,
                currentBuildId,
                cacheSyncResult.cleared,
            );
            chrome.runtime.reload();
        }
    } catch {
        // Silently ignore fetch failures (file missing, network error, etc.)
    }
}
