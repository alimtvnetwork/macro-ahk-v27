/**
 * RecorderStore — reducer unit tests
 *
 * Pure-function tests. No DOM, no chrome.* mocks needed.
 */

import { describe, it, expect } from "vitest";
import {
    IDLE_SESSION,
    RecorderStateError,
    nextPhaseOnPrimary,
    recorderReducer,
} from "../recorder-store";
import type { RecordingSession } from "../recorder-session-types";

const FIXED_NOW = "2026-04-26T12:00:00.000Z";

function startSession(): RecordingSession {
    return recorderReducer(IDLE_SESSION, {
        Kind: "Start",
        ProjectSlug: "demo",
        SessionId: "sess-1",
        StartedAt: FIXED_NOW,
    });
}

function captured(s: RecordingSession, stepId: string, varName: string, anchorStepId: string | null = null): RecordingSession {
    return recorderReducer(s, {
        Kind: "Capture",
        StepId: stepId,
        CapturedAt: FIXED_NOW,
        Step: {
            Kind: "Click",
            Label: `Label-${stepId}`,
            VariableName: varName,
            Selector: { XPathFull: `//*[@id="${stepId}"]`, XPathRelative: null, AnchorStepId: anchorStepId, Strategy: "Id" },
        },
    });
}

describe("recorderReducer — lifecycle", () => {
    it("Start moves Idle → Recording with empty Steps", () => {
        const s = startSession();
        expect(s.Phase).toBe("Recording");
        expect(s.SessionId).toBe("sess-1");
        expect(s.Steps).toHaveLength(0);
    });

    it("Start from non-Idle throws", () => {
        const s = startSession();
        expect(() => recorderReducer(s, { Kind: "Start", ProjectSlug: "x", SessionId: "y", StartedAt: FIXED_NOW }))
            .toThrow(RecorderStateError);
    });

    it("Pause / Resume cycle preserves Steps", () => {
        let s = captured(startSession(), "step-1", "Btn");
        s = recorderReducer(s, { Kind: "Pause" });
        expect(s.Phase).toBe("Paused");
        expect(s.Steps).toHaveLength(1);
        s = recorderReducer(s, { Kind: "Resume" });
        expect(s.Phase).toBe("Recording");
        expect(s.Steps).toHaveLength(1);
    });

    it("Pause from Idle throws", () => {
        expect(() => recorderReducer(IDLE_SESSION, { Kind: "Pause" })).toThrow(RecorderStateError);
    });

    it("Resume from Recording throws", () => {
        expect(() => recorderReducer(startSession(), { Kind: "Resume" })).toThrow(RecorderStateError);
    });

    it("Stop from any phase returns Idle", () => {
        const s1 = recorderReducer(startSession(), { Kind: "Stop" });
        expect(s1.Phase).toBe("Idle");
        const s2 = recorderReducer(IDLE_SESSION, { Kind: "Stop" });
        expect(s2.Phase).toBe("Idle");
    });
});

describe("recorderReducer — Capture", () => {
    it("appends step and assigns sequential Index", () => {
        let s = captured(startSession(), "a", "EmailField");
        s = captured(s, "b", "PasswordField");
        expect(s.Steps.map((x) => x.Index)).toEqual([1, 2]);
    });

    it("rejects Capture in Paused phase", () => {
        const s = recorderReducer(startSession(), { Kind: "Pause" });
        expect(() => captured(s, "x", "X")).toThrow(/Cannot Capture in phase 'Paused'/);
    });

    it("rejects duplicate VariableName", () => {
        const s = captured(startSession(), "a", "Same");
        expect(() => captured(s, "b", "Same")).toThrow(/already used by StepId 'a'/);
    });
});

describe("recorderReducer — Rename", () => {
    it("updates VariableName", () => {
        const s = captured(startSession(), "a", "Old");
        const next = recorderReducer(s, { Kind: "Rename", StepId: "a", VariableName: "New" });
        expect(next.Steps[0].VariableName).toBe("New");
    });

    it("blocks rename to a name used by another step", () => {
        let s = captured(startSession(), "a", "A");
        s = captured(s, "b", "B");
        expect(() => recorderReducer(s, { Kind: "Rename", StepId: "b", VariableName: "A" }))
            .toThrow(/already used by StepId 'a'/);
    });

    it("allows rename to the same name (no-op)", () => {
        const s = captured(startSession(), "a", "Same");
        expect(() => recorderReducer(s, { Kind: "Rename", StepId: "a", VariableName: "Same" })).not.toThrow();
    });
});

describe("recorderReducer — Delete", () => {
    it("removes the step and reindexes survivors", () => {
        let s = captured(startSession(), "a", "A");
        s = captured(s, "b", "B");
        s = captured(s, "c", "C");
        const next = recorderReducer(s, { Kind: "Delete", StepId: "b" });
        expect(next.Steps.map((x) => x.StepId)).toEqual(["a", "c"]);
        expect(next.Steps.map((x) => x.Index)).toEqual([1, 2]);
    });

    it("rewrites AnchorStepId on dependents to null", () => {
        let s = captured(startSession(), "anchor", "Anchor");
        s = captured(s, "dep", "Dep", "anchor");
        const next = recorderReducer(s, { Kind: "Delete", StepId: "anchor" });
        expect(next.Steps).toHaveLength(1);
        expect(next.Steps[0].Selector.AnchorStepId).toBeNull();
    });

    it("throws on unknown StepId", () => {
        const s = captured(startSession(), "a", "A");
        expect(() => recorderReducer(s, { Kind: "Delete", StepId: "missing" })).toThrow();
    });
});

describe("nextPhaseOnPrimary", () => {
    it.each([
        ["Idle", "Recording"],
        ["Recording", "Paused"],
        ["Paused", "Recording"],
    ] as const)("%s → %s", (from, to) => {
        expect(nextPhaseOnPrimary(from)).toBe(to);
    });
});
