/**
 * Tests for `useAutoRunChainAfterRecording` and the pure
 * `shouldAutoRun` helper that drives it.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecordingSession } from "@/background/recorder/recorder-session-types";
import type { KeywordEvent } from "@/hooks/use-keyword-events";
import {
    shouldAutoRun,
    useAutoRunChainAfterRecording,
} from "@/hooks/use-auto-run-chain-after-recording";
import {
    DEFAULT_CHAIN_SETTINGS,
    type ChainRunResult,
    type KeywordEventChainSettings,
} from "@/lib/keyword-event-chain";

const mkSession = (phase: RecordingSession["Phase"]): RecordingSession => ({
    SessionId: "s1",
    ProjectSlug: "p",
    StartedAt: "2026-01-01T00:00:00Z",
    Phase: phase,
    Steps: [],
});

const mkEvent = (id: string, overrides: Partial<KeywordEvent> = {}): KeywordEvent => ({
    Id: id,
    Keyword: id,
    Description: "",
    Enabled: true,
    Steps: [{ Id: `${id}-s1`, Kind: "Wait", DurationMs: 0 }],
    ...overrides,
});

const mkResult = (over: Partial<ChainRunResult> = {}): ChainRunResult => ({
    EventsAttempted: 0,
    EventsCompleted: 0,
    Aborted: false,
    Results: [],
    ...over,
});

afterEach(() => { vi.restoreAllMocks(); });

describe("shouldAutoRun", () => {
    it("fires on Recording → null", () => {
        expect(shouldAutoRun(mkSession("Recording"), null)).toBe(true);
    });
    it("fires on Paused → null", () => {
        expect(shouldAutoRun(mkSession("Paused"), null)).toBe(true);
    });
    it("fires on Recording → Idle", () => {
        expect(shouldAutoRun(mkSession("Recording"), mkSession("Idle"))).toBe(true);
    });
    it("does not fire when there was no previous session", () => {
        expect(shouldAutoRun(null, mkSession("Recording"))).toBe(false);
    });
    it("does not fire on Idle → null (already idle, nothing to react to)", () => {
        expect(shouldAutoRun(mkSession("Idle"), null)).toBe(false);
    });
    it("does not fire on Recording → Paused", () => {
        expect(shouldAutoRun(mkSession("Recording"), mkSession("Paused"))).toBe(false);
    });
    it("does not fire on Paused → Recording (resume)", () => {
        expect(shouldAutoRun(mkSession("Paused"), mkSession("Recording"))).toBe(false);
    });
});

describe("useAutoRunChainAfterRecording", () => {
    function setup(initial: {
        settings?: KeywordEventChainSettings;
        events?: KeywordEvent[];
        session?: RecordingSession | null;
    } = {}) {
        const chainRunner = vi.fn(async (): Promise<ChainRunResult> => mkResult({ EventsCompleted: 1 }));
        const onStart = vi.fn();
        const onEnd = vi.fn();

        type Props = {
            settings: KeywordEventChainSettings;
            events: KeywordEvent[];
            session: RecordingSession | null;
        };
        const initialProps: Props = {
            settings: initial.settings ?? { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: initial.events ?? [mkEvent("a")],
            session: initial.session ?? mkSession("Recording"),
        };
        const { rerender } = renderHook(
            (props: Props) => useAutoRunChainAfterRecording({
                settings: props.settings,
                events: props.events,
                session: props.session,
                chainRunner,
                onAutoRunStart: onStart,
                onAutoRunEnd: onEnd,
            }),
            { initialProps },
        );

        return { rerender, chainRunner, onStart, onEnd };
    }

    it("fires the chain when recording stops and RunAfterRecording is on", async () => {
        const { rerender, chainRunner, onStart } = setup();

        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: null,
        }); });

        expect(chainRunner).toHaveBeenCalledTimes(1);
        expect(onStart).toHaveBeenCalledTimes(1);
    });

    it("does not fire when RunAfterRecording is off", async () => {
        const { rerender, chainRunner } = setup({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: false },
        });

        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: false },
            events: [mkEvent("a")],
            session: null,
        }); });

        expect(chainRunner).not.toHaveBeenCalled();
    });

    it("does not fire when there are no enabled, non-empty events", async () => {
        const { rerender, chainRunner } = setup({
            events: [mkEvent("a", { Enabled: false }), mkEvent("b", { Steps: [] })],
        });

        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a", { Enabled: false }), mkEvent("b", { Steps: [] })],
            session: null,
        }); });

        expect(chainRunner).not.toHaveBeenCalled();
    });

    it("does not fire on Recording → Paused", async () => {
        const { rerender, chainRunner } = setup();
        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: mkSession("Paused"),
        }); });
        expect(chainRunner).not.toHaveBeenCalled();
    });

    it("only fires once per stop transition (idempotent on subsequent rerenders)", async () => {
        const { rerender, chainRunner } = setup();

        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: null,
        }); });
        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: null,
        }); });

        expect(chainRunner).toHaveBeenCalledTimes(1);
    });

    it("forwards the global PauseMs to the chain runner", async () => {
        const { rerender, chainRunner } = setup({
            settings: { Enabled: false, PauseMs: 1234, RunAfterRecording: true },
        });

        await act(async () => { rerender({
            settings: { Enabled: false, PauseMs: 1234, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: null,
        }); });

        expect(chainRunner).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ pauseMs: 1234 }),
        );
    });

    it("invokes onAutoRunEnd with the chain result", async () => {
        const { rerender, onEnd } = setup();

        await act(async () => { rerender({
            settings: { ...DEFAULT_CHAIN_SETTINGS, RunAfterRecording: true },
            events: [mkEvent("a")],
            session: null,
        }); });
        // Allow the chain promise to resolve.
        await act(async () => { await Promise.resolve(); });

        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(onEnd.mock.calls[0][0]).toMatchObject({ EventsCompleted: 1 });
    });
});
