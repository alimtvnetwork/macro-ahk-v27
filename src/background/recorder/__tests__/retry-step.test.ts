// @vitest-environment jsdom

/**
 * Marco Extension — retryStep tests.
 *
 * Verifies the single-step retry helper:
 *   1. Re-runs an originally-failed step using the same selectors.
 *   2. Returns a fresh ReplayStepResult reflecting the new outcome (Ok=true
 *      after the DOM is fixed; Ok=false with a structured FailureReport
 *      when the target is still missing).
 *   3. Forwards Persist options with a `"Retry of step #N"` notes prefix.
 */

import { describe, it, expect, vi } from "vitest";
import { retryStep } from "../retry-step";
import type { ReplayStepInput } from "../live-dom-replay";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

vi.mock("../replay-run-persistence", () => ({
    saveReplayRun: vi.fn(async (slug: string, draft: { Notes: string; StepResults: unknown[] }) => ({
        ReplayRunId: 99,
        StartedAt: "2026-04-26T10:00:00.000Z",
        FinishedAt: "2026-04-26T10:00:00.001Z",
        TotalSteps: draft.StepResults.length,
        OkSteps: 0,
        FailedSteps: 0,
        Notes: draft.Notes,
        Slug: slug,
    })),
}));

import { saveReplayRun } from "../replay-run-persistence";

function cssSelector(stepId: number, expr: string): PersistedSelector[] {
    return [{
        SelectorId: stepId * 10,
        StepId: stepId,
        SelectorKindId: SelectorKindId.Css,
        Expression: expr,
        AnchorSelectorId: null,
        IsPrimary: 1,
    }];
}

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

describe("retryStep", () => {
    it("succeeds when the target now exists in the DOM", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const onClick = vi.fn();
        document.getElementById("go")!.addEventListener("click", onClick);

        const step: ReplayStepInput = {
            StepId: 7, Index: 2, Kind: "Click",
            Selectors: cssSelector(7, "#go"),
        };
        const outcome = await retryStep(step, { Doc: document, Now: FIXED_NOW });

        expect(outcome.Result.Ok).toBe(true);
        expect(outcome.Result.StepId).toBe(7);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(outcome.PersistedRunId).toBeNull();
    });

    it("returns a fresh failure report when the target is still missing", async () => {
        document.body.innerHTML = `<div></div>`;
        const step: ReplayStepInput = {
            StepId: 8, Index: 3, Kind: "Click",
            Selectors: cssSelector(8, "#missing"),
        };
        const outcome = await retryStep(step, { Doc: document, Now: FIXED_NOW });

        expect(outcome.Result.Ok).toBe(false);
        expect(outcome.Result.FailureReport).toBeDefined();
        expect(outcome.Result.FailureReport!.Phase).toBe("Replay");
        expect(outcome.Result.FailureReport!.StepId).toBe(8);
        expect(outcome.Result.Error).toContain("Element not found");
    });

    it("persists the retry with a 'Retry of step #N' notes prefix", async () => {
        document.body.innerHTML = `<button id="ok">ok</button>`;
        const step: ReplayStepInput = {
            StepId: 42, Index: 0, Kind: "Click",
            Selectors: cssSelector(42, "#ok"),
        };
        const outcome = await retryStep(step, {
            Doc: document, Now: FIXED_NOW,
            Persist: { ProjectSlug: "demo", Notes: "from toast" },
        });

        expect(saveReplayRun).toHaveBeenCalledTimes(1);
        const [, draft] = (saveReplayRun as unknown as { mock: { calls: [string, { Notes: string }][] } }).mock.calls[0];
        expect(draft.Notes).toBe("Retry of step #42 — from toast");
        expect(outcome.PersistedRunId).toBe(99);
    });

    it("uses the bare 'Retry of step #N' tag when the caller omits notes", async () => {
        document.body.innerHTML = `<button id="ok">ok</button>`;
        const step: ReplayStepInput = {
            StepId: 5, Index: 0, Kind: "Click",
            Selectors: cssSelector(5, "#ok"),
        };
        await retryStep(step, {
            Doc: document, Now: FIXED_NOW,
            Persist: { ProjectSlug: "demo" },
        });
        const calls = (saveReplayRun as unknown as { mock: { calls: [string, { Notes: string }][] } }).mock.calls;
        const last = calls[calls.length - 1][1];
        expect(last.Notes).toBe("Retry of step #5");
    });
});
