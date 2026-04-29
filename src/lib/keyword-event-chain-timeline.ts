/**
 * Marco Extension — Keyword Event Chain Timeline
 *
 * Pure, framework-free state machine for the live progress log shown
 * while {@link runKeywordEventChain} executes. Each call to a reducer
 * returns a new immutable {@link TimelineState}; React components render
 * the entries directly.
 *
 * Entry kinds mirror the chain runner's lifecycle hooks:
 *   - `EventStart` / `EventEnd` — bookend an event
 *   - `Step`                    — one step within the active event
 *   - `Pause`                   — synthetic marker emitted between events
 *   - `ChainEnd`                — terminal marker (completed or aborted)
 *
 * Timestamps are millisecond offsets from the chain's start, so the log
 * stays meaningful regardless of wall-clock drift.
 */

import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";
import type { PlaybackResult } from "./keyword-event-playback";

export type TimelineEntry =
    | {
        readonly Kind: "EventStart";
        readonly Id: string;
        readonly AtMs: number;
        readonly EventId: string;
        readonly Keyword: string;
        readonly Index: number;
        readonly Total: number;
    }
    | {
        readonly Kind: "Step";
        readonly Id: string;
        readonly AtMs: number;
        readonly EventId: string;
        readonly StepIndex: number;
        readonly Label: string;
    }
    | {
        readonly Kind: "EventEnd";
        readonly Id: string;
        readonly AtMs: number;
        readonly EventId: string;
        readonly Keyword: string;
        readonly Completed: boolean;
        readonly Aborted: boolean;
    }
    | {
        readonly Kind: "ChainEnd";
        readonly Id: string;
        readonly AtMs: number;
        readonly Completed: number;
        readonly Attempted: number;
        readonly Aborted: boolean;
    };

export interface TimelineState {
    readonly StartedAtMs: number | null;
    readonly Entries: readonly TimelineEntry[];
}

export const EMPTY_TIMELINE: TimelineState = { StartedAtMs: null, Entries: [] };

/** Cap so a runaway chain can't grow the log forever. */
export const MAX_TIMELINE_ENTRIES = 500;

let entryCounter = 0;
const nextEntryId = (): string => {
    entryCounter += 1;
    return `tl_${entryCounter.toString(36)}`;
};

function append(state: TimelineState, entry: TimelineEntry): TimelineState {
    const next = state.Entries.length >= MAX_TIMELINE_ENTRIES
        ? [...state.Entries.slice(state.Entries.length - MAX_TIMELINE_ENTRIES + 1), entry]
        : [...state.Entries, entry];
    return { StartedAtMs: state.StartedAtMs, Entries: next };
}

export function startTimeline(now: number = Date.now()): TimelineState {
    return { StartedAtMs: now, Entries: [] };
}

function offsetMs(state: TimelineState, now: number): number {
    if (state.StartedAtMs === null) { return 0; }
    const delta = now - state.StartedAtMs;
    return delta < 0 ? 0 : delta;
}

export function recordEventStart(
    state: TimelineState,
    event: KeywordEvent,
    index: number,
    total: number,
    now: number = Date.now(),
): TimelineState {
    return append(state, {
        Kind: "EventStart",
        Id: nextEntryId(),
        AtMs: offsetMs(state, now),
        EventId: event.Id,
        Keyword: event.Keyword,
        Index: index,
        Total: total,
    });
}

export function describeStep(step: KeywordEventStep): string {
    if (step.Kind === "Key") {
        const combo = step.Combo.trim();
        return combo.length === 0 ? "Key (empty)" : `Key ${combo}`;
    }
    return `Wait ${step.DurationMs}ms`;
}

export function recordStep(
    state: TimelineState,
    event: KeywordEvent,
    step: KeywordEventStep,
    stepIndex: number,
    now: number = Date.now(),
): TimelineState {
    return append(state, {
        Kind: "Step",
        Id: nextEntryId(),
        AtMs: offsetMs(state, now),
        EventId: event.Id,
        StepIndex: stepIndex,
        Label: describeStep(step),
    });
}

export function recordEventEnd(
    state: TimelineState,
    event: KeywordEvent,
    result: PlaybackResult,
    now: number = Date.now(),
): TimelineState {
    return append(state, {
        Kind: "EventEnd",
        Id: nextEntryId(),
        AtMs: offsetMs(state, now),
        EventId: event.Id,
        Keyword: event.Keyword,
        Completed: result.Completed,
        Aborted: result.Aborted,
    });
}

export function recordChainEnd(
    state: TimelineState,
    summary: { readonly Completed: number; readonly Attempted: number; readonly Aborted: boolean },
    now: number = Date.now(),
): TimelineState {
    return append(state, {
        Kind: "ChainEnd",
        Id: nextEntryId(),
        AtMs: offsetMs(state, now),
        Completed: summary.Completed,
        Attempted: summary.Attempted,
        Aborted: summary.Aborted,
    });
}

/** Test-only helper — resets the monotonic id counter. */
export function __resetTimelineIdsForTests(): void { entryCounter = 0; }
