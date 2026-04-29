/**
 * Tests — Drift Timeline (compact)
 */

import { describe, it, expect } from "vitest";
import {
    buildDriftTimeline,
    formatDuration,
    formatRelative,
} from "../drift-timeline";
import type {
    SelectorHistoryBucket,
    SelectorOutcomePoint,
} from "../selector-history";

const T0 = "2026-04-20T10:00:00.000Z";
const T1 = "2026-04-22T10:00:00.000Z";   // +2 days
const T2 = "2026-04-22T10:30:00.000Z";   // +30m after drift
const NOW = new Date("2026-04-22T11:00:00.000Z"); // 1h after T1

const point = (
    runId: number,
    at: string,
    isOk: boolean,
    error: string | null = null,
): SelectorOutcomePoint => ({
    RunId: runId,
    At: at,
    IsOk: isOk,
    Error: error,
    DurationMs: 100,
});

const bucket = (outcomes: SelectorOutcomePoint[]): SelectorHistoryBucket => ({
    ResolvedExpression: "//button[@id='submit']",
    Outcomes: outcomes,
    LastSuccessAt: outcomes.filter((o) => o.IsOk).pop()?.At ?? null,
    FirstFailureAfterLastSuccessAt: null,
    ConsecutiveFailures: 0,
    TotalRuns: outcomes.length,
    TotalFailures: outcomes.filter((o) => !o.IsOk).length,
    Status: "regressed",
});

describe("buildDriftTimeline", () => {
    it("returns no-history when bucket is null", () => {
        const t = buildDriftTimeline(null, { Now: NOW });
        expect(t.State).toBe("no-history");
        expect(t.LastSuccess).toBeNull();
        expect(t.FirstDrift).toBeNull();
        expect(t.HealthyDurationMs).toBeNull();
        expect(t.FailuresSinceDrift).toBe(0);
    });

    it("returns no-history when bucket has zero outcomes", () => {
        const t = buildDriftTimeline(bucket([]), { Now: NOW });
        expect(t.State).toBe("no-history");
    });

    it("returns healthy state when last run is ok and no failures follow", () => {
        const t = buildDriftTimeline(bucket([
            point(1, T0, true),
            point(2, T1, true),
        ]), { Now: NOW });
        expect(t.State).toBe("healthy");
        expect(t.LastSuccess?.RunId).toBe(2);
        expect(t.FirstDrift).toBeNull();
        expect(t.HealthyDurationMs).toBeNull();
    });

    it("identifies drifted state with both points and healthy duration", () => {
        const t = buildDriftTimeline(bucket([
            point(1, T0, true),
            point(2, T1, false, "no element"),
            point(3, T2, false, "no element"),
        ]), { Now: NOW });
        expect(t.State).toBe("drifted");
        expect(t.LastSuccess?.RunId).toBe(1);
        expect(t.LastSuccess?.At).toBe(T0);
        expect(t.FirstDrift?.RunId).toBe(2);
        expect(t.FirstDrift?.At).toBe(T1);
        expect(t.FirstDrift?.Error).toBe("no element");
        expect(t.HealthyDurationMs).toBe(2 * 24 * 60 * 60 * 1000); // 2 days in ms
        expect(t.FailuresSinceDrift).toBe(2);
    });

    it("identifies always-failing when there is no successful run", () => {
        const t = buildDriftTimeline(bucket([
            point(1, T0, false, "boom"),
            point(2, T1, false, "boom"),
        ]), { Now: NOW });
        expect(t.State).toBe("always-failing");
        expect(t.LastSuccess).toBeNull();
        expect(t.FirstDrift?.RunId).toBe(1);
        expect(t.HealthyDurationMs).toBeNull();
        expect(t.FailuresSinceDrift).toBe(2);
    });

    it("ignores failures that occurred BEFORE the last success", () => {
        const t = buildDriftTimeline(bucket([
            point(1, T0, false, "blip"),
            point(2, T1, true),
            point(3, T2, true),
        ]), { Now: NOW });
        expect(t.State).toBe("healthy");
        expect(t.LastSuccess?.RunId).toBe(3);
        expect(t.FirstDrift).toBeNull();
    });

    it("uses injected Now to format relative labels deterministically", () => {
        const t = buildDriftTimeline(bucket([
            point(1, T0, true),
            point(2, T1, false, "x"),
        ]), { Now: NOW });
        // T1 is 1h before NOW.
        expect(t.FirstDrift?.RelativeLabel).toBe("1h ago");
        // T0 is 2 days + 1h before NOW → 2d.
        expect(t.LastSuccess?.RelativeLabel).toBe("2d ago");
    });
});

describe("formatRelative", () => {
    it("rounds short deltas to 'just now'", () => {
        expect(formatRelative(0)).toBe("just now");
        expect(formatRelative(40_000)).toBe("just now");
    });
    it("formats minutes/hours/days/weeks/months/years", () => {
        expect(formatRelative(2 * 60_000)).toBe("2m ago");
        expect(formatRelative(3 * 3_600_000)).toBe("3h ago");
        expect(formatRelative(5 * 86_400_000)).toBe("5d ago");
        expect(formatRelative(3 * 7 * 86_400_000)).toBe("3w ago");
        expect(formatRelative(60 * 86_400_000)).toBe("2mo ago");
        expect(formatRelative(400 * 86_400_000)).toBe("1y ago");
    });
});

describe("formatDuration", () => {
    it("renders compact spans", () => {
        expect(formatDuration(500)).toBe("<1s");
        expect(formatDuration(45_000)).toBe("45s");
        expect(formatDuration(5 * 60_000)).toBe("5m");
        expect(formatDuration(3 * 3_600_000 + 15 * 60_000)).toBe("3h 15m");
        expect(formatDuration(3 * 3_600_000)).toBe("3h");
        expect(formatDuration(4 * 86_400_000 + 2 * 3_600_000)).toBe("4d 2h");
        expect(formatDuration(4 * 86_400_000)).toBe("4d");
    });
});
