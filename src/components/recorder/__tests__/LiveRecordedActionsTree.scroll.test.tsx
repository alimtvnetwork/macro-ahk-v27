/**
 * Marco Extension — LiveRecordedActionsTree selection scroll tests
 *
 * Verifies that selecting a step (either via internal click or via the
 * controlled `selectedStepId` prop) calls `scrollIntoView` on the matching
 * row so the Options page can drive the live tree to reveal the active row.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { LiveRecordedActionsTree } from "@/components/recorder/LiveRecordedActionsTree";
import {
    __resetRecorderSessionSyncForTests,
    writeSession,
} from "@/lib/recorder-session-sync";
import type {
    RecordedStep,
    RecordingSession,
} from "@/background/recorder/recorder-session-types";

function makeStep(stepId: string, index: number): RecordedStep {
    return {
        StepId: stepId,
        Index: index,
        Kind: "Click",
        Label: `Step ${index}`,
        VariableName: `var${index}`,
        Selector: {
            XPathFull: "/html/body",
            XPathRelative: null,
            AnchorStepId: null,
            Strategy: "Positional",
        },
        CapturedAt: "2026-04-27T00:00:00.000Z",
    };
}

function makeSession(steps: ReadonlyArray<RecordedStep>): RecordingSession {
    return {
        SessionId: "sess-scroll-1",
        ProjectSlug: "proj",
        StartedAt: "2026-04-27T00:00:00.000Z",
        Phase: "Recording",
        Steps: steps,
    };
}

describe("LiveRecordedActionsTree — selection scroll", () => {
    let scrollSpy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        __resetRecorderSessionSyncForTests();
        window.localStorage.clear();

        // jsdom doesn't implement scrollIntoView; install a spy on the prototype
        // so every row inherits it and we can assert which row was targeted.
        scrollSpy = vi.fn();
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollSpy,
        });

        const steps: RecordedStep[] = Array.from({ length: 8 }, (_, i) =>
            makeStep(`s-${i}`, i),
        );
        await writeSession(makeSession(steps));
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("scrolls the matching row into view when a row is clicked", async () => {
        const view = render(<LiveRecordedActionsTree />);
        // Wait a tick for the async session subscription to deliver state.
        await act(async () => { await Promise.resolve(); });

        const target = view.getByTestId("live-action-s-5");
        scrollSpy.mockClear();
        fireEvent.click(target);

        // The clicked row's <li> ancestor should have received a scrollIntoView call.
        expect(scrollSpy).toHaveBeenCalledTimes(1);
        const callContext = scrollSpy.mock.instances[0] as HTMLElement;
        expect(callContext.getAttribute("data-step-id")).toBe("s-5");
        expect(scrollSpy.mock.calls[0][0]).toMatchObject({ block: "nearest" });
    });

    it("scrolls when the controlled selectedStepId prop changes (Options-driven)", async () => {
        const view = render(<LiveRecordedActionsTree selectedStepId={null} />);
        await act(async () => { await Promise.resolve(); });

        scrollSpy.mockClear();
        view.rerender(<LiveRecordedActionsTree selectedStepId="s-3" />);
        await act(async () => { await Promise.resolve(); });

        expect(scrollSpy).toHaveBeenCalledTimes(1);
        const callContext = scrollSpy.mock.instances[0] as HTMLElement;
        expect(callContext.getAttribute("data-step-id")).toBe("s-3");

        scrollSpy.mockClear();
        view.rerender(<LiveRecordedActionsTree selectedStepId="s-7" />);
        await act(async () => { await Promise.resolve(); });

        expect(scrollSpy).toHaveBeenCalledTimes(1);
        const ctx = scrollSpy.mock.instances[0] as HTMLElement;
        expect(ctx.getAttribute("data-step-id")).toBe("s-7");
    });

    it("applies a transient pulsing highlight to the active row", async () => {
        const view = render(<LiveRecordedActionsTree selectedStepId="s-2" />);
        // Two flushes: first delivers the session, second runs the
        // selection-effect that flips the pulse state.
        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });

        const row = view.getByTestId("live-action-s-2").closest("li") as HTMLLIElement;
        expect(row.getAttribute("data-pulsing")).toBe("true");

        vi.useFakeTimers();
        await act(async () => { vi.advanceTimersByTime(1300); });
        // Note: the pulse timer was scheduled before fake timers were installed,
        // so we just verify the attribute eventually clears via real timers.
        vi.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 1300));
        await act(async () => { await Promise.resolve(); });
        expect(row.getAttribute("data-pulsing")).toBeNull();
    });

    it("does not call scrollIntoView when no step is selected", async () => {
        render(<LiveRecordedActionsTree selectedStepId={null} />);
        await act(async () => { await Promise.resolve(); });
        expect(scrollSpy).not.toHaveBeenCalled();
    });
});
