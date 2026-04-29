/**
 * Marco Extension — Active Recording Session Hook
 *
 * Subscribes the React UI to the recorder draft maintained by the extension
 * backend. All transport details (chrome.storage.local in extension context,
 * window.localStorage in the preview, in-memory fallback otherwise) are
 * encapsulated in {@link recorder-session-sync}, so this hook is a thin
 * React binding plus the imperative dispatchers (start/pause/resume/stop).
 *
 * @see ../lib/recorder-session-sync.ts                  — shared transport
 * @see ../background/recorder/recorder-store.ts          — pure reducer
 * @see ../background/recorder/recorder-session-storage.ts — backend writer
 */

import { useCallback, useEffect, useState } from "react";

import {
    recorderReducer,
    type RecorderAction,
} from "@/background/recorder/recorder-store";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";
import {
    readSession,
    subscribeRecorderSession,
    writeSession,
} from "@/lib/recorder-session-sync";

export interface UseRecordingSessionResult {
    /** Current active session, or null when Idle / no draft. */
    readonly session: RecordingSession | null;
    /** True while the initial storage read is in flight. */
    readonly loading: boolean;
    readonly start: (projectSlug?: string) => Promise<void>;
    readonly pause: () => Promise<void>;
    readonly resume: () => Promise<void>;
    readonly stop: () => Promise<void>;
}

function newSessionId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID !== undefined) { return c.randomUUID(); }
    return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useRecordingSession(): UseRecordingSessionResult {
    const [session, setSession] = useState<RecordingSession | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;
        const unsubscribe = subscribeRecorderSession((next) => {
            if (cancelled) { return; }
            setSession(next);
            setLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    const dispatch = useCallback(async (action: RecorderAction) => {
        const current = await readSession();
        if (current === null) { return; }
        const next = recorderReducer(current, action);
        await writeSession(next);
        // The transport will broadcast back to us, but set local state
        // synchronously too so the dispatcher feels instant.
        setSession(next.Phase === "Idle" ? null : next);
    }, []);

    const start = useCallback(async (projectSlug?: string) => {
        const current = await readSession();
        if (current !== null && current.Phase !== "Idle") { return; }
        const seed: RecordingSession = {
            SessionId: "",
            ProjectSlug: projectSlug ?? "default",
            StartedAt: "",
            Phase: "Idle",
            Steps: [],
        };
        const next = recorderReducer(seed, {
            Kind: "Start",
            ProjectSlug: projectSlug ?? "default",
            SessionId: newSessionId(),
            StartedAt: new Date().toISOString(),
        });
        await writeSession(next);
        setSession(next);
    }, []);

    const pause = useCallback(() => dispatch({ Kind: "Pause" }), [dispatch]);
    const resume = useCallback(() => dispatch({ Kind: "Resume" }), [dispatch]);
    const stop = useCallback(() => dispatch({ Kind: "Stop" }), [dispatch]);

    return { session, loading, start, pause, resume, stop };
}
