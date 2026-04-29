/**
 * Marco Extension — Recorder Session Sync
 *
 * Single source of truth for streaming the active {@link RecordingSession}
 * from the extension backend (or the preview fallback) into any React surface
 * — currently the Floating Controller, the Live Recorded Actions Tree, and
 * the Recorder Control Bar.
 *
 * Transport waterfall (resolved once per process):
 *   1. **Extension context** — `chrome.storage.local` reads + writes plus a
 *      `chrome.storage.onChanged` subscription. The background service
 *      worker writes captured steps to `RECORDER_SESSION_STORAGE_KEY` after
 *      every reducer transition; subscribers fire within one event-loop tick.
 *   2. **Preview / Vite** — `window.localStorage` reads + writes plus the
 *      DOM `storage` event for cross-tab sync and an in-tab `CustomEvent`
 *      bus for same-tab updates.
 *
 * A single in-memory listener set deduplicates per-process subscriptions so
 * we attach exactly one chrome.storage.onChanged / window event listener
 * regardless of how many components subscribe.
 *
 * @see ../background/recorder/recorder-session-storage.ts — backend writer
 * @see ../background/recorder/recorder-session-types.ts   — shape contract
 * @see ../hooks/use-recording-session.ts                   — primary consumer
 */

import {
    RECORDER_SESSION_STORAGE_KEY,
    type RecordingSession,
} from "@/background/recorder/recorder-session-types";
import { logError } from "./lib-logger";

export type RecorderSessionListener = (session: RecordingSession | null) => void;
export type RecorderSyncTransport = "chrome.storage" | "localStorage" | "memory";

/* ------------------------------------------------------------------ */
/*  Transport detection                                                */
/* ------------------------------------------------------------------ */

interface ChromeStorageLocalLike {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
}

interface ChromeStorageChangeListener {
    (
        changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
        areaName: string,
    ): void;
}

interface ChromeOnChangedLike {
    addListener: (cb: ChromeStorageChangeListener) => void;
    removeListener: (cb: ChromeStorageChangeListener) => void;
}

interface ChromeApiLike {
    storage?: {
        local?: ChromeStorageLocalLike;
        onChanged?: ChromeOnChangedLike;
    };
    runtime?: { id?: string };
}

function getChrome(): ChromeApiLike | null {
    const api = (globalThis as { chrome?: ChromeApiLike }).chrome;
    if (api === undefined) { return null; }
    if (api.runtime?.id === undefined) { return null; } // Excludes preview where chrome may be partly polyfilled.
    return api;
}

export function detectTransport(): RecorderSyncTransport {
    if (getChrome()?.storage?.local !== undefined) { return "chrome.storage"; }
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        return "localStorage";
    }
    return "memory";
}

/* ------------------------------------------------------------------ */
/*  Parse / type-guard                                                 */
/* ------------------------------------------------------------------ */

export function parseSession(value: unknown): RecordingSession | null {
    if (typeof value !== "object" || value === null) { return null; }
    const v = value as Record<string, unknown>;
    const phaseOk = v.Phase === "Idle" || v.Phase === "Recording" || v.Phase === "Paused";
    if (
        typeof v.SessionId !== "string" ||
        typeof v.ProjectSlug !== "string" ||
        typeof v.StartedAt !== "string" ||
        !Array.isArray(v.Steps) ||
        !phaseOk
    ) {
        return null;
    }
    return value as RecordingSession;
}

/* ------------------------------------------------------------------ */
/*  Read / write                                                       */
/* ------------------------------------------------------------------ */

const LOCAL_CHANGE_EVENT = "marco:recorder-session-changed";
const memoryStore = { current: null as RecordingSession | null };

export async function readSession(): Promise<RecordingSession | null> {
    const transport = detectTransport();
    if (transport === "chrome.storage") {
        const local = getChrome()!.storage!.local!;
        const result = await local.get(RECORDER_SESSION_STORAGE_KEY);
        return parseSession(result[RECORDER_SESSION_STORAGE_KEY]);
    }
    if (transport === "localStorage") {
        try {
            const raw = window.localStorage.getItem(RECORDER_SESSION_STORAGE_KEY);
            if (raw === null) { return null; }
            return parseSession(JSON.parse(raw));
        } catch { return null; }
    }
    return memoryStore.current;
}

