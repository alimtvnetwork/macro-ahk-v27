/**
 * Marco Extension — Endpoint Scheduler (Spec 17 §3.4)
 *
 * Manages a small pool of `setInterval` timers that periodically refresh
 * registered endpoint data sources. Returns a single teardown function so
 * callers can clear ALL active timers atomically (e.g. on session end).
 *
 * Capped at `MAX_ACTIVE_TIMERS = 32` — registrations beyond that are
 * silently dropped and reported in `result.Skipped` so the caller can
 * surface a warning toast.
 *
 * Pure module — no chrome.* / DOM dependencies; the tick callback is
 * passed in by the caller.
 */

export interface ScheduledFetch {
    readonly DataSourceId: number;
    readonly IntervalMs: number;
}

export interface SchedulerStartResult {
    readonly Teardown: () => void;
    readonly Active: ReadonlyArray<number>;
    readonly Skipped: ReadonlyArray<number>;
}

export const MAX_ACTIVE_TIMERS = 32;
export const MIN_INTERVAL_MS = 1_000;

export function startScheduler(
    fetches: ReadonlyArray<ScheduledFetch>,
    onTick: (dataSourceId: number) => void,
    setIntervalImpl: typeof setInterval = setInterval,
    clearIntervalImpl: typeof clearInterval = clearInterval,
): SchedulerStartResult {
    const handles: ReturnType<typeof setInterval>[] = [];
    const active: number[] = [];
    const skipped: number[] = [];

    for (const fetchSpec of fetches) {
        const reachedCap = active.length >= MAX_ACTIVE_TIMERS;
        const intervalTooSmall = fetchSpec.IntervalMs < MIN_INTERVAL_MS;
        if (reachedCap || intervalTooSmall) {
            skipped.push(fetchSpec.DataSourceId);
            continue;
        }
        const handle = setIntervalImpl(
            () => onTick(fetchSpec.DataSourceId),
            fetchSpec.IntervalMs,
        );
        handles.push(handle);
        active.push(fetchSpec.DataSourceId);
    }

    const teardown = (): void => {
        for (const h of handles) clearIntervalImpl(h);
        handles.length = 0;
    };

    return { Teardown: teardown, Active: active, Skipped: skipped };
}
