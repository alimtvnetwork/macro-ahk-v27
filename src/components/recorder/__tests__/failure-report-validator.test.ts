/**
 * Unit tests for the export-time FailureReport validator.
 *
 * Mirrors the schema enforced by `scripts/check-failure-log-schema.mjs`
 * but verifies it at the JSON-payload level (what the user actually
 * downloads).
 */

import { describe, it, expect } from "vitest";
import { validateFailureReportPayload } from "../failure-report-validator";
import { buildFailureReport } from "@/background/recorder/failure-logger";
import {
    buildFailureBundle,
    serializeFailureBundle,
} from "../failure-export";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:30:00.000Z");

function goodReport() {
    return buildFailureReport({
        Phase: "Replay",
        Error: new Error("boom"),
        StepId: 1, Index: 0, StepKind: "Click",
        SourceFile: "src/test.ts",
        Now: FIXED_NOW,
    });
}

describe("validateFailureReportPayload — happy paths", () => {
    it("accepts a single well-formed report (object input)", () => {
        const r = goodReport();
        const result = validateFailureReportPayload(r);
        expect(result.Valid).toBe(true);
        expect(result.ReportsChecked).toBe(1);
        expect(result.Summary).toBe("");
    });

    it("accepts a serialized bundle round-trip (string input)", () => {
        const bundle = buildFailureBundle([goodReport(), goodReport()], { Now: FIXED_NOW });
        const text = serializeFailureBundle(bundle);
        const result = validateFailureReportPayload(text);
        expect(result.Valid).toBe(true);
        expect(result.ReportsChecked).toBe(2);
    });

    it("accepts an empty bundle (Count=0, Reports=[])", () => {
        const bundle = buildFailureBundle([], { Now: FIXED_NOW });
        const result = validateFailureReportPayload(bundle);
        expect(result.Valid).toBe(true);
        expect(result.ReportsChecked).toBe(0);
    });
});

describe("validateFailureReportPayload — root-level malformations", () => {
    it("flags invalid JSON string", () => {
        const result = validateFailureReportPayload("{not json");
        expect(result.Valid).toBe(false);
        expect(result.RootIssues[0].Path).toBe("$");
        expect(result.RootIssues[0].Actual).toContain("invalid JSON");
    });

    it("rejects null / array / primitive payloads", () => {
        for (const bad of [null, 42, "plain string", [1, 2, 3]]) {
            const result = validateFailureReportPayload(bad);
            expect(result.Valid).toBe(false);
            expect(result.RootIssues[0].Path).toBe("$");
        }
    });

    it("flags missing bundle wrapper fields", () => {
        const broken = { Reports: [goodReport()] }; // no Generator/Version/ExportedAt/Count
        const result = validateFailureReportPayload(broken);
        expect(result.Valid).toBe(false);
        const missing = result.RootIssues.filter((i) => i.Problem === "missing").map((i) => i.Path);
        expect(missing).toEqual(expect.arrayContaining(["Generator", "Version", "ExportedAt", "Count"]));
    });

    it("flags Reports field of wrong type", () => {
        const result = validateFailureReportPayload({
            Generator: "x", Version: 1, ExportedAt: "now", Count: 0, Reports: "not-array",
        });
        expect(result.Valid).toBe(false);
        expect(result.RootIssues.some((i) => i.Path === "Reports" && i.Problem === "wrong-type")).toBe(true);
    });
});

describe("validateFailureReportPayload — per-report malformations", () => {
    it("flags missing required field on a single report", () => {
        const r = goodReport();
        const broken = { ...r } as unknown as Record<string, unknown>;
        delete broken.Verbose;
        const result = validateFailureReportPayload(broken);
        expect(result.Valid).toBe(false);
        expect(result.ReportIssues.some((i) => i.Path === "Verbose" && i.Problem === "missing")).toBe(true);
        expect(result.Summary).toContain("Verbose");
    });

    it("flags wrong type (string Verbose instead of boolean)", () => {
        const r = goodReport();
        const broken = { ...r, Verbose: "yes" } as unknown;
        const result = validateFailureReportPayload(broken);
        expect(result.Valid).toBe(false);
        const issue = result.ReportIssues.find((i) => i.Path === "Verbose");
        expect(issue?.Problem).toBe("wrong-type");
        expect(issue?.Expected).toBe("boolean");
        expect(issue?.Actual).toBe("string");
    });

    it("flags null where field forbids null (Selectors must be array)", () => {
        const r = goodReport();
        const broken = { ...r, Selectors: null } as unknown;
        const result = validateFailureReportPayload(broken);
        expect(result.Valid).toBe(false);
        const issue = result.ReportIssues.find((i) => i.Path === "Selectors");
        expect(issue?.Problem).toBe("null-not-allowed");
    });

    it("scopes paths inside a bundle (Reports[1].SourceFile)", () => {
        const good = goodReport();
        const broken = { ...good } as unknown as Record<string, unknown>;
        delete broken.SourceFile;
        const bundle = buildFailureBundle([good, broken as never], { Now: FIXED_NOW });
        const result = validateFailureReportPayload(bundle);
        expect(result.Valid).toBe(false);
        expect(
            result.ReportIssues.some((i) => i.Path === "Reports[1].SourceFile" && i.Problem === "missing"),
        ).toBe(true);
    });

    it("summary mentions count when more than one issue exists", () => {
        const r = goodReport();
        const broken = { ...r, Verbose: 1, Selectors: null } as unknown;
        const result = validateFailureReportPayload(broken);
        expect(result.Valid).toBe(false);
        expect(result.Summary).toMatch(/\(\+\d+ more\)/);
    });
});

describe("validateFailureReportPayload — schema parity with build-time guard", () => {
    it("requires every field listed in REQUIRED_REPORT_FIELDS", () => {
        const requiredFields = [
            "Phase", "Reason", "ReasonDetail", "StackTrace", "StepId",
            "Index", "StepKind", "Selectors", "Variables", "DomContext",
            "ResolvedXPath", "Timestamp", "SourceFile", "Verbose",
        ];
        for (const field of requiredFields) {
            const r = goodReport() as unknown as Record<string, unknown>;
            const broken = { ...r };
            delete broken[field];
            const result = validateFailureReportPayload(broken);
            expect(result.Valid, `missing ${field} should fail`).toBe(false);
            expect(
                result.ReportIssues.some((i) => i.Path === field),
                `should report ${field} as the issue`,
            ).toBe(true);
        }
    });
});
