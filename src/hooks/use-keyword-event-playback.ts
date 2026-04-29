/**
 * Marco Extension — useKeywordEventPlayback
 *
 * Thin React wrapper over {@link runKeywordEvent} that tracks the actively
 * running keyword event id, exposes per-step progress, and supports cancel.
 * One playback may run at a time per hook instance; calling `play()` while
 * another runs aborts the previous run first.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";
import { runKeywordEvent, type PlaybackResult } from "@/lib/keyword-event-playback";

export interface KeywordEventPlaybackState {
    readonly runningId: string | null;
    readonly currentStepIndex: number | null;
    readonly play: (event: KeywordEvent, target?: EventTarget | null) => Promise<PlaybackResult>;
    readonly cancel: () => void;
    readonly isRunning: (id: string) => boolean;
}

export function useKeywordEventPlayback(): KeywordEventPlaybackState {
    const [runningId, setRunningId] = useState<string | null>(null);
    const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, []);

    const play = useCallback(async (event: KeywordEvent, target?: EventTarget | null): Promise<PlaybackResult> => {
        controllerRef.current?.abort();
        const ctrl = new AbortController();
        controllerRef.current = ctrl;
        setRunningId(event.Id);
        setCurrentStepIndex(null);
        try {
            const result = await runKeywordEvent(event, {
                target: target ?? undefined,
                signal: ctrl.signal,
                onStep: (_s: KeywordEventStep, i: number) => setCurrentStepIndex(i),
            });
            return result;
        } finally {
            if (controllerRef.current === ctrl) controllerRef.current = null;
            setRunningId(prev => (prev === event.Id ? null : prev));
            setCurrentStepIndex(null);
        }
    }, []);

    const isRunning = useCallback((id: string): boolean => runningId === id, [runningId]);

    return { runningId, currentStepIndex, play, cancel, isRunning };
}
