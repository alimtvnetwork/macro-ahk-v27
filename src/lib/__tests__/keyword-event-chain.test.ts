/**
 * Marco Extension — keyword-event-chain tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DEFAULT_CHAIN_SETTINGS,
    __resetChainSettingsForTests,
    loadChainSettings,
    runKeywordEventChain,
    saveChainSettings,
    type ChainRunOptions,
} from "@/lib/keyword-event-chain";
import type { PlaybackResult } from "@/lib/keyword-event-playback";
import type { KeywordEvent } from "@/hooks/use-keyword-events";

const STORAGE_KEY = "marco-keyword-event-chain-v1";

function mkEvent(id: string, enabled = true): KeywordEvent {
    return {
        Id: id,
        Keyword: id,
        Description: "",
        Enabled: enabled,
        Steps: [{ Kind: "Wait", Id: `${id}-s1`, DurationMs: 0 }],
    };
}

function mkResult(over: Partial<PlaybackResult> = {}): PlaybackResult {
    return { Completed: true, StepsRun: 1, Aborted: false, ...over };
}

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

describe("chain settings", () => {
    beforeEach(() => { __resetChainSettingsForTests(); });
    afterEach(() => { __resetChainSettingsForTests(); });

    it("returns defaults when nothing is stored", () => {
        expect(loadChainSettings()).toEqual(DEFAULT_CHAIN_SETTINGS);
    });

    it("round-trips saved settings", () => {
        saveChainSettings({ Enabled: true, PauseMs: 750, RunAfterRecording: false });
        expect(loadChainSettings()).toEqual({ Enabled: true, PauseMs: 750, RunAfterRecording: false });
    });

    it("clamps PauseMs to [0, 60000]", () => {
        saveChainSettings({ Enabled: true, PauseMs: -100, RunAfterRecording: false });
        expect(loadChainSettings().PauseMs).toBe(0);
        saveChainSettings({ Enabled: true, PauseMs: 999_999, RunAfterRecording: false });
        expect(loadChainSettings().PauseMs).toBe(60_000);
    });

    it("falls back to defaults on malformed JSON", () => {
        window.localStorage.setItem(STORAGE_KEY, "{not-json");
        expect(loadChainSettings()).toEqual(DEFAULT_CHAIN_SETTINGS);
    });

    it("ignores entries with the wrong shape", () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ Enabled: "yes", PauseMs: "soon" }));
        const r = loadChainSettings();
        expect(r.Enabled).toBe(false);
        expect(r.PauseMs).toBe(DEFAULT_CHAIN_SETTINGS.PauseMs);
    });
});

/* ------------------------------------------------------------------ */
/*  Chain runner                                                       */
/* ------------------------------------------------------------------ */

describe("runKeywordEventChain", () => {
    afterEach(() => { vi.useRealTimers(); });

    it("runs every enabled event once, in order", async () => {
        const order: string[] = [];
        const runner = vi.fn(async (ev: KeywordEvent): Promise<PlaybackResult> => {
            order.push(ev.Id);
            return mkResult();
        });
        const r = await runKeywordEventChain(
            [mkEvent("a"), mkEvent("b"), mkEvent("c")],
            { pauseMs: 0, runner } satisfies ChainRunOptions,
        );
        expect(order).toEqual(["a", "b", "c"]);
        expect(r.EventsAttempted).toBe(3);
        expect(r.EventsCompleted).toBe(3);
        expect(r.Aborted).toBe(false);
    });

    it("skips disabled events without counting them", async () => {
        const order: string[] = [];
        const runner = vi.fn(async (ev: KeywordEvent): Promise<PlaybackResult> => {
            order.push(ev.Id); return mkResult();
        });
        const r = await runKeywordEventChain(
            [mkEvent("a"), mkEvent("b", false), mkEvent("c")],
            { pauseMs: 0, runner },
        );
        expect(order).toEqual(["a", "c"]);
        expect(r.EventsAttempted).toBe(2);
    });

    it("inserts the configured pause *between* events (not before the first or after the last)", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const promise = runKeywordEventChain(
            [mkEvent("a"), mkEvent("b"), mkEvent("c")],
            { pauseMs: 500, runner },
        );

        // Drain microtasks so the first event resolves and we're parked in pause #1.
        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(1);

        // First pause (between a and b)
        await vi.advanceTimersByTimeAsync(500);
        expect(runner).toHaveBeenCalledTimes(2);

        // Second pause (between b and c)
        await vi.advanceTimersByTimeAsync(500);
        expect(runner).toHaveBeenCalledTimes(3);

        const r = await promise;
        expect(r.EventsCompleted).toBe(3);
    });

    it("aborts mid-chain when the signal fires during a pause", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const ctrl = new AbortController();
        const promise = runKeywordEventChain(
            [mkEvent("a"), mkEvent("b"), mkEvent("c")],
            { pauseMs: 1000, runner, signal: ctrl.signal },
        );
        await vi.advanceTimersByTimeAsync(0);
        // Fire abort while parked in the first inter-event pause.
        ctrl.abort();
        await vi.advanceTimersByTimeAsync(0);
        const r = await promise;
        expect(r.Aborted).toBe(true);
        expect(runner).toHaveBeenCalledTimes(1);
    });

    it("stops the chain when an event reports Aborted=true", async () => {
        const runner = vi.fn()
            .mockResolvedValueOnce(mkResult())
            .mockResolvedValueOnce(mkResult({ Completed: false, Aborted: true }))
            .mockResolvedValueOnce(mkResult());
        const r = await runKeywordEventChain(
            [mkEvent("a"), mkEvent("b"), mkEvent("c")],
            { pauseMs: 0, runner: runner as ChainRunOptions["runner"] },
        );
        expect(runner).toHaveBeenCalledTimes(2);
        expect(r.EventsAttempted).toBe(2);
        expect(r.EventsCompleted).toBe(1);
        expect(r.Aborted).toBe(true);
    });

    it("invokes onEventStart / onEventEnd callbacks per event", async () => {
        const start = vi.fn();
        const end = vi.fn();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        await runKeywordEventChain(
            [mkEvent("a"), mkEvent("b")],
            { pauseMs: 0, runner, onEventStart: start, onEventEnd: end },
        );
        expect(start).toHaveBeenCalledTimes(2);
        expect(end).toHaveBeenCalledTimes(2);
        expect(start.mock.calls[0][1]).toBe(0);
        expect(start.mock.calls[1][1]).toBe(1);
    });

    it("returns zeros when the input list is empty", async () => {
        const runner = vi.fn();
        const r = await runKeywordEventChain([], { pauseMs: 0, runner: runner as ChainRunOptions["runner"] });
        expect(r.EventsAttempted).toBe(0);
        expect(r.EventsCompleted).toBe(0);
        expect(r.Aborted).toBe(false);
        expect(runner).not.toHaveBeenCalled();
    });
});

