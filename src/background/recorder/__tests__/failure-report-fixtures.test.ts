// @vitest-environment jsdom

/**
 * Marco Extension — Failure Report Fixture & Formatting Tests
 *
 * Two-axis coverage:
 *
 *   1. **Schema** — every fixture (Record + Replay, both verbose modes)
 *      MUST declare every field listed in `REQUIRED_REPORT_FIELDS`. This
 *      mirrors the build-time guard at `scripts/check-failure-log-schema.mjs`
 *      so any drift between the two definitions fails fast.
 *   2. **Formatting** — `formatFailureReport` output is asserted against
 *      stable substrings for the canonical scenarios. Verbose-mode reports
 *      additionally include the `CapturedHtml (verbose):` block; non-verbose
 *      reports MUST NOT include it.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics
 *   - mem://standards/error-logging-requirements
 */

import { beforeEach, describe, expect, it } from "vitest";
import { formatFailureReport, type FailureReport } from "../failure-logger";
import {
    FIXTURE_NOW,
    allFixtures,
    fixtureRecordNoTarget,
    fixtureReplayPrimaryDrift,
    fixtureReplayVariableMissing,
    fixtureReplayZeroMatches,
} from "./__fixtures__/failure-report-fixtures";

/**
 * Mirrors `REQUIRED_REPORT_FIELDS` in
 * `scripts/check-failure-log-schema.mjs` — keep these in lockstep.
 */
const REQUIRED_REPORT_FIELDS: ReadonlyArray<keyof FailureReport> = [
    "Phase",
    "Reason",
    "ReasonDetail",
    "StackTrace",
    "StepId",
    "Index",
    "StepKind",
    "Selectors",
    "Variables",
    "DomContext",
    "ResolvedXPath",
    "Timestamp",
    "SourceFile",
    "Verbose",
];

beforeEach(() => {
    document.body.innerHTML = "";
});

/* ================================================================== */
/*  Schema: every fixture × every mode declares every required field   */
/* ================================================================== */

describe("FailureReport schema (required fields)", () => {
    for (const { Name, Bundle } of allFixtures()) {
        for (const mode of ["NonVerbose", "Verbose"] as const) {
            it(`${Name} / ${mode} declares every REQUIRED_REPORT_FIELD`, () => {
                const report = Bundle[mode];
                for (const field of REQUIRED_REPORT_FIELDS) {
                    expect(
                        Object.prototype.hasOwnProperty.call(report, field),
                        `Missing required field '${String(field)}' in ${Name}/${mode}`,
                    ).toBe(true);
                }
            });

            it(`${Name} / ${mode} pins Verbose flag, ISO timestamp, SourceFile`, () => {
                const report = Bundle[mode];
                expect(report.Verbose).toBe(mode === "Verbose");
                expect(report.Timestamp).toBe("2026-04-26T10:00:00.000Z");
                expect(report.SourceFile.length).toBeGreaterThan(0);
                expect(report.SourceFile.endsWith(".ts")).toBe(true);
            });

            it(`${Name} / ${mode} stamps non-empty Reason + ReasonDetail`, () => {
                const report = Bundle[mode];
                expect(report.Reason.length).toBeGreaterThan(0);
                expect(report.ReasonDetail.length).toBeGreaterThan(0);
            });

            it(`${Name} / ${mode} keeps Selectors + Variables as arrays (never undefined)`, () => {
                const report = Bundle[mode];
                expect(Array.isArray(report.Selectors)).toBe(true);
                expect(Array.isArray(report.Variables)).toBe(true);
            });
        }
    }
});

/* ================================================================== */
/*  Verbose vs non-verbose: payload toggles only the bulky fields      */
/* ================================================================== */

