/**
 * selector-history unit tests.
 */

import { describe, it, expect } from "vitest";
import {
    buildSelectorHistory,
    findHistoryForSelector,
} from "../selector-history";
import type { PersistedReplayStepResult } from "../replay-run-persistence";

let nextId = 1;
function row(
    isOk: boolean,
    at: string,
    resolved: string | null,
    error: string | null = null,
): PersistedReplayStepResult {
    return {
        ReplayStepResultId: nextId++,
        ReplayRunId: nextId,
        StepId: 1,
        OrderIndex: 1,
        IsOk: isOk ? 1 : 0,
        ErrorMessage: error,
        ResolvedXPath: resolved,
        StartedAt: at,
        FinishedAt: at,
        DurationMs: 10,
    };
}

describe("buildSelectorHistory", () => {
    it("groups outcomes by resolved expression and orders chronologically", () => {
        const rows: PersistedReplayStepResult[] = [
            row(true,  "2026-04-20T10:00:00Z", "#go"),
            row(false, "2026-04-22T10:00:00Z", "#go", "Element not found"),
            row(true,  "2026-04-21T10:00:00Z", "#other"),
        ];
        const history = buildSelectorHistory(rows);
        const goBucket = history.find((b) => b.ResolvedExpression === "#go")!;
        expect(goBucket.Outcomes.map((o) => o.At)).toEqual([
            "2026-04-20T10:00:00Z",
            "2026-04-22T10:00:00Z",
        ]);
    });

    it("flags 'regressed' when a selector previously succeeded then failed", () => {
        const rows = [
            row(true,  "2026-04-20T10:00:00Z", "#go"),
            row(true,  "2026-04-21T10:00:00Z", "#go"),
            row(false, "2026-04-22T10:00:00Z", "#go", "Element not found"),
            row(false, "2026-04-23T10:00:00Z", "#go", "Element not found"),
        ];
        const [bucket] = buildSelectorHistory(rows);
        expect(bucket.Status).toBe("regressed");
        expect(bucket.LastSuccessAt).toBe("2026-04-21T10:00:00Z");
        expect(bucket.FirstFailureAfterLastSuccessAt).toBe("2026-04-22T10:00:00Z");
        expect(bucket.ConsecutiveFailures).toBe(2);
        expect(bucket.TotalRuns).toBe(4);
        expect(bucket.TotalFailures).toBe(2);
    });

    it("flags 'healthy' when the latest run succeeded after earlier failures", () => {
        const rows = [
            row(false, "2026-04-20T10:00:00Z", "#go", "x"),
            row(true,  "2026-04-21T10:00:00Z", "#go"),
        ];
        const [bucket] = buildSelectorHistory(rows);
        expect(bucket.Status).toBe("healthy");
        expect(bucket.ConsecutiveFailures).toBe(0);
    });

    it("flags 'always-failing' when no run ever succeeded", () => {
        const rows = [
            row(false, "2026-04-20T10:00:00Z", "#go", "x"),
            row(false, "2026-04-22T10:00:00Z", "#go", "x"),
        ];
        const [bucket] = buildSelectorHistory(rows);
        expect(bucket.Status).toBe("always-failing");
        expect(bucket.LastSuccessAt).toBeNull();
        expect(bucket.FirstFailureAfterLastSuccessAt).toBe("2026-04-20T10:00:00Z");
    });

    it("buckets null ResolvedXPath under the unknown key", () => {
        const rows = [row(false, "2026-04-20T10:00:00Z", null, "x")];
        const [bucket] = buildSelectorHistory(rows);
        expect(bucket.ResolvedExpression).toBeNull();
    });

    it("sorts buckets regressed-first for actionability", () => {
        const rows = [
            // healthy bucket
            row(true,  "2026-04-20T10:00:00Z", "#a"),
            // regressed bucket
            row(true,  "2026-04-20T10:00:00Z", "#b"),
            row(false, "2026-04-21T10:00:00Z", "#b"),
        ];
        const buckets = buildSelectorHistory(rows);
        expect(buckets[0].ResolvedExpression).toBe("#b");
        expect(buckets[0].Status).toBe("regressed");
    });

    it("returns an empty list for no rows", () => {
        expect(buildSelectorHistory([])).toEqual([]);
    });
});

describe("findHistoryForSelector", () => {
    it("matches by resolved expression and returns null on miss", () => {
        const rows = [row(true, "2026-04-20T10:00:00Z", "#go")];
        const history = buildSelectorHistory(rows);
        expect(findHistoryForSelector(history, "#go")?.Status).toBe("healthy");
        expect(findHistoryForSelector(history, "#nope")).toBeNull();
        expect(findHistoryForSelector(history, null)).toBeNull();
    });
});
