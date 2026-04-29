/**
 * Marco Extension — Per-Selector Replay History
 *
 * Pure helper that takes a Step's persisted {@link PersistedReplayStepResult}
 * rows and reduces them into per-selector outcome timelines. Lets the UI
 * answer "when did selector X start failing?" without re-running anything.
 *
 * Bucketing rule:
 *   - We bucket by `ResolvedXPath` because that is what the executor
 *     persists per attempt (the resolver collapses the primary selector
 *     chain to a single expression). When `ResolvedXPath` is null the
 *     row falls into the `__unknown__` bucket so the UI can still surface it.
 *   - The original (raw) selector expression is matched against the
 *     bucket key when available so the comparison panel can display
 *     history alongside the matching selector row.
 *
 * Outputs (per bucket):
 *   - `Outcomes`         — chronological list of `{ At, IsOk, RunId, Error }`.
 *   - `LastSuccessAt`    — ISO of the most recent successful run, or null.
 *   - `FirstFailureAfterLastSuccessAt` — ISO of the first failure after the
 *     last success (or first-ever failure when the selector has never
 *     succeeded). This is the "when did it start failing?" answer.
 *   - `ConsecutiveFailures` — count of failures since the last success.
 *   - `Status`           — `"healthy" | "regressed" | "always-failing" | "unknown"`.
 *
 * Pure: no DB, no I/O. The async sister `loadSelectorHistoryForStep` in
 * `replay-run-persistence.ts` is the production caller.
 *
 * @see ./replay-run-persistence.ts — Persists the rows this helper consumes.
 * @see ./selector-comparison.ts    — Live counterpart (current DOM state).
 */

import type { PersistedReplayStepResult } from "./replay-run-persistence";

export interface SelectorOutcomePoint {
    readonly RunId: number;
    readonly At: string;            // ISO timestamp
    readonly IsOk: boolean;
    readonly Error: string | null;
    readonly DurationMs: number;
}

export type SelectorHealth = "healthy" | "regressed" | "always-failing" | "unknown";

export interface SelectorHistoryBucket {
    /** `ResolvedXPath` value, or `null` for the legacy/unknown bucket. */
    readonly ResolvedExpression: string | null;
    readonly Outcomes: ReadonlyArray<SelectorOutcomePoint>;
    readonly LastSuccessAt: string | null;
    readonly FirstFailureAfterLastSuccessAt: string | null;
    readonly ConsecutiveFailures: number;
    readonly TotalRuns: number;
    readonly TotalFailures: number;
    readonly Status: SelectorHealth;
}

const UNKNOWN_KEY = "__unknown__";

/**
 * Group prior per-step results by resolved selector expression and compute
 * the per-bucket health summary.
 *
 * Rows can be passed in any order; the helper sorts by `StartedAt` ASC
 * before reducing so the resulting `Outcomes` array is chronological.
 */
export function buildSelectorHistory(
    results: ReadonlyArray<PersistedReplayStepResult>,
): ReadonlyArray<SelectorHistoryBucket> {
    if (results.length === 0) return [];

    const sorted = [...results].sort((a, b) => a.StartedAt.localeCompare(b.StartedAt));
    const byKey = new Map<string, SelectorOutcomePoint[]>();

    for (const r of sorted) {
        const key = r.ResolvedXPath ?? UNKNOWN_KEY;
        const list = byKey.get(key) ?? [];
        list.push({
            RunId: r.ReplayRunId,
            At: r.StartedAt,
            IsOk: r.IsOk === 1,
            Error: r.ErrorMessage,
            DurationMs: r.DurationMs,
        });
        byKey.set(key, list);
    }

    const buckets: SelectorHistoryBucket[] = [];
    for (const [key, outcomes] of byKey) {
        buckets.push(summarise(key === UNKNOWN_KEY ? null : key, outcomes));
    }

    // Sort: regressed first (most actionable), then always-failing, then healthy, then unknown.
    const order: Record<SelectorHealth, number> = {
        regressed: 0, "always-failing": 1, healthy: 2, unknown: 3,
    };
    buckets.sort((a, b) => order[a.Status] - order[b.Status]);
    return buckets;
}

/**
 * Find the bucket that matches a live selector's resolved expression.
 * Returns `null` when the selector has no historical data — useful for the
 * comparison-panel toggle.
 */
export function findHistoryForSelector(
    history: ReadonlyArray<SelectorHistoryBucket>,
    resolvedExpression: string | null,
): SelectorHistoryBucket | null {
    if (resolvedExpression === null) return null;
    return history.find((b) => b.ResolvedExpression === resolvedExpression) ?? null;
}

function summarise(
    resolved: string | null,
    outcomes: ReadonlyArray<SelectorOutcomePoint>,
): SelectorHistoryBucket {
    let lastSuccessAt: string | null = null;
    let lastSuccessIdx = -1;
    for (let i = outcomes.length - 1; i >= 0; i--) {
        if (outcomes[i].IsOk) { lastSuccessAt = outcomes[i].At; lastSuccessIdx = i; break; }
    }

    let firstFailureAfterLastSuccessAt: string | null = null;
    if (lastSuccessIdx === -1) {
        // Never succeeded — first-ever failure is the regression marker.
        const firstFail = outcomes.find((o) => !o.IsOk);
        firstFailureAfterLastSuccessAt = firstFail?.At ?? null;
    } else {
        for (let i = lastSuccessIdx + 1; i < outcomes.length; i++) {
            if (!outcomes[i].IsOk) {
                firstFailureAfterLastSuccessAt = outcomes[i].At;
                break;
            }
        }
    }

    const totalRuns = outcomes.length;
    const totalFailures = outcomes.filter((o) => !o.IsOk).length;
    const last = outcomes[outcomes.length - 1];

    let consecutiveFailures = 0;
    for (let i = outcomes.length - 1; i >= 0 && !outcomes[i].IsOk; i--) {
        consecutiveFailures += 1;
    }

    let status: SelectorHealth;
    if (resolved === null && totalRuns === 0) status = "unknown";
    else if (totalFailures === 0)              status = "healthy";
    else if (totalFailures === totalRuns)      status = "always-failing";
    else if (last.IsOk)                        status = "healthy";
    else                                       status = "regressed";

    return {
        ResolvedExpression: resolved,
        Outcomes: outcomes,
        LastSuccessAt: lastSuccessAt,
        FirstFailureAfterLastSuccessAt: firstFailureAfterLastSuccessAt,
        ConsecutiveFailures: consecutiveFailures,
        TotalRuns: totalRuns,
        TotalFailures: totalFailures,
        Status: status,
    };
}
