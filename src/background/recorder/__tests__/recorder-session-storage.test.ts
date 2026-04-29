/**
 * recorder-session-storage — chrome.storage.local mirror tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    clearSession,
    loadSession,
    persistSession,
} from "../recorder-session-storage";
import {
    RECORDER_SESSION_STORAGE_KEY,
    type RecordingSession,
} from "../recorder-session-types";

interface FakeStore { data: Record<string, unknown> }

function installFakeChrome(): FakeStore {
    const store: FakeStore = { data: {} };
    const local = {
        get: vi.fn(async (key: string) => ({ [key]: store.data[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store.data, items); }),
        remove: vi.fn(async (key: string) => { delete store.data[key]; }),
    };
    (globalThis as { chrome?: unknown }).chrome = { storage: { local } };
    return store;
}

const RECORDING_SESSION: RecordingSession = {
    SessionId: "sess-A",
    ProjectSlug: "demo",
    StartedAt: "2026-04-26T00:00:00.000Z",
    Phase: "Recording",
    Steps: [],
};

describe("recorder-session-storage", () => {
    beforeEach(() => { installFakeChrome(); });

    it("persists a Recording session under the canonical key", async () => {
        const store = installFakeChrome();
        await persistSession(RECORDING_SESSION);
        expect(store.data[RECORDER_SESSION_STORAGE_KEY]).toEqual(RECORDING_SESSION);
    });

    it("clears storage when persisting an Idle session", async () => {
        const store = installFakeChrome();
        store.data[RECORDER_SESSION_STORAGE_KEY] = RECORDING_SESSION;
        await persistSession({ ...RECORDING_SESSION, Phase: "Idle" });
        expect(store.data[RECORDER_SESSION_STORAGE_KEY]).toBeUndefined();
    });

    it("loads a previously persisted session", async () => {
        const store = installFakeChrome();
        store.data[RECORDER_SESSION_STORAGE_KEY] = RECORDING_SESSION;
        const loaded = await loadSession();
        expect(loaded).toEqual(RECORDING_SESSION);
    });

    it("returns null when nothing is stored", async () => {
        installFakeChrome();
        expect(await loadSession()).toBeNull();
    });

    it("returns null when stored value is malformed", async () => {
        const store = installFakeChrome();
        store.data[RECORDER_SESSION_STORAGE_KEY] = { Phase: "Bogus" };
        expect(await loadSession()).toBeNull();
    });

    it("clearSession removes the key", async () => {
        const store = installFakeChrome();
        store.data[RECORDER_SESSION_STORAGE_KEY] = RECORDING_SESSION;
        await clearSession();
        expect(store.data[RECORDER_SESSION_STORAGE_KEY]).toBeUndefined();
    });

    it("throws a clear error when chrome.storage.local is missing", async () => {
        (globalThis as { chrome?: unknown }).chrome = undefined;
        await expect(persistSession(RECORDING_SESSION)).rejects.toThrow(/chrome\.storage\.local unavailable/);
    });
});