describe("Verbose toggle payload contract", () => {
    it("non-verbose reports omit OuterHtml/Text + null CapturedHtml", () => {
        const { NonVerbose } = fixtureReplayZeroMatches();
        // CapturedHtml at top level is null on non-verbose runs.
        expect(NonVerbose.CapturedHtml).toBeNull();
        // DomContext keeps the truncated snippets but NOT the full versions.
        expect(NonVerbose.DomContext).not.toBeNull();
        const ctx = NonVerbose.DomContext!;
        expect(ctx.OuterHtmlSnippet.length).toBeGreaterThan(0);
        expect(ctx.OuterHtmlSnippet.length).toBeLessThanOrEqual(240);
        expect(ctx.TextSnippet.length).toBeLessThanOrEqual(120);
        expect(ctx.OuterHtml).toBeUndefined();
        expect(ctx.Text).toBeUndefined();
    });

    it("verbose reports populate OuterHtml/Text + CapturedHtml mirrors DomContext.OuterHtml", () => {
        const { Verbose } = fixtureReplayZeroMatches();
        expect(Verbose.DomContext).not.toBeNull();
        const ctx = Verbose.DomContext!;
        expect(ctx.OuterHtml).toBeDefined();
        expect(ctx.Text).toBeDefined();
        expect(ctx.OuterHtml).toContain('id="go"');
        expect(ctx.Text).toBe("Go");
        // CapturedHtml is surfaced at top level for export tooling — and must
        // be byte-identical to DomContext.OuterHtml when both exist.
        expect(Verbose.CapturedHtml).toBe(ctx.OuterHtml);
    });

    it("verbose flag does NOT alter Reason / ReasonDetail / Selectors / Variables", () => {
        // The toggle gates payload size, never classification or attempt
        // outcomes — guard against accidental coupling.
        const bundle = fixtureReplayPrimaryDrift();
        expect(bundle.Verbose.Reason).toBe(bundle.NonVerbose.Reason);
        expect(bundle.Verbose.ReasonDetail).toBe(bundle.NonVerbose.ReasonDetail);
        expect(bundle.Verbose.Selectors).toEqual(bundle.NonVerbose.Selectors);
        expect(bundle.Verbose.Variables).toEqual(bundle.NonVerbose.Variables);
    });

    it("Record-phase fixture without a Target yields null DomContext + null CapturedHtml in both modes", () => {
        const { NonVerbose, Verbose } = fixtureRecordNoTarget();
        expect(NonVerbose.DomContext).toBeNull();
        expect(NonVerbose.CapturedHtml).toBeNull();
        expect(Verbose.DomContext).toBeNull();
        expect(Verbose.CapturedHtml).toBeNull();
        // Selectors come from PersistedSelector → "NotEvaluated" tail.
        expect(NonVerbose.Selectors.every((s) => s.FailureReason === "NotEvaluated")).toBe(true);
    });
});

/* ================================================================== */
/*  Reason auto-classification — fixtures pin the precedence rules     */
/* ================================================================== */

describe("Auto-classified Reason codes", () => {
    it("ReplayZeroMatches → ZeroMatches", () => {
        const { NonVerbose } = fixtureReplayZeroMatches();
        expect(NonVerbose.Reason).toBe("ZeroMatches");
        expect(NonVerbose.ReasonDetail).toContain("0 nodes");
    });

    it("ReplayPrimaryDrift → PrimaryMissedFallbackOk", () => {
        const { NonVerbose } = fixtureReplayPrimaryDrift();
        expect(NonVerbose.Reason).toBe("PrimaryMissedFallbackOk");
        expect(NonVerbose.ReasonDetail).toContain("Primary selector");
        expect(NonVerbose.ReasonDetail).toContain("fallback(s) matched");
    });

    it("ReplayVariableMissing → VariableMissing (outranks selector outcomes)", () => {
        const { NonVerbose } = fixtureReplayVariableMissing();
        expect(NonVerbose.Reason).toBe("VariableMissing");
        expect(NonVerbose.ReasonDetail).toContain("Email");
    });

    it("RecordNoTarget → NotEvaluated attempts surface as Unknown (no live evaluation happened)", () => {
        const { NonVerbose } = fixtureRecordNoTarget();
        // No live evaluation → classifier MUST NOT claim ZeroMatches.
        expect(NonVerbose.Reason).not.toBe("ZeroMatches");
    });
});

