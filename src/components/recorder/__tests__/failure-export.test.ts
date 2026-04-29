/**
 * Failure-bundle exporter unit tests (Phase 09 follow-up).
 */

import { describe, it, expect } from "vitest";
import {
    buildFailureBundle,
    serializeFailureBundle,
    buildFailureBundleFilename,
    pickLastFailureReport,
    buildLastFailureFilename,
} from "../failure-export";
import { buildFailureReport, type FailureReport } from "@/background/recorder/failure-logger";
import type { EvaluatedAttempt } from "@/background/recorder/selector-attempt-evaluator";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:30:00.000Z");

function sampleReport(message: string, stepId: number): FailureReport {
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error(message),
        StepId: stepId,
        Index: stepId - 1,
        StepKind: "Click",
        SourceFile: "src/test.ts",
        Now: FIXED_NOW,
    });
}

describe("buildFailureBundle", () => {
    it("wraps reports with metadata", () => {
        const bundle = buildFailureBundle([sampleReport("a", 1), sampleReport("b", 2)], {
            Now: FIXED_NOW,
        });
        expect(bundle.Generator).toBe("marco-extension");
        expect(bundle.Version).toBe(1);
        expect(bundle.Count).toBe(2);
        expect(bundle.ExportedAt).toBe("2026-04-26T10:30:00.000Z");
        expect(bundle.Reports).toHaveLength(2);
    });

    it("preserves selected reports verbatim and tolerates an empty selection", () => {
        const empty = buildFailureBundle([], { Now: FIXED_NOW });
        expect(empty.Count).toBe(0);
        expect(empty.Reports).toEqual([]);

        const r = sampleReport("kept", 7);
        const single = buildFailureBundle([r], { Now: FIXED_NOW });
        expect(single.Reports[0]).toBe(r);
    });
});

describe("serializeFailureBundle", () => {
    it("returns parseable, pretty-printed JSON", () => {
        const bundle = buildFailureBundle([sampleReport("x", 3)], { Now: FIXED_NOW });
        const text = serializeFailureBundle(bundle);
        expect(text).toContain("\n  "); // pretty-printed
        const parsed = JSON.parse(text);
        expect(parsed.Generator).toBe("marco-extension");
        expect(parsed.Reports).toHaveLength(1);
        expect(parsed.Reports[0].Message).toContain("x");
    });
});

describe("buildFailureBundleFilename", () => {
    it("formats as marco-failure-reports-YYYY-MM-DD-HHmm.json", () => {
        const name = buildFailureBundleFilename(new Date("2026-04-26T10:30:00.000Z"));
        expect(name).toBe("marco-failure-reports-2026-04-26-1030.json");
    });
});

describe("pickLastFailureReport", () => {
    it("returns null on empty input", () => {
        expect(pickLastFailureReport([])).toBeNull();
    });

    it("returns the report with the latest Timestamp regardless of array order", () => {
        const oldReport: FailureReport = {
            ...sampleReport("old", 1),
            Timestamp: "2026-04-26T09:00:00.000Z",
        };
        const newReport: FailureReport = {
            ...sampleReport("new", 2),
            Timestamp: "2026-04-26T11:00:00.000Z",
        };
        expect(pickLastFailureReport([oldReport, newReport])).toBe(newReport);
        expect(pickLastFailureReport([newReport, oldReport])).toBe(newReport);
    });

    it("breaks ties by taking the last one in array order", () => {
        const t = "2026-04-26T10:00:00.000Z";
        const a: FailureReport = { ...sampleReport("a", 1), Timestamp: t };
        const b: FailureReport = { ...sampleReport("b", 2), Timestamp: t };
        expect(pickLastFailureReport([a, b])).toBe(b);
    });
});

