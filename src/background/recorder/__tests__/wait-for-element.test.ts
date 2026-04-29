// @vitest-environment jsdom

/**
 * Marco Extension — Wait-For-Element gate tests
 *
 * Covers the standalone polling helper plus its integration with
 * `executeReplay`: success when the element appears mid-wait, timeout
 * failure with a structured FailureReport, and the no-WaitFor backward
 * compatibility path.
 */

import { describe, expect, it, vi } from "vitest";
import { waitForElement } from "../wait-for-element";
import { executeReplay, type ReplayStepInput } from "../live-dom-replay";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

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

describe("waitForElement", () => {
    it("returns Ok when the element is already present", async () => {
        document.body.innerHTML = `<div id="ready">x</div>`;
        const out = await waitForElement(
            { Expression: "#ready", TimeoutMs: 100 },
            { Doc: document },
        );
        expect(out.Ok).toBe(true);
        if (out.Ok) { expect(out.ResolvedKind).toBe("Css"); }
    });

    it("polls and resolves once the element appears", async () => {
        document.body.innerHTML = ``;
        let t = 0;
        const sleep = vi.fn(async (ms: number) => { t += ms; });
        const now = () => t;

        // Insert the element after the third poll.
        let polls = 0;
        const origQuerySelector = document.querySelector.bind(document);
        const spy = vi.spyOn(document, "querySelector").mockImplementation((sel: string) => {
            polls += 1;
            if (polls >= 3) { document.body.innerHTML = `<div id="late"></div>`; }
            return origQuerySelector(sel);
        });

        const out = await waitForElement(
            { Expression: "#late", TimeoutMs: 1_000, PollMs: 25 },
            { Doc: document, Sleep: sleep, Now: now },
        );
        spy.mockRestore();
        expect(out.Ok).toBe(true);
        expect(sleep).toHaveBeenCalled();
    });

    it("returns Timeout when the element never appears", async () => {
        document.body.innerHTML = ``;
        let t = 0;
        const sleep = async (ms: number) => { t += ms; };
        const now = () => t;

        const out = await waitForElement(
            { Expression: "#missing", TimeoutMs: 50, PollMs: 10 },
            { Doc: document, Sleep: sleep, Now: now },
        );
        expect(out.Ok).toBe(false);
        if (!out.Ok) {
            expect(out.Reason).toBe("Timeout");
            expect(out.Detail).toContain("#missing");
        }
    });

    it("auto-detects XPath expressions starting with '/'", async () => {
        document.body.innerHTML = `<span class="badge">hi</span>`;
        const out = await waitForElement(
            { Expression: "//span[@class='badge']", TimeoutMs: 100 },
            { Doc: document },
        );
        expect(out.Ok).toBe(true);
        if (out.Ok) { expect(out.ResolvedKind).toBe("XPath"); }
    });
});

describe("executeReplay — WaitFor gate", () => {
    it("waits for the post-click element to appear before marking the step Ok", async () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const btn = document.getElementById("go")!;
        // Click handler injects the awaited element asynchronously.
        btn.addEventListener("click", () => {
            setTimeout(() => {
                document.body.insertAdjacentHTML("beforeend", `<div id="loaded"></div>`);
            }, 0);
        });

        const steps: ReplayStepInput[] = [{
            StepId: 1, Index: 1, Kind: "Click",
            Selectors: cssSelector(1, "#go"),
            WaitFor: { Expression: "#loaded", TimeoutMs: 500, PollMs: 5 },
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
        expect(document.getElementById("loaded")).not.toBeNull();
    });

    it("fails the step with a structured FailureReport when WaitFor times out", async () => {
        document.body.innerHTML = `<button id="go2">Go</button>`;

        const steps: ReplayStepInput[] = [{
            StepId: 2, Index: 1, Kind: "Click",
            Selectors: cssSelector(2, "#go2"),
            WaitFor: { Expression: "#never", TimeoutMs: 30, PollMs: 5 },
        }];

        const outcome = await executeReplay(steps, { Doc: document });
        const r = outcome.Results[0]!;
        expect(r.Ok).toBe(false);
        expect(r.Error).toContain("WaitFor");
        expect(r.FailureReport).toBeDefined();
    });

    it("is a no-op when WaitFor is omitted (backward compatible)", async () => {
        document.body.innerHTML = `<button id="go3">Go</button>`;
        const steps: ReplayStepInput[] = [{
            StepId: 3, Index: 1, Kind: "Click",
            Selectors: cssSelector(3, "#go3"),
        }];
        const outcome = await executeReplay(steps, { Doc: document });
        expect(outcome.Results[0]!.Ok).toBe(true);
    });
});
