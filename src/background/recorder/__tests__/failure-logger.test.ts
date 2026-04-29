// @vitest-environment jsdom

/**
 * Phase 09 — Failure Logger unit tests.
 *
 * Covers the structured FailureReport produced for both Record and Replay
 * pipelines: stack trace extraction, selector listing, DOM context capture,
 * data-row inclusion, and human-readable formatting suitable for AI paste.
 */

import { describe, it, expect, vi } from "vitest";
import {
    buildFailureReport,
    formatFailureReport,
    logFailure,
} from "../failure-logger";
import { SelectorKindId } from "../../recorder-db-schema";
import type { PersistedSelector } from "../step-persistence";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

const SELECTORS: PersistedSelector[] = [
    {
        SelectorId: 100, StepId: 7,
        SelectorKindId: SelectorKindId.XPathFull,
        Expression: "//button[@id='go']",
        AnchorSelectorId: null, IsPrimary: 1,
    },
    {
        SelectorId: 101, StepId: 7,
        SelectorKindId: SelectorKindId.Css,
        Expression: "#go",
        AnchorSelectorId: null, IsPrimary: 0,
    },
];

describe("buildFailureReport", () => {
    it("captures phase, message, stack, and source file", () => {
        const err = new Error("boom");
        const report = buildFailureReport({
            Phase: "Replay", Error: err, SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(report.Phase).toBe("Replay");
        expect(report.Message).toBe("boom");
        expect(report.StackTrace).toContain("Error: boom");
        expect(report.SourceFile).toBe("src/x.ts");
        expect(report.Timestamp).toBe("2026-04-26T10:00:00.000Z");
    });

    it("normalizes non-Error throws (string + object)", () => {
        const a = buildFailureReport({ Phase: "Record", Error: "plain", SourceFile: "x", Now: FIXED_NOW });
        expect(a.Message).toBe("plain");
        expect(a.StackTrace).toBeNull();

        const b = buildFailureReport({ Phase: "Record", Error: { code: 42 }, SourceFile: "x", Now: FIXED_NOW });
        expect(b.Message).toBe('{"code":42}');
    });

    it("converts persisted selectors into Strategy/Expression/IsPrimary attempts", () => {
        const report = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Selectors: SELECTORS, SourceFile: "x", Now: FIXED_NOW,
        });
        expect(report.Selectors).toEqual([
            {
                SelectorId: 100, Strategy: "XPathFull",
                Expression: "//button[@id='go']", ResolvedExpression: "//button[@id='go']",
                IsPrimary: true, Matched: false, MatchCount: 0,
                FailureReason: "NotEvaluated", FailureDetail: null,
            },
            {
                SelectorId: 101, Strategy: "Css",
                Expression: "#go", ResolvedExpression: "#go",
                IsPrimary: false, Matched: false, MatchCount: 0,
                FailureReason: "NotEvaluated", FailureDetail: null,
            },
        ]);
    });

    it("captures DOM context attributes from the target element", () => {
        document.body.innerHTML = `
            <button id="go" class="primary lg" name="submit" type="button" aria-label="Send">Go!</button>
        `;
        const btn = document.getElementById("go")!;
        const report = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Target: btn, SourceFile: "x", Now: FIXED_NOW,
        });
        expect(report.DomContext).not.toBeNull();
        expect(report.DomContext!.TagName).toBe("button");
        expect(report.DomContext!.Id).toBe("go");
        expect(report.DomContext!.ClassName).toBe("primary lg");
        expect(report.DomContext!.AriaLabel).toBe("Send");
        expect(report.DomContext!.Name).toBe("submit");
        expect(report.DomContext!.Type).toBe("button");
        expect(report.DomContext!.TextSnippet).toBe("Go!");
    });

    it("records data row when supplied", () => {
        const report = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            DataRow: { Email: "a@x.com" },
            SourceFile: "x", Now: FIXED_NOW,
        });
        expect(report.DataRow).toEqual({ Email: "a@x.com" });
    });
});

