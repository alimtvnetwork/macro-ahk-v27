/**
 * Lifecycle integration tests for FloatingController.
 *
 * Covers behaviors added when the controller was wired to the recording
 * lifecycle:
 *   • Idle phase disables Pause + Stop, shows Play, dispatches onStart
 *   • Mini → Compact auto-promotion when recording starts
 *   • Returns to user's prior mode when recording stops
 *   • Stop is disabled (and not armable) while Idle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FloatingController } from "../FloatingController";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";

function buildSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
    return {
        SessionId: "sess-1",
        ProjectSlug: "demo",
        StartedAt: new Date("2026-04-27T10:00:00.000Z").toISOString(),
        Phase: "Recording",
        Steps: [],
        ...overrides,
    };
}

const IDLE: RecordingSession = {
    SessionId: "",
    ProjectSlug: "demo",
    StartedAt: "",
    Phase: "Idle",
    Steps: [],
};

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); });

describe("FloatingController — lifecycle wiring", () => {
    it("Idle: Pause/Stop disabled, primary becomes Play and calls onStart", () => {
        const onStart = vi.fn();
        render(
            <FloatingController
                session={IDLE}
                onStart={onStart}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        const primary = screen.getByTestId("controller-primary");
        const stop = screen.getByTestId("controller-stop");
        expect(primary.getAttribute("aria-label")).toBe("Start recording");
        expect((primary as HTMLButtonElement).disabled).toBe(false);
        expect((stop as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(primary);
        expect(onStart).toHaveBeenCalledOnce();
    });

    it("Idle without onStart: primary is disabled", () => {
        render(
            <FloatingController
                session={IDLE}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        expect((screen.getByTestId("controller-primary") as HTMLButtonElement).disabled).toBe(true);
    });

    it("Idle in mini mode: Stop button is disabled and clicks do not arm it", () => {
        const onStop = vi.fn();
        render(
            <FloatingController
                session={IDLE}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={onStop}
                initialMode="mini"
            />,
        );
        const stop = screen.getByTestId("controller-stop") as HTMLButtonElement;
        expect(stop.disabled).toBe(true);
        fireEvent.click(stop);
        expect(stop.getAttribute("data-armed")).toBe("false");
        expect(onStop).not.toHaveBeenCalled();
    });

    it("auto-promotes mini → compact when phase transitions Idle → Recording", () => {
        const { rerender } = render(
            <FloatingController
                session={IDLE}
                onStart={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        expect(screen.getByTestId("floating-controller-mini")).toBeTruthy();
        rerender(
            <FloatingController
                session={buildSession({ Phase: "Recording" })}
                onStart={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        expect(screen.getByTestId("floating-controller-compact")).toBeTruthy();
    });

    it("returns to mini after Stop when it was auto-promoted", () => {
        const { rerender } = render(
            <FloatingController
                session={IDLE}
                onStart={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        rerender(
            <FloatingController
                session={buildSession({ Phase: "Recording" })}
                onStart={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        expect(screen.getByTestId("floating-controller-compact")).toBeTruthy();
        rerender(
            <FloatingController
                session={IDLE}
                onStart={vi.fn()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        expect(screen.getByTestId("floating-controller-mini")).toBeTruthy();
    });
});
