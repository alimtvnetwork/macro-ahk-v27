/**
 * Tests for condition-step.ts route resolution (Spec 18 §5).
 */

import { describe, expect, it } from "vitest";
import {
    MAX_ROUTE_JUMPS,
    resolveRoute,
    type RouteableStep,
} from "../condition-step";

const STEPS: ReadonlyArray<RouteableStep> = [
    { StepId: 10, Label: "start" },
    { StepId: 11, Label: "middle" },
    { StepId: 12, Label: "end" },
];

describe("resolveRoute", () => {
    it("Continue advances cursor", () => {
        const r = resolveRoute(
            { Kind: "Continue" },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: 0 },
        );
        expect(r).toEqual({ Kind: "Cursor", NextIndex: 1, JumpsUsed: 1 });
    });

    it("EndRun ends the run with the chosen outcome", () => {
        const r = resolveRoute(
            { Kind: "EndRun", Outcome: "Pass" },
            { Steps: STEPS, CurrentIndex: 1, JumpsUsed: 0 },
        );
        expect(r).toEqual({ Kind: "End", Outcome: "Pass", JumpsUsed: 1 });
    });

    it("GoToLabel jumps to the matching index", () => {
        const r = resolveRoute(
            { Kind: "GoToLabel", Label: "end" },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: 0 },
        );
        expect(r).toEqual({ Kind: "Cursor", NextIndex: 2, JumpsUsed: 1 });
    });

    it("GoToLabel with unknown label returns InvalidRouteTarget", () => {
        const r = resolveRoute(
            { Kind: "GoToLabel", Label: "missing" },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: 0 },
        );
        expect(r.Kind).toBe("Error");
        if (r.Kind === "Error") expect(r.Reason).toBe("InvalidRouteTarget");
    });

    it("GoToStepId jumps to matching step", () => {
        const r = resolveRoute(
            { Kind: "GoToStepId", StepId: 11 },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: 0 },
        );
        expect(r.Kind).toBe("Cursor");
        if (r.Kind === "Cursor") expect(r.NextIndex).toBe(1);
    });

    it("GoToStepId with unknown id returns InvalidRouteTarget", () => {
        const r = resolveRoute(
            { Kind: "GoToStepId", StepId: 999 },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: 0 },
        );
        expect(r.Kind).toBe("Error");
    });

    it("RunGroup returns the group id and advances cursor for return", () => {
        const r = resolveRoute(
            { Kind: "RunGroup", StepGroupId: 42 },
            { Steps: STEPS, CurrentIndex: 1, JumpsUsed: 0 },
        );
        expect(r).toEqual({ Kind: "RunGroup", StepGroupId: 42, NextIndex: 2, JumpsUsed: 1 });
    });

    it("returns RouteLoopDetected when jumps exceed cap", () => {
        const r = resolveRoute(
            { Kind: "Continue" },
            { Steps: STEPS, CurrentIndex: 0, JumpsUsed: MAX_ROUTE_JUMPS },
        );
        expect(r.Kind).toBe("Error");
        if (r.Kind === "Error") expect(r.Reason).toBe("RouteLoopDetected");
    });
});