describe("formatFailureReport", () => {
    it("produces a multi-line block with [MarcoReplay] tag and selector list", () => {
        const report = buildFailureReport({
            Phase: "Replay", Error: new Error("Element not found"),
            StepId: 7, Index: 2, StepKind: "Click",
            Selectors: SELECTORS,
            ResolvedXPath: "//button[@id='go']",
            DataRow: { Email: "a@x.com" },
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        const out = formatFailureReport(report);
        expect(out).toContain("[MarcoReplay] Element not found");
        expect(out).toContain("Reason: Unknown");
        expect(out).toContain("XPathFull");
        expect(out).toContain("Css");
        expect(out).toContain("at src/x.ts StepId=7 Index=2 Kind=Click");
        expect(out).toContain("ResolvedXPath: //button[@id='go']");
        expect(out).toContain('DataRow: {"Email":"a@x.com"}');
        expect(out).toContain("Stack:");
    });

    it("uses [MarcoRecord] tag for the recording phase", () => {
        const report = buildFailureReport({
            Phase: "Record", Error: new Error("anchor missing"),
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(formatFailureReport(report)).toMatch(/^\[MarcoRecord\] anchor missing/);
    });
});

describe("logFailure", () => {
    it("returns the report and writes the formatted output to console.error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const report = logFailure({
            Phase: "Replay", Error: new Error("boom"),
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(report.Message).toBe("boom");
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0]![0]).toContain("[MarcoReplay] boom");
        spy.mockRestore();
    });
});

describe("buildFailureReport — Reason classification & EvaluatedAttempts", () => {
    it("auto-classifies as NoSelectors when no selectors are supplied", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("NoSelectors");
        expect(r.ReasonDetail).toContain("no persisted selectors");
    });

    it("auto-classifies as ZeroMatches when every attempt missed", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "XPathFull", Expression: "//a", ResolvedExpression: "//a",
                  IsPrimary: true,  Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no nodes" },
                { SelectorId: 2, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: false, Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no nodes" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("ZeroMatches");
        expect(r.ReasonDetail).toContain("//a");
        expect(r.ReasonDetail).toContain("#x");
    });

    it("auto-classifies as PrimaryMissedFallbackOk when fallback rescued a missed primary", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "XPathFull", Expression: "//a", ResolvedExpression: "//a",
                  IsPrimary: true,  Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no nodes" },
                { SelectorId: 2, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: false, Matched: true,  MatchCount: 1, FailureReason: "Matched",     FailureDetail: null },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("PrimaryMissedFallbackOk");
        expect(r.ReasonDetail).toContain("//a");
        expect(r.ReasonDetail).toContain("1 fallback");
    });

    it("escalates to XPathSyntaxError when any attempt threw", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "XPathFull", Expression: "//[[", ResolvedExpression: "//[[",
                  IsPrimary: true, Matched: false, MatchCount: 0, FailureReason: "XPathSyntaxError", FailureDetail: "bad token" },
                { SelectorId: 2, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: false, Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("XPathSyntaxError");
        expect(r.ReasonDetail).toBe("bad token");
    });

    it("respects an explicit Reason supplied by the caller", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("timed out"),
            Reason: "Timeout", ReasonDetail: "Wait exceeded 5000ms",
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("Timeout");
        expect(r.ReasonDetail).toBe("Wait exceeded 5000ms");
    });

    it("formatter prints per-attempt match count and FailureReason", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("missed"),
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "XPathFull", Expression: "//a", ResolvedExpression: "//a",
                  IsPrimary: true,  Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no nodes" },
                { SelectorId: 2, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: false, Matched: true,  MatchCount: 1, FailureReason: "Matched",     FailureDetail: null },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        const out = formatFailureReport(r);
        expect(out).toContain("Reason: PrimaryMissedFallbackOk");
        expect(out).toContain("✗ ✓ XPathFull");          // missed primary
        expect(out).toContain("→ 0 matches (ZeroMatches");
        expect(out).toContain("✓ · Css");                 // matched fallback
        expect(out).toContain("→ 1 match");
    });
});

describe("buildFailureReport — Variables (VariableContext)", () => {
    it("auto-classifies VariableMissing when a variable lacks a column", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Variables: [
                { Name: "Email", Source: "Row", RowIndex: 0, Column: "Email",
                  ResolvedValue: null, ValueType: "undefined",
                  FailureReason: "MissingColumn", FailureDetail: "Variable {{Email}} is not a column" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("VariableMissing");
        expect(r.ReasonDetail).toContain("Email");
    });

    it("auto-classifies VariableNull when a variable is null", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Variables: [
                { Name: "Phone", Source: "Row", RowIndex: 1, Column: "Phone",
                  ResolvedValue: null, ValueType: "null",
                  FailureReason: "NullValue", FailureDetail: "Variable {{Phone}} resolved to null" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("VariableNull");
    });

    it("auto-classifies VariableTypeMismatch over selector failures (variables outrank)", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Variables: [
                { Name: "Payload", Source: "Row", RowIndex: 0, Column: "Payload",
                  ResolvedValue: "{\"a\":1}", ValueType: "object",
                  FailureReason: "TypeMismatch", FailureDetail: "expected string but got object" },
            ],
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: true, Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("VariableTypeMismatch");
        expect(r.ReasonDetail).toContain("expected string but got object");
    });

    it("does NOT misclassify when every variable resolved cleanly", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("dom miss"),
            Variables: [
                { Name: "Email", Source: "Row", RowIndex: 0, Column: "Email",
                  ResolvedValue: "a@x.io", ValueType: "string",
                  FailureReason: "Resolved", FailureDetail: null },
            ],
            EvaluatedAttempts: [
                { SelectorId: 1, Strategy: "Css", Expression: "#x", ResolvedExpression: "#x",
                  IsPrimary: true, Matched: false, MatchCount: 0, FailureReason: "ZeroMatches", FailureDetail: "no" },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        expect(r.Reason).toBe("ZeroMatches");
    });

    it("formatter renders Variables section with name, value, type, source, and reason", () => {
        const r = buildFailureReport({
            Phase: "Replay", Error: new Error("x"),
            Variables: [
                { Name: "Email", Source: "DataSource:Customers", RowIndex: 3, Column: "Email",
                  ResolvedValue: null, ValueType: "undefined",
                  FailureReason: "MissingColumn", FailureDetail: "no column" },
                { Name: "Name", Source: "DataSource:Customers", RowIndex: 3, Column: "Name",
                  ResolvedValue: "Alice", ValueType: "string",
                  FailureReason: "Resolved", FailureDetail: null },
            ],
            SourceFile: "src/x.ts", Now: FIXED_NOW,
        });
        const out = formatFailureReport(r);
        expect(out).toContain("Variables:");
        expect(out).toContain("✗ {{Email}}");
        expect(out).toContain("MissingColumn");
        expect(out).toContain("DataSource:Customers");
        expect(out).toContain("✓ {{Name}}");
        expect(out).toContain('"Alice"');
    });
});
