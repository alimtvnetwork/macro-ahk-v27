/**
 * Marco Extension — Keyword Event Chain Settings + Runner
 *
 * Two opt-in capabilities layered on top of the existing
 * {@link runKeywordEvent} engine:
 *
 *   1. **Chain settings** — a tiny localStorage-backed store holding
 *      `{ Enabled, PauseMs }`. When `Enabled === true`, the recorder
 *      playback surface chains every enabled {@link KeywordEvent}
 *      sequentially after each recorded action sequence completes.
 *      `PauseMs` is the inter-event delay (clamped to a sane range) and
 *      defaults to 250ms.
 *
 *   2. **`runKeywordEventChain`** — sequential runner that walks a
 *      list of events, calling `runKeywordEvent` on each enabled one
 *      and pausing `PauseMs` between them. Honors {@link AbortSignal}
 *      both *between* events and via the underlying playback engine,
 *      so the recorder's Stop button cancels the chain mid-flight.
 *
 * Pure module — no React imports — so it can be unit-tested directly.
 */

import { runKeywordEvent, type PlaybackResult } from "./keyword-event-playback";
import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";

/* ------------------------------------------------------------------ */
/*  Settings store                                                     */
/* ------------------------------------------------------------------ */

export interface KeywordEventChainSettings {
    /** Master switch — when false, the recorder never auto-chains. */
    readonly Enabled: boolean;
    /** Pause inserted *between* successive events (clamped 0–60000). */
    readonly PauseMs: number;
    /**
     * When true, the chain auto-runs immediately after the recorder
     * finishes a session (transition from `Recording`/`Paused` to Idle).
     * Independent from `Enabled` so users can manually run the chain
     * without arming the post-recording hook, and vice-versa. Defaults
     * to `false` so existing setups don't surprise users with a chain
     * firing the first time they stop a recording.
     */
    readonly RunAfterRecording: boolean;
}

export const DEFAULT_CHAIN_SETTINGS: KeywordEventChainSettings = {
    Enabled: false,
    PauseMs: 250,
    RunAfterRecording: false,
};

const STORAGE_KEY = "marco-keyword-event-chain-v1";
const PAUSE_MIN = 0;
const PAUSE_MAX = 60_000;

function clampPause(n: unknown): number {
    if (typeof n !== "number" || !Number.isFinite(n)) { return DEFAULT_CHAIN_SETTINGS.PauseMs; }
    if (n < PAUSE_MIN) { return PAUSE_MIN; }
    if (n > PAUSE_MAX) { return PAUSE_MAX; }
    return Math.round(n);
}

function isSettings(v: unknown): v is { Enabled: unknown; PauseMs: unknown; RunAfterRecording: unknown } {
    return v !== null && typeof v === "object";
}

export function loadChainSettings(): KeywordEventChainSettings {
    if (typeof window === "undefined") { return DEFAULT_CHAIN_SETTINGS; }
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { return DEFAULT_CHAIN_SETTINGS; }
    if (raw === null) { return DEFAULT_CHAIN_SETTINGS; }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isSettings(parsed)) { return DEFAULT_CHAIN_SETTINGS; }
        return {
            Enabled: typeof parsed.Enabled === "boolean" ? parsed.Enabled : DEFAULT_CHAIN_SETTINGS.Enabled,
            PauseMs: clampPause(parsed.PauseMs),
            RunAfterRecording: typeof parsed.RunAfterRecording === "boolean"
                ? parsed.RunAfterRecording
                : DEFAULT_CHAIN_SETTINGS.RunAfterRecording,
        };
    } catch {
        return DEFAULT_CHAIN_SETTINGS;
    }
}

export function saveChainSettings(next: KeywordEventChainSettings): void {
    if (typeof window === "undefined") { return; }
    const safe: KeywordEventChainSettings = {
        Enabled: Boolean(next.Enabled),
        PauseMs: clampPause(next.PauseMs),
        RunAfterRecording: Boolean(next.RunAfterRecording),
    };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch { /* ignore */ }
}

