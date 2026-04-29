/**
 * replay-bridge.test.ts — covers the StepRow → ReplayStepInput
 * translator and the LeafStepExecutor it powers.
 *
 * Why: this is the surface that connects the pure runner to the live
 * DOM actuator. Coverage targets:
 *   - Each leaf StepKind translates to the right ReplayStepInput.
 *   - Selector kind heuristic (CSS vs XPath) matches the resolver.
 *   - Missing/malformed PayloadJson surfaces as a FailureReport, not
 *     an unhandled throw.
 *   - Real Click/Type drive the jsdom Document end-to-end via
 *     executeReplay (so we know the wiring isn't a no-op).
 *   - DOM-lookup failures bubble through with FailureReport intact.
 *   - RunGroup/JsInline kinds correctly throw at translation time
 *     (the runner must intercept RunGroup; JsInline is documented as
 *     unsupported here).
 */

import { describe, it, expect } from "vitest";

import {
    createLiveReplayExecutor,
    stepRowToReplayInput,
} from "../replay-bridge";
import { StepKindId } from "../schema";
import type { StepRow } from "../db";
import type { LeafStepContext } from "../run-group-runner";

function makeStep(partial: Partial<StepRow> & Pick<StepRow, "StepKindId">): StepRow {
    return {
        StepId: 100,
        StepGroupId: 1,
        OrderIndex: 0,
        StepKindId: partial.StepKindId,
        Label: partial.Label ?? null,
        PayloadJson: partial.PayloadJson ?? null,
        TargetStepGroupId: partial.TargetStepGroupId ?? null,
        IsDisabled: false,
        CreatedAt: "2026-01-01T00:00:00.000Z",
        UpdatedAt: "2026-01-01T00:00:00.000Z",
        ...partial,
    } as StepRow;
}

const ctx: LeafStepContext = {
    ProjectId: 1,
    GroupPath: ["Root"],
    CallStackGroupIds: [1],
};

/* ------------------------------------------------------------------ */
/*  stepRowToReplayInput                                               */
/* ------------------------------------------------------------------ */

describe("stepRowToReplayInput", () => {
    it("maps a Click step with a CSS selector", () => {
        const input = stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: JSON.stringify({ Selector: "#submit" }),
        }));
        expect(input.Kind).toBe("Click");
        expect(input.Selectors).toHaveLength(1);
        expect(input.Selectors[0].Expression).toBe("#submit");
        expect(input.Selectors[0].SelectorKindId).toBe(3); // Css
        expect(input.Selectors[0].IsPrimary).toBe(1);
    });

    it("maps a Click step with an XPath selector", () => {
        const input = stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: JSON.stringify({ Selector: "//button[@id='go']" }),
        }));
        expect(input.Selectors[0].SelectorKindId).toBe(1); // XPathFull
        expect(input.Selectors[0].Expression).toBe("//button[@id='go']");
    });

    it("maps a Type step including the literal value", () => {
        const input = stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Type,
            PayloadJson: JSON.stringify({ Selector: "#email", Value: "a@b.com" }),
        }));
        expect(input.Kind).toBe("Type");
        expect(input.Value).toBe("a@b.com");
    });

    it("preserves {{token}} placeholders verbatim — substitution happens in executeReplay", () => {
        const input = stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Type,
            PayloadJson: JSON.stringify({ Selector: "#email", Value: "{{Email}}" }),
        }));
        expect(input.Value).toBe("{{Email}}");
    });

    it("maps a Wait step using the WaitMs field", () => {
        const input = stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Wait,
            PayloadJson: JSON.stringify({ WaitMs: 250 }),
        }));
        expect(input.Kind).toBe("Wait");
        expect(input.WaitMs).toBe(250);
        expect(input.Selectors).toHaveLength(0);
    });

    it("rejects a Click step that has no selector", () => {
        expect(() => stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: JSON.stringify({}),
        }))).toThrow(/requires PayloadJson\.Selector/);
    });

    it("rejects a Wait step with non-numeric WaitMs", () => {
        expect(() => stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Wait,
            PayloadJson: JSON.stringify({ WaitMs: "soon" }),
        }))).toThrow(/invalid PayloadJson\.WaitMs/);
    });

    it("rejects malformed JSON with a precise step-id message", () => {
        expect(() => stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: "{not json",
        }))).toThrow(/invalid PayloadJson/);
    });

    it("rejects RunGroup at translation time — the runner must intercept it", () => {
        expect(() => stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.RunGroup,
            TargetStepGroupId: 2,
        }))).toThrow(/RunGroup step .* reached the leaf executor/);
    });

    it("rejects JsInline as not yet supported by the bridge", () => {
        expect(() => stepRowToReplayInput(makeStep({
            StepKindId: StepKindId.JsInline,
        }))).toThrow(/JsInline .* not yet supported/);
    });
});

/* ------------------------------------------------------------------ */
/*  createLiveReplayExecutor — drives executeReplay end-to-end         */
/* ------------------------------------------------------------------ */

describe("createLiveReplayExecutor", () => {
    it("clicks the resolved element in the live document", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const btn = document.getElementById("go") as HTMLButtonElement;
        let clicked = 0;
        btn.addEventListener("click", () => { clicked++; });

        const exec = createLiveReplayExecutor({ Doc: document });
        const failure = await exec(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: JSON.stringify({ Selector: "#go" }),
        }), ctx);

        expect(failure).toBeNull();
        expect(clicked).toBe(1);
    });

    it("types into an input with token substitution", async () => {
        document.body.innerHTML = `<input id="email" />`;
        const exec = createLiveReplayExecutor({
            Doc: document,
            Row: { Email: "a@b.com" },
        });
        const failure = await exec(makeStep({
            StepKindId: StepKindId.Type,
            PayloadJson: JSON.stringify({ Selector: "#email", Value: "{{Email}}" }),
        }), ctx);

        expect(failure).toBeNull();
        expect((document.getElementById("email") as HTMLInputElement).value).toBe("a@b.com");
    });

    it("returns a FailureReport when the selector matches nothing", async () => {
        document.body.innerHTML = `<div></div>`;
        const exec = createLiveReplayExecutor({ Doc: document });
        const failure = await exec(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: JSON.stringify({ Selector: "#missing" }),
        }), ctx);

        expect(failure).not.toBeNull();
        expect(failure?.Phase).toBe("Replay");
    });

    it("returns a FailureReport (not a throw) when PayloadJson is malformed", async () => {
        const exec = createLiveReplayExecutor({ Doc: document });
        const failure = await exec(makeStep({
            StepKindId: StepKindId.Click,
            PayloadJson: "{nope",
        }), ctx);

        expect(failure).not.toBeNull();
        expect(failure?.ReasonDetail).toMatch(/could not be translated/);
    });

    it("honours the injected sleep for Wait steps", async () => {
        let slept = 0;
        const exec = createLiveReplayExecutor({
            Doc: document,
            Sleep: async (ms) => { slept = ms; },
        });
        const failure = await exec(makeStep({
            StepKindId: StepKindId.Wait,
            PayloadJson: JSON.stringify({ WaitMs: 42 }),
        }), ctx);

        expect(failure).toBeNull();
        expect(slept).toBe(42);
    });
});
