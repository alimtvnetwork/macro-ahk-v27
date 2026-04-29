/**
 * Unit tests — FloatingController (presentational layer).
 *
 * Verifies mode rendering, primary toggle dispatch, two-tap stop safety,
 * and elapsed timer formatting. Storage and the recorder reducer are out
 * of scope here (covered by the use-recording-session test).
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

describe("FloatingController", () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-27T10:00:30.000Z"));
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("compact mode shows Pause when recording and dispatches onPause", () => {
        const onPause = vi.fn();
        render(
            <FloatingController
                session={buildSession()}
                onPause={onPause}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        const primary = screen.getByTestId("controller-primary");
        expect(primary.getAttribute("aria-label")).toBe("Pause recording");
        fireEvent.click(primary);
        expect(onPause).toHaveBeenCalledOnce();
    });

    it("compact mode shows Play when paused and dispatches onResume", () => {
        const onResume = vi.fn();
        render(
            <FloatingController
                session={buildSession({ Phase: "Paused" })}
                onPause={vi.fn()}
                onResume={onResume}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        fireEvent.click(screen.getByTestId("controller-primary"));
        expect(onResume).toHaveBeenCalledOnce();
    });

    it("requires two taps on Stop and only then dispatches onStop", () => {
        const onStop = vi.fn();
        render(
            <FloatingController
                session={buildSession()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={onStop}
                initialMode="compact"
            />,
        );
        const stop = screen.getByTestId("controller-stop");
        fireEvent.click(stop);
        expect(onStop).not.toHaveBeenCalled();
        expect(stop.getAttribute("data-armed")).toBe("true");
        fireEvent.click(stop);
        expect(onStop).toHaveBeenCalledOnce();
    });

    it("renders mini mode with only dot + stop", () => {
        render(
            <FloatingController
                session={buildSession()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="mini"
            />,
        );
        expect(screen.getByTestId("floating-controller-mini")).toBeTruthy();
        expect(screen.queryByTestId("controller-primary")).toBeNull();
        expect(screen.getByTestId("controller-stop")).toBeTruthy();
    });

    it("formats elapsed time from session.StartedAt", () => {
        render(
            <FloatingController
                session={buildSession()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        // 30 seconds elapsed since StartedAt
        expect(screen.getByTestId("controller-elapsed").textContent).toBe("00:30");
    });

    it("renders status chips for stepgroup and subgroup", () => {
        render(
            <FloatingController
                session={buildSession({ Steps: [] })}
                activeStepGroupName="Login Flow"
                activeSubGroupName="Step 1"
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        expect(screen.getByTestId("controller-stepgroup-chip").textContent).toBe("Login Flow");
        expect(screen.getByTestId("controller-subgroup-chip").textContent).toBe("Step 1");
    });

    it("mode switcher cycles compact → expanded and persists choice", () => {
        const { rerender } = render(
            <FloatingController
                session={buildSession()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="compact"
            />,
        );
        fireEvent.click(screen.getByTestId("controller-mode-switch"));
        expect(screen.getByTestId("floating-controller-expanded")).toBeTruthy();
        expect(window.localStorage.getItem("marco-floating-controller-mode")).toBe("expanded");
        rerender(
            <FloatingController
                session={buildSession()}
                onPause={vi.fn()}
                onResume={vi.fn()}
                onStop={vi.fn()}
                initialMode="expanded"
            />,
        );
        // expanded → mini
        fireEvent.click(screen.getByTestId("controller-mode-switch"));
        expect(screen.getByTestId("floating-controller-mini")).toBeTruthy();
    });
});
