/**
 * Tests for useRecorderShortcuts — Ctrl+Alt+P / ; / . chords mapped to
 * Resume / Pause / Stop only while a recording session is active.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRecorderShortcuts } from "../use-recorder-shortcuts";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";

interface ProbeProps {
    readonly session: RecordingSession | null;
    readonly onResume: () => void;
    readonly onPause: () => void;
    readonly onStop: () => void;
}

function Probe(props: ProbeProps): JSX.Element {
    useRecorderShortcuts(props);
    return <div data-testid="probe" />;
}

function buildSession(phase: "Recording" | "Paused"): RecordingSession {
    return {
        SessionId: "s1",
        ProjectSlug: "p",
        StartedAt: new Date().toISOString(),
        Phase: phase,
        Steps: [],
    };
}

function fireChord(key: string, opts: { ctrl?: boolean; alt?: boolean; shift?: boolean; target?: EventTarget } = {}): void {
    const ev = new KeyboardEvent("keydown", {
        key,
        ctrlKey: opts.ctrl ?? true,
        altKey: opts.alt ?? true,
        shiftKey: opts.shift ?? false,
        bubbles: true,
        cancelable: true,
    });
    if (opts.target !== undefined) {
        opts.target.dispatchEvent(ev);
    } else {
        window.dispatchEvent(ev);
    }
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); });

describe("useRecorderShortcuts", () => {
    it("does nothing when there is no session", () => {
        const onResume = vi.fn(); const onPause = vi.fn(); const onStop = vi.fn();
        render(<Probe session={null} onResume={onResume} onPause={onPause} onStop={onStop} />);
        act(() => { fireChord("p"); fireChord(";"); fireChord("."); });
        expect(onResume).not.toHaveBeenCalled();
        expect(onPause).not.toHaveBeenCalled();
        expect(onStop).not.toHaveBeenCalled();
    });

    it("Ctrl+Alt+; pauses while Recording (and P is a no-op)", () => {
        const onResume = vi.fn(); const onPause = vi.fn(); const onStop = vi.fn();
        render(<Probe session={buildSession("Recording")} onResume={onResume} onPause={onPause} onStop={onStop} />);
        act(() => { fireChord(";"); });
        expect(onPause).toHaveBeenCalledOnce();
        act(() => { fireChord("p"); }); // Play has no effect while already Recording
        expect(onResume).not.toHaveBeenCalled();
    });

    it("Ctrl+Alt+P resumes while Paused (and ; is a no-op)", () => {
        const onResume = vi.fn(); const onPause = vi.fn(); const onStop = vi.fn();
        render(<Probe session={buildSession("Paused")} onResume={onResume} onPause={onPause} onStop={onStop} />);
        act(() => { fireChord("p"); });
        expect(onResume).toHaveBeenCalledOnce();
        act(() => { fireChord(";"); });
        expect(onPause).not.toHaveBeenCalled();
    });

    it("Ctrl+Alt+. stops from Recording or Paused", () => {
        const onStop = vi.fn();
        const { rerender } = render(<Probe session={buildSession("Recording")} onResume={vi.fn()} onPause={vi.fn()} onStop={onStop} />);
        act(() => { fireChord("."); });
        expect(onStop).toHaveBeenCalledOnce();
        rerender(<Probe session={buildSession("Paused")} onResume={vi.fn()} onPause={vi.fn()} onStop={onStop} />);
        act(() => { fireChord("."); });
        expect(onStop).toHaveBeenCalledTimes(2);
    });

    it("ignores chord when typing in an input", () => {
        const onPause = vi.fn();
        render(
            <>
                <Probe session={buildSession("Recording")} onResume={vi.fn()} onPause={onPause} onStop={vi.fn()} />
                <input data-testid="typing" />
            </>,
        );
        const input = document.querySelector("[data-testid='typing']") as HTMLInputElement;
        input.focus();
        act(() => { fireChord(";", { target: input }); });
        expect(onPause).not.toHaveBeenCalled();
    });

    it("ignores chord without Ctrl+Alt (plain ';' does nothing)", () => {
        const onPause = vi.fn();
        render(<Probe session={buildSession("Recording")} onResume={vi.fn()} onPause={onPause} onStop={vi.fn()} />);
        act(() => { fireChord(";", { ctrl: false, alt: false }); });
        expect(onPause).not.toHaveBeenCalled();
    });

    it("ignores chord with Shift (Ctrl+Alt+Shift+; does nothing)", () => {
        const onPause = vi.fn();
        render(<Probe session={buildSession("Recording")} onResume={vi.fn()} onPause={onPause} onStop={vi.fn()} />);
        act(() => { fireChord(";", { shift: true }); });
        expect(onPause).not.toHaveBeenCalled();
    });
});