/** Test-only helper. Safe in production. */
export function __resetChainSettingsForTests(): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Chain runner                                                       */
/* ------------------------------------------------------------------ */

export interface ChainRunOptions {
    /** Inter-event pause in ms. Defaults to {@link DEFAULT_CHAIN_SETTINGS.PauseMs}. */
    readonly pauseMs?: number;
    /** Optional target forwarded to each event's playback. */
    readonly target?: EventTarget | null;
    /** Cancels the chain — both the active event and any pending pause. */
    readonly signal?: AbortSignal;
    /** Lifecycle: fired before each event starts. */
    readonly onEventStart?: (event: KeywordEvent, index: number) => void;
    /** Lifecycle: fired after each event resolves with its result. */
    readonly onEventEnd?: (event: KeywordEvent, index: number, result: PlaybackResult) => void;
    /** Per-step progress, forwarded to {@link runKeywordEvent}. */
    readonly onStep?: (step: KeywordEventStep, stepIndex: number, event: KeywordEvent) => void;
    /**
     * Indirection seam for tests. Defaults to {@link runKeywordEvent}; tests
     * can pass a stub to avoid touching the DOM.
     */
    readonly runner?: typeof runKeywordEvent;
}

export interface ChainRunResult {
    /** Number of events that ran (regardless of completion). */
    readonly EventsAttempted: number;
    /** Number of events that completed (`Completed === true`). */
    readonly EventsCompleted: number;
    /** True iff aborted before all events ran to completion. */
    readonly Aborted: boolean;
    /** Per-event result tuple in execution order. */
    readonly Results: ReadonlyArray<{ readonly EventId: string; readonly Result: PlaybackResult }>;
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (ms <= 0) { resolve(); return; }
        if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const t = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = (): void => {
            clearTimeout(t);
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * Run an ordered list of events sequentially, pausing `pauseMs` between
 * them. Disabled events (`Enabled === false`) are skipped silently — they
 * count toward neither attempted nor completed.
 */
export async function runKeywordEventChain(
    events: ReadonlyArray<KeywordEvent>,
    options: ChainRunOptions = {},
): Promise<ChainRunResult> {
    const pauseMs = clampPause(options.pauseMs ?? DEFAULT_CHAIN_SETTINGS.PauseMs);
    const runner = options.runner ?? runKeywordEvent;
    const results: { EventId: string; Result: PlaybackResult }[] = [];
    let attempted = 0;
    let completed = 0;
    let aborted = false;

    const enabled = events.filter((e) => e.Enabled);

    for (let i = 0; i < enabled.length; i += 1) {
        if (options.signal?.aborted) { aborted = true; break; }
        const ev = enabled[i];
        options.onEventStart?.(ev, i);
        attempted += 1;
        const result = await runner(ev, {
            target: options.target ?? undefined,
            signal: options.signal,
            onStep: options.onStep === undefined
                ? undefined
                : (step, stepIndex) => { options.onStep?.(step, stepIndex, ev); },
        });
        results.push({ EventId: ev.Id, Result: result });
        options.onEventEnd?.(ev, i, result);
        if (result.Completed) { completed += 1; }
        if (result.Aborted) { aborted = true; break; }

        const isLast = i === enabled.length - 1;
        if (!isLast) {
            // Per-event override wins over the global pause when set to a
            // finite, non-negative number. Clamped to the same range as the
            // global setting so a corrupt value can't hang playback.
            const override = ev.PauseAfterMs;
            const effective = (typeof override === "number" && Number.isFinite(override) && override >= 0)
                ? clampPause(override)
                : pauseMs;
            if (effective > 0) {
                try { await pause(effective, options.signal); }
                catch { aborted = true; break; }
            }
        }
    }

    return { EventsAttempted: attempted, EventsCompleted: completed, Aborted: aborted, Results: results };
}
