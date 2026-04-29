/**
 * Marco Extension — Selector Replay Trace (pure helpers)
 *
 * Derives the step-by-step evaluation order of a {@link FailureReport}'s
 * `Selectors` array, classifying each entry as it would have been seen
 * by the live replay loop:
 *
 *   - `pending`   — never evaluated (a previous attempt already matched).
 *   - `matched`   — this attempt resolved to ≥1 element; loop stopped here.
 *   - `missed`    — evaluated and did not match; loop continued.
 *   - `errored`   — evaluated but threw a syntax/runtime error.
 *
 * Pure: no DOM, no chrome.*, no async. Single source of truth shared by
 * the React panel and its tests.
 *
 * Conformance: mem://standards/verbose-logging-and-failure-diagnostics —
 * surfaces the exact evaluation order (primary then fallbacks) that the
 * resolver actually walked, so a human can replay the resolver's reasoning.
 */

import type { SelectorAttempt } from "@/background/recorder/failure-logger";

export type TraceStepStatus = "matched" | "missed" | "errored" | "pending";

export interface TraceStep {
    readonly Order: number;                  // 1-based position in the walk.
    readonly Role: "Primary" | "Fallback";
    readonly Strategy: string;
    readonly Expression: string;
    readonly ResolvedExpression: string;
    readonly Matched: boolean;
    readonly MatchCount: number;
    readonly Status: TraceStepStatus;
    readonly FailureReason: SelectorAttempt["FailureReason"];
    readonly FailureDetail: string | null;
    readonly Note: string;                    // Human sentence for the row.
}

export interface ReplayTraceSummary {
    readonly Total: number;
    readonly Evaluated: number;
    readonly Skipped: number;
    readonly StoppedAt: number | null;        // 1-based Order of the matched step.
    readonly Outcome: "matched" | "exhausted" | "empty";
}

export interface ReplayTrace {
    readonly Steps: ReadonlyArray<TraceStep>;
    readonly Summary: ReplayTraceSummary;
}

const ERRORED_REASONS: ReadonlySet<SelectorAttempt["FailureReason"]> = new Set([
    "XPathSyntaxError",
    "CssSyntaxError",
    "UnresolvedAnchor",
    "EmptyExpression",
    "EvaluationThrew",
]);

function classify(attempt: SelectorAttempt, stopped: boolean): TraceStepStatus {
    if (stopped) return "pending";
    if (attempt.Matched) return "matched";
    if (ERRORED_REASONS.has(attempt.FailureReason)) return "errored";
    return "missed";
}

function noteFor(attempt: SelectorAttempt, status: TraceStepStatus, role: "Primary" | "Fallback"): string {
    switch (status) {
        case "matched":
            return `${role} resolved → ${attempt.MatchCount} match${attempt.MatchCount === 1 ? "" : "es"}; replay stopped here.`;
        case "errored":
            return `${role} threw ${attempt.FailureReason}${attempt.FailureDetail !== null ? ` — ${attempt.FailureDetail}` : ""}.`;
        case "missed":
            return `${role} returned 0 matches; advancing to next candidate.`;
        case "pending":
            return `${role} not evaluated — earlier attempt already matched.`;
    }
}

/**
 * Walk the attempts array in declared order (resolver guarantees primary
 * first, then fallbacks) and produce a per-step trace mirroring what the
 * live replay loop actually executed.
 */
export function buildReplayTrace(attempts: ReadonlyArray<SelectorAttempt>): ReplayTrace {
    if (attempts.length === 0) {
        return {
            Steps: [],
            Summary: { Total: 0, Evaluated: 0, Skipped: 0, StoppedAt: null, Outcome: "empty" },
        };
    }

    const steps: TraceStep[] = [];
    let stoppedAt: number | null = null;
    let evaluated = 0;

    for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i];
        const stopped = stoppedAt !== null;
        const status = classify(a, stopped);
        const role: "Primary" | "Fallback" = a.IsPrimary ? "Primary" : "Fallback";
        if (!stopped) {
            evaluated++;
            if (status === "matched") stoppedAt = i + 1;
        }
        steps.push({
            Order: i + 1,
            Role: role,
            Strategy: a.Strategy,
            Expression: a.Expression,
            ResolvedExpression: a.ResolvedExpression.length > 0 ? a.ResolvedExpression : a.Expression,
            Matched: a.Matched,
            MatchCount: a.MatchCount,
            Status: status,
            FailureReason: a.FailureReason,
            FailureDetail: a.FailureDetail,
            Note: noteFor(a, status, role),
        });
    }

    return {
        Steps: steps,
        Summary: {
            Total: attempts.length,
            Evaluated: evaluated,
            Skipped: attempts.length - evaluated,
            StoppedAt: stoppedAt,
            Outcome: stoppedAt !== null ? "matched" : "exhausted",
        },
    };
}