/* ------------------------------------------------------------------ */
/*  Per-event PauseAfterMs override                                    */
/* ------------------------------------------------------------------ */

describe("runKeywordEventChain — per-event PauseAfterMs override", () => {
    it("uses the per-event override instead of the global pause", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const events: KeywordEvent[] = [
            { ...mkEvent("a"), PauseAfterMs: 100 },
            mkEvent("b"),
        ];
        const promise = runKeywordEventChain(events, { pauseMs: 5_000, runner });

        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(1);

        // Just past the override (100ms) — second event must fire,
        // proving we did NOT wait the 5_000 global pause.
        await vi.advanceTimersByTimeAsync(101);
        expect(runner).toHaveBeenCalledTimes(2);

        await promise;
        vi.useRealTimers();
    });

    it("falls back to the global pause when the override is undefined", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const promise = runKeywordEventChain(
            [mkEvent("a"), mkEvent("b")],
            { pauseMs: 200, runner },
        );

        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(150);
        expect(runner).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60);
        expect(runner).toHaveBeenCalledTimes(2);

        await promise;
        vi.useRealTimers();
    });

    it("treats an override of 0 as 'no pause'", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const events: KeywordEvent[] = [
            { ...mkEvent("a"), PauseAfterMs: 0 },
            mkEvent("b"),
        ];
        const promise = runKeywordEventChain(events, { pauseMs: 10_000, runner });
        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(2);
        await promise;
        vi.useRealTimers();
    });

    it("clamps an over-large override to the runner's max (60_000)", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const events: KeywordEvent[] = [
            { ...mkEvent("a"), PauseAfterMs: 9_999_999 },
            mkEvent("b"),
        ];
        const promise = runKeywordEventChain(events, { pauseMs: 0, runner });
        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60_001);
        expect(runner).toHaveBeenCalledTimes(2);
        await promise;
        vi.useRealTimers();
    });

    it("ignores negative / non-finite overrides and uses the global pause", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const events: KeywordEvent[] = [
            { ...mkEvent("a"), PauseAfterMs: -50 },
            { ...mkEvent("b"), PauseAfterMs: Number.NaN },
            mkEvent("c"),
        ];
        const promise = runKeywordEventChain(events, { pauseMs: 100, runner });

        await vi.advanceTimersByTimeAsync(0);
        expect(runner).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(101);
        expect(runner).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(101);
        expect(runner).toHaveBeenCalledTimes(3);

        await promise;
        vi.useRealTimers();
    });

    it("does not pause after the final event regardless of override", async () => {
        vi.useFakeTimers();
        const runner = vi.fn(async (): Promise<PlaybackResult> => mkResult());
        const events: KeywordEvent[] = [
            mkEvent("a"),
            { ...mkEvent("b"), PauseAfterMs: 30_000 },
        ];
        const promise = runKeywordEventChain(events, { pauseMs: 0, runner });
        await vi.advanceTimersByTimeAsync(0);
        const r = await promise;
        expect(r.EventsCompleted).toBe(2);
        expect(vi.getTimerCount()).toBe(0);
        vi.useRealTimers();
    });
});