export async function writeSession(session: RecordingSession): Promise<void> {
    const transport = detectTransport();
    if (transport === "chrome.storage") {
        const local = getChrome()!.storage!.local!;
        if (session.Phase === "Idle") {
            await local.remove(RECORDER_SESSION_STORAGE_KEY);
        } else {
            await local.set({ [RECORDER_SESSION_STORAGE_KEY]: session });
        }
        // chrome.storage.onChanged covers cross-context. Fire same-tab
        // bus too in case React surfaces are colocated with the writer
        // (e.g. popup) and want sub-tick updates.
        emitLocalChange(session);
        return;
    }
    if (transport === "localStorage") {
        if (session.Phase === "Idle") {
            window.localStorage.removeItem(RECORDER_SESSION_STORAGE_KEY);
        } else {
            window.localStorage.setItem(RECORDER_SESSION_STORAGE_KEY, JSON.stringify(session));
        }
        emitLocalChange(session);
        return;
    }
    memoryStore.current = session.Phase === "Idle" ? null : session;
    emitLocalChange(session);
}

function emitLocalChange(session: RecordingSession): void {
    if (typeof window === "undefined") { return; }
    window.dispatchEvent(new CustomEvent<RecordingSession>(LOCAL_CHANGE_EVENT, { detail: session }));
}

/* ------------------------------------------------------------------ */
/*  Subscription (one shared transport listener, many subscribers)     */
/* ------------------------------------------------------------------ */

const subscribers = new Set<RecorderSessionListener>();
let installedTransport: RecorderSyncTransport | null = null;
let chromeListener: ChromeStorageChangeListener | null = null;
let domStorageListener: ((e: StorageEvent) => void) | null = null;
let localBusListener: ((e: Event) => void) | null = null;

function dispatch(session: RecordingSession | null): void {
    // Iterate a snapshot — listeners may unsubscribe during dispatch.
    for (const cb of [...subscribers]) {
        try { cb(session); } catch (err) {
            logError(
                "recorder-session-sync.dispatch",
                `Subscriber callback threw\n  Path: subscribers Set (${subscribers.size} listener(s)) — RecorderSessionListener invocation\n  Missing: Clean callback execution for session=${session?.SessionId ?? "null"}\n  Reason: ${err instanceof Error ? err.message : String(err)} — listener body threw; remaining subscribers still dispatched`,
                err,
            );
        }
    }
}

function installTransport(): void {
    if (installedTransport !== null) { return; }
    const transport = detectTransport();
    installedTransport = transport;

    if (transport === "chrome.storage") {
        const onChanged = getChrome()?.storage?.onChanged;
        if (onChanged !== undefined) {
            chromeListener = (changes, area) => {
                if (area !== "local") { return; }
                const change = changes[RECORDER_SESSION_STORAGE_KEY];
                if (change === undefined) { return; }
                dispatch(parseSession(change.newValue));
            };
            onChanged.addListener(chromeListener);
        }
    }

    if (typeof window !== "undefined") {
        domStorageListener = (e: StorageEvent) => {
            if (e.key !== RECORDER_SESSION_STORAGE_KEY) { return; }
            try {
                dispatch(e.newValue === null ? null : parseSession(JSON.parse(e.newValue)));
            } catch { dispatch(null); }
        };
        localBusListener = (e: Event) => {
            const detail = (e as CustomEvent<RecordingSession>).detail;
            dispatch(detail.Phase === "Idle" ? null : detail);
        };
        window.addEventListener("storage", domStorageListener);
        window.addEventListener(LOCAL_CHANGE_EVENT, localBusListener);
    }
}

function teardownTransport(): void {
    if (installedTransport === null) { return; }
    if (chromeListener !== null) {
        getChrome()?.storage?.onChanged?.removeListener(chromeListener);
        chromeListener = null;
    }
    if (typeof window !== "undefined") {
        if (domStorageListener !== null) {
            window.removeEventListener("storage", domStorageListener);
            domStorageListener = null;
        }
        if (localBusListener !== null) {
            window.removeEventListener(LOCAL_CHANGE_EVENT, localBusListener);
            localBusListener = null;
        }
    }
    installedTransport = null;
}

/**
 * Subscribe to live recorder-session updates. The first subscription installs
 * the transport listeners; the last unsubscribe tears them down. Returns an
 * unsubscribe function.
 */
export function subscribeRecorderSession(listener: RecorderSessionListener): () => void {
    subscribers.add(listener);
    installTransport();

    // Push current state immediately so subscribers don't render an empty
    // frame while waiting for the first storage hit.
    void readSession().then((s) => {
        if (subscribers.has(listener)) { listener(s); }
    });

    return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) { teardownTransport(); }
    };
}

/** Test-only helper to fully reset module-level state between tests. */
export function __resetRecorderSessionSyncForTests(): void {
    subscribers.clear();
    teardownTransport();
    memoryStore.current = null;
}
