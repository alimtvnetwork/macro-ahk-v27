/**
 * Unit tests — useRecordingSession hook (localStorage fallback path).
 *
 * Exercises the non-extension path used inside the Lovable preview: reads
 * from `window.localStorage`, dispatches reducer actions, and reflects
 * the resulting Phase to consumers. The chrome.storage path is identical
 * shape but covered by the recorder-session-storage.test suite.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRecordingSession } from "../use-recording-session";
import {
    RECORDER_SESSION_STORAGE_KEY,
    type RecordingSession,
} from "@/background/recorder/recorder-session-types";

function seed(session: RecordingSession): void {
    window.localStorage.setItem(RECORDER_SESSION_STORAGE_KEY, JSON.stringify(session));
}

const ACTIVE: RecordingSession = {
    SessionId: "sess-1",
    ProjectSlug: "demo",
    StartedAt: new Date("2026-04-27T10:00:00.000Z").toISOString(),
    Phase: "Recording",
    Steps: [],
};

describe("useRecordingSession (localStorage fallback)", () => {
    beforeEach(() => { window.localStorage.clear(); });
    afterEach(() => { window.localStorage.clear(); });

    it("returns null when no session is persisted", async () => {
        const { result } = renderHook(() => useRecordingSession());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.session).toBeNull();
    });

    it("reads a persisted Recording session on mount", async () => {
        seed(ACTIVE);
        const { result } = renderHook(() => useRecordingSession());
        await waitFor(() => expect(result.current.session).not.toBeNull());
        expect(result.current.session?.Phase).toBe("Recording");
    });

    it("pause transitions Recording → Paused and persists", async () => {
        seed(ACTIVE);
        const { result } = renderHook(() => useRecordingSession());
        await waitFor(() => expect(result.current.session).not.toBeNull());
        await act(async () => { await result.current.pause(); });
        expect(result.current.session?.Phase).toBe("Paused");
        const stored = JSON.parse(
            window.localStorage.getItem(RECORDER_SESSION_STORAGE_KEY) ?? "null",
        );
        expect(stored.Phase).toBe("Paused");
    });

    it("resume transitions Paused → Recording", async () => {
        seed({ ...ACTIVE, Phase: "Paused" });
        const { result } = renderHook(() => useRecordingSession());
        await waitFor(() => expect(result.current.session).not.toBeNull());
        await act(async () => { await result.current.resume(); });
        expect(result.current.session?.Phase).toBe("Recording");
    });

    it("stop clears the persisted draft and yields null", async () => {
        seed(ACTIVE);
        const { result } = renderHook(() => useRecordingSession());
        await waitFor(() => expect(result.current.session).not.toBeNull());
        await act(async () => { await result.current.stop(); });
        expect(result.current.session).toBeNull();
        expect(window.localStorage.getItem(RECORDER_SESSION_STORAGE_KEY)).toBeNull();
    });
});
