/**
 * Marco Extension — Recorder Session Persistence
 *
 * Mirrors the active RecordingSession to chrome.storage.local on every
 * state transition so the draft survives service-worker restarts and tab
 * navigations (the toolbar UX spec calls this out as a hard requirement).
 *
 * Lookup, write, and clear are the only operations — no merge logic. The
 * reducer is the single source of truth for shape; this module just shuttles
 * the bytes.
 *
 * @see ./recorder-session-types.ts — Storage key + RecordingSession shape
 * @see spec/26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md
 */

import {
    RECORDER_SESSION_STORAGE_KEY,
    type RecordingSession,
} from "./recorder-session-types";

interface ChromeStorageLike {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string | string[]) => Promise<void>;
}

function getStorage(): ChromeStorageLike {
    const api = (globalThis as { chrome?: { storage?: { local?: ChromeStorageLike } } }).chrome;
    const local = api?.storage?.local;
    if (local === undefined) {
        throw new Error(
            "[recorder-session-storage] chrome.storage.local unavailable. " +
            "This module must run in an extension context (service worker, content script, or popup).",
        );
    }
    return local;
}

/** Writes the session if Phase is non-Idle; clears the draft when Idle. */
export async function persistSession(session: RecordingSession): Promise<void> {
    const storage = getStorage();
    if (session.Phase === "Idle") {
        await storage.remove(RECORDER_SESSION_STORAGE_KEY);
        return;
    }
    await storage.set({ [RECORDER_SESSION_STORAGE_KEY]: session });
}

/** Returns the persisted draft, or null if none exists / shape is unrecognisable. */
export async function loadSession(): Promise<RecordingSession | null> {
    const storage = getStorage();
    const result = await storage.get(RECORDER_SESSION_STORAGE_KEY);
    const value = result[RECORDER_SESSION_STORAGE_KEY];
    if (!isRecordingSession(value)) { return null; }
    return value;
}

export async function clearSession(): Promise<void> {
    const storage = getStorage();
    await storage.remove(RECORDER_SESSION_STORAGE_KEY);
}

function isRecordingSession(value: unknown): value is RecordingSession {
    if (typeof value !== "object" || value === null) { return false; }
    const v = value as Record<string, unknown>;
    const phaseOk = v.Phase === "Idle" || v.Phase === "Recording" || v.Phase === "Paused";
    return (
        typeof v.SessionId === "string" &&
        typeof v.ProjectSlug === "string" &&
        typeof v.StartedAt === "string" &&
        Array.isArray(v.Steps) &&
        phaseOk
    );
}
