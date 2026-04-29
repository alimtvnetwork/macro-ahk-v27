/**
 * Tests for RecorderControlBar — verifies the Play/Pause/Stop enable matrix
 * across Idle, Recording, and Paused phases.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { RecorderControlBar } from "../RecorderControlBar";
import { RECORDER_SESSION_STORAGE_KEY } from "@/background/recorder/recorder-session-types";

function seed(phase: "Idle" | "Recording" | "Paused"): void {
    if (phase === "Idle") {
        window.localStorage.removeItem(RECORDER_SESSION_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(
        RECORDER_SESSION_STORAGE_KEY,
        JSON.stringify({
            SessionId: "s1",
            ProjectSlug: "p",
            StartedAt: new Date().toISOString(),
            Phase: phase,
            Steps: [],
        }),
    );
}

async function flush(): Promise<void> {
    await act(async () => { await Promise.resolve(); });
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("RecorderControlBar", () => {
    it("Idle: Play enabled, Pause+Stop disabled", async () => {
        seed("Idle");
        render(<RecorderControlBar />);
        await flush();
        expect(screen.getByTestId("recorder-control-play")).not.toBeDisabled();
        expect(screen.getByTestId("recorder-control-pause")).toBeDisabled();
        expect(screen.getByTestId("recorder-control-stop")).toBeDisabled();
    });

    it("Recording: Pause+Stop enabled, Play disabled", async () => {
        seed("Recording");
        render(<RecorderControlBar />);
        await flush();
        expect(screen.getByTestId("recorder-control-play")).toBeDisabled();
        expect(screen.getByTestId("recorder-control-pause")).not.toBeDisabled();
        expect(screen.getByTestId("recorder-control-stop")).not.toBeDisabled();
    });

    it("Paused: Play (Resume)+Stop enabled, Pause disabled", async () => {
        seed("Paused");
        render(<RecorderControlBar />);
        await flush();
        const play = screen.getByTestId("recorder-control-play");
        expect(play).not.toBeDisabled();
        expect(play.textContent).toContain("Resume");
        expect(screen.getByTestId("recorder-control-pause")).toBeDisabled();
        expect(screen.getByTestId("recorder-control-stop")).not.toBeDisabled();
    });
});