describe("buildLastFailureFilename", () => {
    it("includes the StepId tag when present", () => {
        const r = sampleReport("x", 7);
        const name = buildLastFailureFilename(r, new Date("2026-04-26T10:30:00.000Z"));
        expect(name).toBe("marco-last-failure-step7-2026-04-26-1030.json");
    });

    it("omits the StepId tag when absent", () => {
        const r: FailureReport = { ...sampleReport("x", 1), StepId: null };
        const name = buildLastFailureFilename(r, new Date("2026-04-26T10:30:00.000Z"));
        expect(name).toBe("marco-last-failure-2026-04-26-1030.json");
    });
});

describe("last-failure export — round-trip preserves EvaluatedAttempts", () => {
    it("single-report JSON includes every Selector entry with Strategy/Matched/MatchCount/FailureReason", () => {
        const evaluated: ReadonlyArray<EvaluatedAttempt> = [
            {
                SelectorId: 1, Strategy: "XPathFull",
                Expression: "//button[@id='go']", ResolvedExpression: "//button[@id='go']",
                IsPrimary: true, Matched: false, MatchCount: 0,
                FailureReason: "ZeroMatches", FailureDetail: "Returned 0 nodes",
            },
            {
                SelectorId: 2, Strategy: "Css",
                Expression: "#go", ResolvedExpression: "#go",
                IsPrimary: false, Matched: true, MatchCount: 1,
                FailureReason: "Matched", FailureDetail: null,
            },
        ];
        const report = buildFailureReport({
            Phase: "Replay",
            Error: new Error("Element not found"),
            StepId: 7, Index: 2, StepKind: "Click",
            SourceFile: "src/test.ts",
            Now: FIXED_NOW,
            EvaluatedAttempts: evaluated,
        });

        const text = JSON.stringify(report, null, 2);
        const parsed = JSON.parse(text) as FailureReport;

        expect(parsed.Selectors).toHaveLength(2);
        expect(parsed.Selectors[0].Strategy).toBe("XPathFull");
        expect(parsed.Selectors[0].IsPrimary).toBe(true);
        expect(parsed.Selectors[0].Matched).toBe(false);
        expect(parsed.Selectors[0].MatchCount).toBe(0);
        expect(parsed.Selectors[0].FailureReason).toBe("ZeroMatches");
        expect(parsed.Selectors[0].FailureDetail).toBe("Returned 0 nodes");
        expect(parsed.Selectors[1].Strategy).toBe("Css");
        expect(parsed.Selectors[1].Matched).toBe(true);
        expect(parsed.Selectors[1].MatchCount).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Per-step lookup (Step-picker export)                               */
/* ------------------------------------------------------------------ */

import {
    listStepFailureOptions,
    pickFailureReportByStepId,
} from "../failure-export";

function reportAt(stepId: number | null, ts: string, kind: string | null = "Click"): FailureReport {
    const r = buildFailureReport({
        Phase: "Replay",
        Error: new Error("x"),
        StepId: stepId ?? undefined,
        StepKind: kind ?? undefined,
        SourceFile: "src/test.ts",
        Now: () => new Date(ts),
    });
    // buildFailureReport defaults StepId/StepKind to null when undefined; ensure we honor null intent.
    return { ...r, StepId: stepId, StepKind: kind, Timestamp: ts };
}

describe("listStepFailureOptions", () => {
    it("returns empty array for empty input", () => {
        expect(listStepFailureOptions([])).toEqual([]);
    });

    it("groups by StepId, counts occurrences, and tracks LatestTimestamp", () => {
        const opts = listStepFailureOptions([
            reportAt(1, "2026-04-26T10:00:00.000Z"),
            reportAt(2, "2026-04-26T10:05:00.000Z"),
            reportAt(1, "2026-04-26T10:10:00.000Z"),
        ]);
        const step1 = opts.find((o) => o.StepId === 1);
        const step2 = opts.find((o) => o.StepId === 2);
        expect(step1?.Count).toBe(2);
        expect(step1?.LatestTimestamp).toBe("2026-04-26T10:10:00.000Z");
        expect(step2?.Count).toBe(1);
    });

    it("sorts most-recent-first and sinks null StepId to the bottom", () => {
        const opts = listStepFailureOptions([
            reportAt(null, "2026-04-26T11:00:00.000Z"),
            reportAt(1, "2026-04-26T10:00:00.000Z"),
            reportAt(2, "2026-04-26T10:30:00.000Z"),
        ]);
        expect(opts.map((o) => o.StepId)).toEqual([2, 1, null]);
    });

    it("uses the most recent StepKind for the bucket label", () => {
        const opts = listStepFailureOptions([
            reportAt(1, "2026-04-26T10:00:00.000Z", "Click"),
            reportAt(1, "2026-04-26T10:05:00.000Z", "Type"),
        ]);
        expect(opts[0].StepKind).toBe("Type");
    });
});

describe("pickFailureReportByStepId", () => {
    it("returns null when no report matches the StepId", () => {
        expect(pickFailureReportByStepId([reportAt(1, "2026-04-26T10:00:00.000Z")], 99))
            .toBeNull();
    });

    it("returns the latest report for the given StepId", () => {
        const a = reportAt(1, "2026-04-26T10:00:00.000Z");
        const b = reportAt(1, "2026-04-26T10:05:00.000Z");
        const c = reportAt(2, "2026-04-26T10:10:00.000Z");
        expect(pickFailureReportByStepId([a, b, c], 1)).toBe(b);
    });

    it("matches StepId === null explicitly (not just falsy)", () => {
        const noid = reportAt(null, "2026-04-26T10:00:00.000Z");
        const withid = reportAt(0, "2026-04-26T10:05:00.000Z");
        expect(pickFailureReportByStepId([noid, withid], null)).toBe(noid);
        expect(pickFailureReportByStepId([noid, withid], 0)).toBe(withid);
    });
});

/* ------------------------------------------------------------------ */
/*  Export format (pretty vs minified)                                 */
/* ------------------------------------------------------------------ */

import {
    serializeJson,
    DEFAULT_EXPORT_FORMAT,
    type ExportFormat,
} from "../failure-export";

describe("serializeJson", () => {
    it("default format is pretty (2-space indent, multi-line)", () => {
        expect(DEFAULT_EXPORT_FORMAT).toBe("pretty");
        const out = serializeJson({ a: 1, b: [2, 3] }, "pretty");
        expect(out).toContain("\n  ");
        expect(out.split("\n").length).toBeGreaterThan(1);
    });

    it("minified format produces a single line with no indent whitespace", () => {
        const out = serializeJson({ a: 1, b: [2, 3] }, "minified");
        expect(out).not.toContain("\n");
        expect(out).toBe('{"a":1,"b":[2,3]}');
    });

    it("both formats produce JSON.parse-equivalent output", () => {
        const value = { Phase: "Replay", Selectors: [], Verbose: false };
        for (const fmt of ["pretty", "minified"] as ReadonlyArray<ExportFormat>) {
            expect(JSON.parse(serializeJson(value, fmt))).toEqual(value);
        }
    });
});

describe("serializeFailureBundle — format param", () => {
    it("defaults to pretty when no format passed (back-compat)", () => {
        const bundle = buildFailureBundle([sampleReport("x", 1)], { Now: FIXED_NOW });
        const out = serializeFailureBundle(bundle);
        expect(out).toContain("\n  ");
    });

    it("emits a single line when format='minified'", () => {
        const bundle = buildFailureBundle([sampleReport("x", 1)], { Now: FIXED_NOW });
        const out = serializeFailureBundle(bundle, "minified");
        expect(out).not.toContain("\n");
        // Bundle wrapper still parseable.
        const parsed = JSON.parse(out);
        expect(parsed.Generator).toBe("marco-extension");
        expect(parsed.Reports).toHaveLength(1);
    });

    it("minified is strictly smaller than pretty for the same payload", () => {
        const bundle = buildFailureBundle([sampleReport("x", 1), sampleReport("y", 2)], {
            Now: FIXED_NOW,
        });
        const pretty = serializeFailureBundle(bundle, "pretty");
        const min = serializeFailureBundle(bundle, "minified");
        expect(min.length).toBeLessThan(pretty.length);
    });
});