/* ================================================================== */
/*  formatFailureReport — stable, AI-pasteable text format             */
/* ================================================================== */

describe("formatFailureReport text format", () => {
    it("emits the [MarcoReplay] tag, Reason line, and at-source line for replay reports", () => {
        const { NonVerbose } = fixtureReplayZeroMatches();
        const text = formatFailureReport(NonVerbose);
        const head = text.split("\n").slice(0, 3);
        expect(head[0]).toContain("[MarcoReplay]");
        expect(head[0]).toContain("Element not found for selector '#go'");
        expect(head[1]).toMatch(/^ {2}Reason: ZeroMatches —/);
        expect(head[2]).toContain("at src/background/recorder/live-dom-replay.ts");
        expect(head[2]).toContain("StepId=7");
        expect(head[2]).toContain("Index=3");
        expect(head[2]).toContain("Kind=Click");
    });

    it("emits the [MarcoRecord] tag for record-phase reports", () => {
        const { NonVerbose } = fixtureRecordNoTarget();
        const text = formatFailureReport(NonVerbose);
        expect(text.startsWith("[MarcoRecord]")).toBe(true);
    });

    it("renders a Selectors table with ✗/✓ + primary marker + tail counts", () => {
        const { NonVerbose } = fixtureReplayPrimaryDrift();
        const text = formatFailureReport(NonVerbose);
        // Primary missed:  ✗ ✓ XPathFull …
        expect(text).toMatch(/✗ ✓ XPathFull\s+\/\/button\[@id='go'].*0 matches \(ZeroMatches/);
        // Fallback hit:    ✓ · Css …
        expect(text).toMatch(/✓ · Css\s+#go .*1 match\b/);
    });

    it("renders a Variables table when Variables is non-empty", () => {
        const { NonVerbose } = fixtureReplayVariableMissing();
        const text = formatFailureReport(NonVerbose);
        expect(text).toContain("Variables:");
        expect(text).toMatch(/✗ \{\{Email}} = .* MissingColumn/);
    });

    it("includes the verbose CapturedHtml block ONLY when Verbose=true", () => {
        const { NonVerbose, Verbose } = fixtureReplayZeroMatches();
        const offText = formatFailureReport(NonVerbose);
        const onText = formatFailureReport(Verbose);
        expect(offText).not.toContain("CapturedHtml (verbose):");
        expect(onText).toContain("CapturedHtml (verbose):");
        expect(onText).toContain('id="go"');
    });

    it("includes ResolvedXPath line when present, omits when null", () => {
        const withXPath = formatFailureReport(fixtureReplayZeroMatches().NonVerbose);
        const withoutXPath = formatFailureReport(fixtureReplayVariableMissing().NonVerbose);
        expect(withXPath).toContain("ResolvedXPath: //button[@id='go']");
        expect(withoutXPath).not.toContain("ResolvedXPath:");
    });

    it("renders the DataRow as JSON and the Stack block when StackTrace is present", () => {
        const { NonVerbose } = fixtureReplayZeroMatches();
        const text = formatFailureReport(NonVerbose);
        expect(text).toContain('DataRow: {"Email":"alice@example.com"}');
        expect(text).toContain("Stack:");
        expect(text).toContain("Error: Element not found");
    });

    it("uses the deterministic FIXTURE_NOW timestamp (no wall-clock leakage)", () => {
        // Sanity check — the fixture clock itself is deterministic.
        expect(FIXTURE_NOW().toISOString()).toBe("2026-04-26T10:00:00.000Z");
        const { NonVerbose } = fixtureReplayZeroMatches();
        expect(NonVerbose.Timestamp).toBe("2026-04-26T10:00:00.000Z");
    });
});
