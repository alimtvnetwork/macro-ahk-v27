// @vitest-environment jsdom

/**
 * Verbose-logging integration tests — verify that the failure-logger
 * honors the Verbose flag end-to-end:
 *   - Verbose=false (default): no CapturedHtml, no DomContext.OuterHtml,
 *     legacy 120/240-char snippets stay truncated.
 *   - Verbose=true: full outerHTML captured, DomContext.Text/OuterHtml
 *     populated, top-level CapturedHtml mirrors DomContext.OuterHtml,
 *     XPath of target included.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildFailureReport } from "../failure-logger";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

beforeEach(() => {
    document.body.innerHTML = "";
});

function bigButton(): HTMLButtonElement {
    // 500-char text + lots of attributes so truncation differences are obvious.
    const text = "x".repeat(500);
    document.body.innerHTML = `<div><button id="go" class="primary big" name="submit" type="button">${text}</button></div>`;
    return document.getElementById("go") as HTMLButtonElement;
}

describe("FailureReport — Verbose=false (default)", () => {
    it("truncates Text/OuterHtml snippets and omits CapturedHtml + full fields", () => {
        const target = bigButton();
        const report = buildFailureReport({
            Phase: "Replay",
            Error: new Error("not clickable"),
            Target: target,
            SourceFile: "src/test.ts",
            Now: FIXED_NOW,
        });
        expect(report.Verbose).toBe(false);
        expect(report.CapturedHtml).toBeNull();
        expect(report.DomContext).not.toBeNull();
        expect(report.DomContext!.TextSnippet.length).toBeLessThanOrEqual(120);
        expect(report.DomContext!.OuterHtmlSnippet.length).toBeLessThanOrEqual(240);
        expect(report.DomContext!.OuterHtml).toBeUndefined();
        expect(report.DomContext!.Text).toBeUndefined();
        // XPath is always populated — required by the spec for any captured target.
        expect(report.DomContext!.XPath).toBe("//*[@id='go']");
    });
});

describe("FailureReport — Verbose=true", () => {
    it("populates full OuterHtml, Text, and top-level CapturedHtml", () => {
        const target = bigButton();
        const report = buildFailureReport({
            Phase: "Replay",
            Error: new Error("not clickable"),
            Target: target,
            Verbose: true,
            SourceFile: "src/test.ts",
            Now: FIXED_NOW,
        });
        expect(report.Verbose).toBe(true);
        expect(report.DomContext).not.toBeNull();
        expect(report.DomContext!.OuterHtml).toBe(target.outerHTML);
        expect(report.DomContext!.Text).toBe((target.textContent ?? "").trim());
        expect(report.DomContext!.OuterHtml!.length).toBeGreaterThan(240);
        expect(report.CapturedHtml).toBe(target.outerHTML);
        // Snippets stay truncated alongside the full payload — both surfaces
        // available so legacy consumers don't break.
        expect(report.DomContext!.TextSnippet.length).toBeLessThanOrEqual(120);
        expect(report.DomContext!.OuterHtmlSnippet.length).toBeLessThanOrEqual(240);
        expect(report.DomContext!.XPath).toBe("//*[@id='go']");
    });

    it("when Verbose=true but no Target, CapturedHtml is null", () => {
        const report = buildFailureReport({
            Phase: "Replay",
            Error: new Error("no target"),
            Verbose: true,
            SourceFile: "src/test.ts",
            Now: FIXED_NOW,
        });
        expect(report.Verbose).toBe(true);
        expect(report.CapturedHtml).toBeNull();
        expect(report.DomContext).toBeNull();
    });
});
