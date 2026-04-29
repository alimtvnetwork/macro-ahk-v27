/**
 * Marco Extension — Recorder Toolbar tests
 *
 * Drives the Shadow-Root toolbar through Start → Pause → Resume → Stop and
 * asserts both the underlying RecordingPhase transitions and the rendered
 * button state (enabled/disabled, label swap).
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    mountRecorderToolbar,
    RECORDER_TOOLBAR_HOST_ID,
    type RecorderToolbarHandle,
} from "../recorder-toolbar";
import type { RecordingPhase } from "../recorder-session-types";

let handle: RecorderToolbarHandle | null = null;

afterEach(() => {
    handle?.Destroy();
    handle = null;
});

function mount(onPhase?: (p: RecordingPhase) => void): RecorderToolbarHandle {
    let counter = 0;
    handle = mountRecorderToolbar({
        ProjectSlug: "test-project",
        NewSessionId: () => `session-${++counter}`,
        Now: () => "2026-04-26T00:00:00.000Z",
        OnPhaseChange: onPhase,
    });
    return handle;
}

function btn(h: RecorderToolbarHandle, action: "start" | "pause" | "resume" | "stop"): HTMLButtonElement {
    const el = h.Root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
    if (el === null) { throw new Error(`button[data-action="${action}"] not found`); }
    return el;
}

describe("RecorderToolbar (Shadow-Root)", () => {
    it("mounts a host element with a shadow root containing a toolbar", () => {
        const h = mount();
        expect(document.getElementById(RECORDER_TOOLBAR_HOST_ID)).toBe(h.Host);
        expect(h.Root.querySelector('[role="toolbar"]')).not.toBeNull();
        expect(h.GetSession().Phase).toBe("Idle");
    });

    it("Idle: Start enabled, Pause+Stop disabled", () => {
        const h = mount();
        expect(btn(h, "start").disabled).toBe(false);
        expect(btn(h, "pause").disabled).toBe(true);
        expect(btn(h, "stop").disabled).toBe(true);
    });

    it("Start click → Recording: Start disabled, Pause+Stop enabled", () => {
        const phases: RecordingPhase[] = [];
        const h = mount((p) => phases.push(p));
        btn(h, "start").click();
        expect(h.GetSession().Phase).toBe("Recording");
        expect(phases).toEqual(["Recording"]);
        expect(btn(h, "start").disabled).toBe(true);
        expect(btn(h, "pause").disabled).toBe(false);
        expect(btn(h, "stop").disabled).toBe(false);
        expect(h.GetSession().SessionId).toBe("session-1");
        expect(h.GetSession().StartedAt).toBe("2026-04-26T00:00:00.000Z");
    });

    it("Pause toggles to Resume label, Resume returns to Recording", () => {
        const phases: RecordingPhase[] = [];
        const h = mount((p) => phases.push(p));
        btn(h, "start").click();
        btn(h, "pause").click();
        expect(h.GetSession().Phase).toBe("Paused");

        // The button morphed: data-action is now "resume"
        const resumeBtn = btn(h, "resume");
        expect(resumeBtn.textContent).toBe("Resume");
        resumeBtn.click();
        expect(h.GetSession().Phase).toBe("Recording");
        expect(phases).toEqual(["Recording", "Paused", "Recording"]);
    });

    it("Stop returns to Idle from Recording AND from Paused", () => {
        const h = mount();
        btn(h, "start").click();
        btn(h, "stop").click();
        expect(h.GetSession().Phase).toBe("Idle");

        btn(h, "start").click();
        btn(h, "pause").click();
        btn(h, "stop").click();
        expect(h.GetSession().Phase).toBe("Idle");
        expect(btn(h, "start").disabled).toBe(false);
    });

    it("emits OnPhaseChange exactly once per transition", () => {
        const onPhase = vi.fn<(p: RecordingPhase) => void>();
        const h = mount(onPhase);
        h.Start();  // Idle → Recording
        h.Pause();  // Recording → Paused
        h.Resume(); // Paused → Recording
        h.Stop();   // Recording → Idle
        expect(onPhase.mock.calls.map((c) => c[0])).toEqual([
            "Recording", "Paused", "Recording", "Idle",
        ]);
    });

    it("Destroy is idempotent and removes the host element", () => {
        const h = mount();
        h.Destroy();
        expect(document.getElementById(RECORDER_TOOLBAR_HOST_ID)).toBeNull();
        expect(() => h.Destroy()).not.toThrow();
    });

    it("rejects illegal transitions (Pause from Idle throws)", () => {
        const h = mount();
        expect(() => h.Pause()).toThrow(/Cannot Pause from phase 'Idle'/);
        expect(h.GetSession().Phase).toBe("Idle");
    });
});
