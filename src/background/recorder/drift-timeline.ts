/**
 * Marco Extension — Drift Timeline (compact)
 *
 * Reduces a {@link SelectorHistoryBucket} to a two-point timeline:
 *   1. **LastSuccess** — the most recent run where this selector matched.
 *   2. **FirstDrift**  — the first failed run *after* that last success
 *                        (or the first-ever failure if it never succeeded).
 *
 * Used by `DriftElementDiffView` to render a compact "✓ ok @ T0  →  ✗ drift @ T1"
 * strip so the user can see at a glance *when* the selector started drifting
 * and how long it had been healthy before that.
 *
 * Pure: no clocks, no DB, no I/O. The current time is injected so the
 * relative-age formatter is deterministic in tests.
 *
 * @see ./selector-history.ts — Source of the per-selector buckets.
 * @see ../../components/recorder/DriftElementDiffView.tsx — Renderer.
 */

import type { SelectorHistoryBucket, SelectorOutcomePoint } from "./selector-history";

export type DriftTimelineState =
    | "no-history"      // Bucket has no runs at all.
    | "always-failing"  // Never succeeded; FirstDrift is the first-ever failure.
    | "healthy"         // No drift detected — last run still ok.
    | "drifted";        // Has a LastSuccess AND a FirstDrift after it.

export interface DriftTimelinePoint {
    readonly RunId: number;
    readonly At: string;             // ISO timestamp from the source row.
    readonly RelativeLabel: string;  // e.g. "12m ago", "3d ago", "just now".
    readonly Error: string | null;   // Failure message for the FirstDrift point.
}

export interface DriftTimeline {
    readonly State: DriftTimelineState;
    readonly LastSuccess: DriftTimelinePoint | null;
    readonly FirstDrift: DriftTimelinePoint | null;
    /**
     * ms between LastSuccess and FirstDrift. Null when one (or both) is
     * missing. Useful to surface "selector was healthy for 4 days before
     * drifting".
     */
    readonly HealthyDurationMs: number | null;
    /**
     * Number of failed runs since `FirstDrift` (inclusive). 0 when no
     * drift has been observed.
     */
    readonly FailuresSinceDrift: number;
}

export interface BuildDriftTimelineOptions {
    /** Override "now" for relative-time formatting. Defaults to `new Date()`. */
    readonly Now?: Date;
}

/**
 * Build the compact two-point drift timeline for a single selector bucket.
 */
export function buildDriftTimeline(
    bucket: SelectorHistoryBucket | null,
    options: BuildDriftTimelineOptions = {},
): DriftTimeline {
    const now = options.Now ?? new Date();

    if (bucket === null || bucket.Outcomes.length === 0) {
        return {
            State: "no-history",
            LastSuccess: null,
            FirstDrift: null,
            HealthyDurationMs: null,
            FailuresSinceDrift: 0,
        };
    }

    const lastSuccessOutcome = findLastSuccess(bucket.Outcomes);
    const firstDriftOutcome = findFirstDriftAfter(bucket.Outcomes, lastSuccessOutcome);

    const lastSuccess = lastSuccessOutcome !== null ? toPoint(lastSuccessOutcome, now) : null;
    const firstDrift = firstDriftOutcome !== null ? toPoint(firstDriftOutcome, now) : null;

    const state: DriftTimelineState =
        firstDrift === null && lastSuccess !== null ? "healthy"
        : firstDrift !== null && lastSuccess === null ? "always-failing"
        : firstDrift !== null && lastSuccess !== null ? "drifted"
        : "no-history";

    const healthyDurationMs =
        lastSuccessOutcome !== null && firstDriftOutcome !== null
            ? Math.max(0, Date.parse(firstDriftOutcome.At) - Date.parse(lastSuccessOutcome.At))
            : null;

    const failuresSinceDrift =
        firstDriftOutcome === null
            ? 0
            : countFailuresFrom(bucket.Outcomes, firstDriftOutcome.RunId);

    return {
        State: state,
        LastSuccess: lastSuccess,
        FirstDrift: firstDrift,
        HealthyDurationMs: healthyDurationMs,
        FailuresSinceDrift: failuresSinceDrift,
    };
}

/**
 * Format a millisecond delta as a compact human label
 * ("just now", "12m", "3h", "5d", "2w"). Exported for the UI strip and
 * for unit tests.
 */
export function formatRelative(deltaMs: number): string {
    const abs = Math.max(0, deltaMs);
    const sec = Math.floor(abs / 1000);
    if (sec < 45)              return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60)              return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)               return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 14)              return `${day}d ago`;
    const wk = Math.floor(day / 7);
    if (wk < 8)                return `${wk}w ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12)               return `${mo}mo ago`;
    const yr = Math.floor(day / 365);
    return `${yr}y ago`;
}

/**
 * Format a millisecond duration as a compact span label
 * ("4d 2h", "3h 15m", "45s"). Used to render the "healthy for ___" strip.
 */
export function formatDuration(ms: number): string {
    if (ms < 1000)             return "<1s";
    const sec = Math.floor(ms / 1000);
    if (sec < 60)              return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60)              return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) {
        const remMin = min - hr * 60;
        return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
    }
    const day = Math.floor(hr / 24);
    const remHr = hr - day * 24;
    return remHr > 0 ? `${day}d ${remHr}h` : `${day}d`;
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function findLastSuccess(outcomes: ReadonlyArray<SelectorOutcomePoint>): SelectorOutcomePoint | null {
    for (let i = outcomes.length - 1; i >= 0; i--) {
        if (outcomes[i].IsOk) return outcomes[i];
    }
    return null;
}

function findFirstDriftAfter(
    outcomes: ReadonlyArray<SelectorOutcomePoint>,
    lastSuccess: SelectorOutcomePoint | null,
): SelectorOutcomePoint | null {
    if (lastSuccess === null) {
        return outcomes.find((o) => !o.IsOk) ?? null;
    }
    const idx = outcomes.findIndex((o) => o.RunId === lastSuccess.RunId);
    if (idx === -1) return null;
    for (let i = idx + 1; i < outcomes.length; i++) {
        if (!outcomes[i].IsOk) return outcomes[i];
    }
    return null;
}

function countFailuresFrom(
    outcomes: ReadonlyArray<SelectorOutcomePoint>,
    fromRunId: number,
): number {
    const idx = outcomes.findIndex((o) => o.RunId === fromRunId);
    if (idx === -1) return 0;
    let n = 0;
    for (let i = idx; i < outcomes.length; i++) {
        if (!outcomes[i].IsOk) n += 1;
    }
    return n;
}

function toPoint(outcome: SelectorOutcomePoint, now: Date): DriftTimelinePoint {
    const delta = now.getTime() - Date.parse(outcome.At);
    return {
        RunId: outcome.RunId,
        At: outcome.At,
        RelativeLabel: formatRelative(delta),
        Error: outcome.IsOk ? null : outcome.Error,
    };
}
