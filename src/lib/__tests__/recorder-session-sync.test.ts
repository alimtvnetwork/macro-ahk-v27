/**
 * Marco Extension — Recorder session sync tests
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

import {
    __resetRecorderSessionSyncForTests,
    detectTransport,
    parseSession,
    readSession,
    subscribeRecorderSession,
    writeSession,
} from "@/lib/recorder-session-sync";
import { RECORDER_SESSION_STORAGE_KEY, type RecordingSession } from "@/background/recorder/recorder-session-types";

function makeSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
    return {
        SessionId: "sess-1",
        ProjectSlug: "proj",
        StartedAt: "2026-04-27T00:00:00.000Z",
        Phase: "Recording",
        Steps: [],
        ...overrides,
    };
}

describe("parseSession", () => {
    it("rejects non-objects and bad shapes", () => {
        expect(parseSession(null)).toBeNull();
        expect(parseSession(42)).toBeNull();
        expect(parseSession({ Phase: "Recording" })).toBeNull();
    });

    it("accepts a well-formed session", () => {
        const s = makeSession();
        expect(parseSession(s)).toBe(s);
    });

    it("rejects an unknown phase", () => {
        expect(parseSession({ ...makeSession(), Phase: "Bogus" })).toBeNull();
    });
});

describe("detectTransport (preview)", () => {
    it("falls back to localStorage when chrome.runtime.id is absent", () => {
        // No chrome global is patched in jsdom by default.
        expect(detectTransport()).toBe("localStorage");
    });
});

describe("subscribeRecorderSession (localStorage transport)", () => {
    beforeEach(() => {
        __resetRecorderSessionSyncForTests();
        window.localStorage.clear();
    });

    it("delivers the current state immediately on subscribe", async () => {
        await writeSession(makeSession({ ProjectSlug: "alpha" }));
        const cb = vi.fn();
        subscribeRecorderSession(cb);
        await new Promise((r) => setTimeout(r, 0));
        expect(cb).toHaveBeenCalled();
        const last = cb.mock.calls.at(-1)?.[0] as RecordingSession | null;
        expect(last?.ProjectSlug).toBe("alpha");
    });

    it("fans out same-tab writes to multiple subscribers", async () => {
        const a = vi.fn();
        const b = vi.fn();
        subscribeRecorderSession(a);
        subscribeRecorderSession(b);
        await new Promise((r) => setTimeout(r, 0));
        a.mockClear(); b.mockClear();

        await writeSession(makeSession({ Steps: [] }));
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it("dispatches null when phase becomes Idle", async () => {
        await writeSession(makeSession());
        const cb = vi.fn();
        subscribeRecorderSession(cb);
        await new Promise((r) => setTimeout(r, 0));
        cb.mockClear();

        await writeSession(makeSession({ Phase: "Idle" }));
        expect(cb).toHaveBeenLastCalledWith(null);
    });

    it("stops delivering after unsubscribe", async () => {
        const cb = vi.fn();
        const off = subscribeRecorderSession(cb);
        await new Promise((r) => setTimeout(r, 0));
        cb.mockClear();
        off();

        await writeSession(makeSession());
        await new Promise((r) => setTimeout(r, 0));
        expect(cb).not.toHaveBeenCalled();
    });

    it("reacts to cross-tab DOM storage events", async () => {
        const cb = vi.fn();
        subscribeRecorderSession(cb);
        await new Promise((r) => setTimeout(r, 0));
        cb.mockClear();

        const session = makeSession({ ProjectSlug: "from-other-tab" });
        window.dispatchEvent(new StorageEvent("storage", {
            key: RECORDER_SESSION_STORAGE_KEY,
            newValue: JSON.stringify(session),
        }));
        expect(cb).toHaveBeenCalledTimes(1);
        expect((cb.mock.calls[0][0] as RecordingSession).ProjectSlug).toBe("from-other-tab");
    });

    it("ignores unrelated storage keys", async () => {
        const cb = vi.fn();
        subscribeRecorderSession(cb);
        await new Promise((r) => setTimeout(r, 0));
        cb.mockClear();

        window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "x" }));
        expect(cb).not.toHaveBeenCalled();
    });
});

describe("readSession", () => {
    beforeEach(() => {
        __resetRecorderSessionSyncForTests();
        window.localStorage.clear();
    });
    it("returns null when storage is empty", async () => {
        expect(await readSession()).toBeNull();
    });
    it("round-trips a written session", async () => {
        const s = makeSession({ Steps: [] });
        await writeSession(s);
        const back = await readSession();
        expect(back?.SessionId).toBe(s.SessionId);
    });
});
