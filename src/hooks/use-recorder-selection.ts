/**
 * Marco Extension — useRecorderSelection
 *
 * React binding around the {@link recorderSelectionBus}. Returns the
 * current selection plus a setter that broadcasts to all subscribers
 * (Options panel + Floating Controller). Components pass their own
 * `Source` label so the hook can suppress echo updates from their own
 * dispatches.
 *
 * @see ../background/recorder/recorder-selection-bus.ts
 */

import { useCallback, useEffect, useState } from "react";

import {
    getSelection,
    setSelection as busSet,
    subscribeSelection,
    type RecorderSelection,
} from "@/background/recorder/recorder-selection-bus";

export interface UseRecorderSelectionResult {
    readonly selection: RecorderSelection;
    /** Replace the selection. `Source` is filled in automatically. */
    readonly select: (next: { StepGroupId: number | null; StepId: number | null }) => void;
}

export function useRecorderSelection(source: "options" | "controller"): UseRecorderSelectionResult {
    const [selection, setLocal] = useState<RecorderSelection>(() => getSelection());

    useEffect(() => {
        return subscribeSelection((next) => {
            // Echo-suppression: don't re-render on our own dispatch.
            if (next.Source === source) { return; }
            setLocal(next);
        });
    }, [source]);

    const select = useCallback((next: { StepGroupId: number | null; StepId: number | null }) => {
        const payload: RecorderSelection = { ...next, Source: source };
        setLocal(payload);
        busSet(payload);
    }, [source]);

    return { selection, select };
}
