/**
 * useVisibilityPausedInterval
 *
 * `setInterval` that pauses while `document.hidden === true` and resumes
 * (with an immediate catch-up tick) when the page becomes visible again.
 *
 * Background — Idle/Background Loop Audit, 2026-04-25 (PERF-10..12):
 *   Naked `setInterval`s in React hooks keep firing while a tab is in a
 *   background window. For MV3 extensions this also wakes the service
 *   worker on every tick (each `sendMessage` revives the SW), defeating
 *   Chrome's idle-suspension heuristic. The pattern was first proven on
 *   `useErrorCount`; this hook generalises it so the rest of the codebase
 *   can adopt it with one line.
 *
 * Contract:
 *   - `tickFn` is invoked once on mount if the page is currently visible.
 *   - While visible: invoked every `intervalMs` until unmount.
 *   - On `visibilitychange → hidden`: timer cleared.
 *   - On `visibilitychange → visible`: `tickFn()` runs once immediately,
 *     then the timer is re-armed.
 *   - Setting `enabled = false` tears the timer down without unmounting.
 *
 * The hook deliberately tolerates SSR (`typeof document === "undefined"`)
 * and an extension-context-invalidated environment (no document at all).
 *
 * @see spec/22-app-issues/109-react-hooks-visibility-pause.md
 */

import { useEffect, useRef } from "react";

export function useVisibilityPausedInterval(
    tickFn: () => void,
    intervalMs: number,
    enabled = true,
): void {
    const tickRef = useRef(tickFn);
    tickRef.current = tickFn;

    useEffect(() => {
        if (!enabled) { return; }
        if (typeof document === "undefined") {
            // SSR / non-DOM environment — fall back to plain interval so
            // unit tests still observe ticks.
            const id = setInterval(() => tickRef.current(), intervalMs);
            return () => clearInterval(id);
        }

        let timerId: ReturnType<typeof setInterval> | null = null;

        const start = (): void => {
            if (timerId !== null) { return; }
            timerId = setInterval(() => tickRef.current(), intervalMs);
        };

        const stop = (): void => {
            if (timerId === null) { return; }
            clearInterval(timerId);
            timerId = null;
        };

        const handleVisibility = (): void => {
            if (document.hidden) {
                stop();
            } else {
                tickRef.current();
                start();
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        if (!document.hidden) {
            tickRef.current();
            start();
        }

        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            stop();
        };
    }, [intervalMs, enabled]);
}
