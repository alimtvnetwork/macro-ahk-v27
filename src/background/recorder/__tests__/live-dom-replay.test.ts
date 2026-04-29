// @vitest-environment jsdom

/**
 * Marco Extension — Live-DOM Replay Executor tests
 *
 * Verifies that the executor turns persisted Step + Selector rows into real
 * DOM events (`click`, `input`, `change`) on the right element, with
 * `{{Column}}` templates resolved against the active data row.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { executeReplay, type ReplayStepInput } from "../live-dom-replay";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";
import {
    clearAllStepWaits,
    writeStepWait,
} from "../step-library/step-wait";

function fullXPathSelector(stepId: number, expr: string): PersistedSelector[] {
    return [{
        SelectorId: stepId * 10,
        StepId: stepId,
        SelectorKindId: SelectorKindId.XPathFull,
        Expression: expr,
        AnchorSelectorId: null,
        IsPrimary: 1,
    }];
}

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

describe("executeReplay", () => {
    it("dispatches click events on a button located via XPath", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const btn = document.getElementById("go")!;
        const onClick = vi.fn();
        btn.addEventListener("click", onClick);

        const steps: ReplayStepInput[] = [{
            StepId: 1, Index: 1, Kind: "Click",
            Selectors: fullXPathSelector(1, '//button[@id="go"]'),
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("types into an input via Css selector and resolves {{Column}} from Row", async () => {
        document.body.innerHTML = `<input id="email" />`;
        const input = document.getElementById("email") as HTMLInputElement;
        const onInput = vi.fn();
        input.addEventListener("input", onInput);

        const steps: ReplayStepInput[] = [{
            StepId: 2, Index: 1, Kind: "Type",
            Selectors: cssSelector(2, "#email"),
            Value: "{{Email}}",
        }];

        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Email: "alice@example.com" },
        });

        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(input.value).toBe("alice@example.com");
        expect(onInput).toHaveBeenCalledTimes(1);
    });

    it("selects a value in a <select> and fires change", async () => {
        document.body.innerHTML = `<select id="x"><option>A</option><option>B</option></select>`;
        const sel = document.getElementById("x") as HTMLSelectElement;
        const onChange = vi.fn();
        sel.addEventListener("change", onChange);

        const steps: ReplayStepInput[] = [{
            StepId: 3, Index: 1, Kind: "Select",
            Selectors: cssSelector(3, "#x"),
            Value: "B",
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(sel.value).toBe("B");
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("returns Ok=false with a clear error when the element is missing", async () => {
        document.body.innerHTML = "";
        const steps: ReplayStepInput[] = [{
            StepId: 4, Index: 1, Kind: "Click",
            Selectors: cssSelector(4, "#nope"),
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(false);
        expect(outcome.Results[0]!.Error).toMatch(/Element not found/);
    });

    it("Wait step uses the injected sleep and resolves Ok", async () => {
        const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
        const steps: ReplayStepInput[] = [{
            StepId: 5, Index: 1, Kind: "Wait", Selectors: [], WaitMs: 250,
        }];
        const outcome = await executeReplay(steps, { Doc: document, Sleep: sleep });
        expect(sleep).toHaveBeenCalledWith(250);
        expect(outcome.Results[0]!.Ok).toBe(true);
    });

    it("executes steps in order and collects per-step results", async () => {
        document.body.innerHTML = `<input id="a" /><button id="b">go</button>`;
        const a = document.getElementById("a") as HTMLInputElement;
        const b = document.getElementById("b") as HTMLButtonElement;
        const clicked = vi.fn();
        b.addEventListener("click", clicked);

        const steps: ReplayStepInput[] = [
            { StepId: 10, Index: 1, Kind: "Type",  Selectors: cssSelector(10, "#a"), Value: "hi" },
            { StepId: 11, Index: 2, Kind: "Click", Selectors: cssSelector(11, "#b") },
        ];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results.map((r) => r.Index)).toEqual([1, 2]);
        expect(outcome.Results.every((r) => r.Ok)).toBe(true);
        expect(a.value).toBe("hi");
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it("fails Type step with Reason=VariableMissing and full Variable diagnostics", async () => {
        document.body.innerHTML = `<input id="a" />`;
        const steps: ReplayStepInput[] = [{
            StepId: 20, Index: 1, Kind: "Type",
            Selectors: cssSelector(20, "#a"),
            Value: "Hi {{Email}}",
        }];
        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Name: "Alice" },   // Email is missing
        });
        const r = outcome.Results[0]!;
        expect(r.Ok).toBe(false);
        expect(r.FailureReport).toBeDefined();
        expect(r.FailureReport!.Reason).toBe("VariableMissing");
        expect(r.FailureReport!.Variables).toHaveLength(1);
        expect(r.FailureReport!.Variables[0]).toMatchObject({
            Name: "Email", FailureReason: "MissingColumn", ResolvedValue: null,
        });
        // The DOM was not touched because we short-circuited on the variable.
        expect((document.getElementById("a") as HTMLInputElement).value).toBe("");
    });

    it("fails Type step with Reason=VariableNull when value is explicitly null", async () => {
        document.body.innerHTML = `<input id="a" />`;
        const steps: ReplayStepInput[] = [{
            StepId: 21, Index: 1, Kind: "Type",
            Selectors: cssSelector(21, "#a"),
            Value: "{{Phone}}",
        }];
        // Cast — runtime FieldRow may carry null when sourced from SQLite.
        const outcome = await executeReplay(steps, {
            Doc: document,
            Row: { Phone: null } as unknown as Record<string, string>,
        });
        const r = outcome.Results[0]!;
        expect(r.FailureReport!.Reason).toBe("VariableNull");
        expect(r.FailureReport!.Variables[0].Name).toBe("Phone");
    });
});

describe("executeReplay — persisted per-step wait bridge", () => {
    afterEach(() => {
        clearAllStepWaits();
        document.body.innerHTML = "";
    });

    it("pauses after the click until a persisted wait selector appears in the DOM", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const btn = document.getElementById("go")!;
        writeStepWait(91, {
            Selector: "#after",
            Kind: "Css",
            Condition: "Appears",
            TimeoutMs: 1_000,
        });

        // Inject the awaited element only AFTER the click handler fires —
        // proves that the executor actually polled, not just lucked out.
        btn.addEventListener("click", () => {
            queueMicrotask(() => {
                const el = document.createElement("div");
                el.id = "after";
                document.body.appendChild(el);
            });
        });

        const steps: ReplayStepInput[] = [{
            StepId: 91, Index: 1, Kind: "Click",
            Selectors: cssSelector(91, "#go"),
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
    });

    it("fails the step with a structured Timeout report when the persisted wait selector never appears", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        writeStepWait(92, {
            Selector: "#never",
            Kind: "Css",
            Condition: "Appears",
            TimeoutMs: 30,
        });

        const steps: ReplayStepInput[] = [{
            StepId: 92, Index: 1, Kind: "Click",
            Selectors: cssSelector(92, "#go"),
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        const r = outcome.Results[0]!;
        expect(r.Ok).toBe(false);
        // Plain-text message carries selector + kind + configured timeout
        // + actual elapsed ms — the four fields the user asked us to
        // expose in the failure UI.
        expect(r.Error).toMatch(/WaitFor selector '#never' \(Kind=Css\)/);
        // Storage clamps TimeoutMs to ≥250 ms (see step-wait.ts), so
        // the surfaced number reflects the clamped value, not the raw
        // input — that's the value the runner actually waited on.
        expect(r.Error).toMatch(/did not appear within 250 ms/);
        expect(r.Error).toMatch(/elapsed \d+ ms/);
        // Structured FailureReport drives the FailureDetailsPanel banner.
        const report = r.FailureReport!;
        expect(report.Reason).toBe("Timeout");
        expect(report.ReasonDetail).toMatch(/'#never'.*Kind=Css.*250 ms/s);
        expect(report.ReasonDetail).toMatch(/elapsed \d+ ms/);
    });

    it("classifies an invalid wait selector as a syntax error in the report", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        writeStepWait(95, {
            Selector: ">>>broken<<<",
            Kind: "Css",
            Condition: "Appears",
            TimeoutMs: 50,
        });
        const steps: ReplayStepInput[] = [{
            StepId: 95, Index: 1, Kind: "Click",
            Selectors: cssSelector(95, "#go"),
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        const r = outcome.Results[0]!;
        expect(r.Ok).toBe(false);
        expect(r.FailureReport!.Reason).toBe("CssSyntaxError");
        expect(r.FailureReport!.ReasonDetail).toMatch(/is invalid:/);
    });

    it("inline step.WaitFor wins over the persisted config", async () => {
        document.body.innerHTML = `<button id="go">Go</button><div id="inline"></div>`;
        writeStepWait(93, {
            Selector: "#nope",
            Kind: "Css",
            Condition: "Appears",
            TimeoutMs: 30,
        });

        const steps: ReplayStepInput[] = [{
            StepId: 93, Index: 1, Kind: "Click",
            Selectors: cssSelector(93, "#go"),
            WaitFor: { Expression: "#inline", Kind: "Css", TimeoutMs: 200 },
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
    });

    it("does nothing when there is no persisted config and no inline WaitFor", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const steps: ReplayStepInput[] = [{
            StepId: 94, Index: 1, Kind: "Click",
            Selectors: cssSelector(94, "#go"),
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
    });
});
