// @vitest-environment jsdom

/**
 * Marco Extension — JS Step Diagnostics tests.
 *
 * Verifies that JS-step (StepKindId = 4 / `JsInline`) failures flow
 * through the canonical `FailureReport` schema with the same required
 * fields as recorder/replay failures, and that the verbose toggle gates
 * payload only — never classification.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics
 *   - plan.md → "Logging & Diagnostics Enforcement" → LOG-1, LOG-2, LOG-5
 */

import { beforeEach, describe, expect, it } from "vitest";
import { formatFailureReport, type FailureReport } from "../failure-logger";
import {
    JsExecError,
    JsValidationError,
    type JsInlineContext,
    type JsInlineResult,
} from "../js-step-sandbox";
import {
    buildJsStepFailureReport,
    buildJsStepVariableContext,
    runJsStepWithDiagnostics,
} from "../js-step-diagnostics";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

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

const SOURCE_FILE = "src/background/recorder/js-step-sandbox.ts";

beforeEach(() => {
    document.body.innerHTML = "";
});

/* ================================================================== */
/*  buildJsStepVariableContext                                         */
/* ================================================================== */

describe("buildJsStepVariableContext", () => {
    it("explodes Vars and Row into deterministic alphabetical VariableContext entries", () => {
        const ctx: JsInlineContext = {
            Vars: { Zeta: "z", Alpha: "a" },
            Row: { Email: "alice@example.com", Age: "33" },
        };
        const vars = buildJsStepVariableContext(ctx);
        expect(vars.map((v) => `${v.Source}:${v.Name}`)).toEqual([
            "Vars:Alpha",
            "Vars:Zeta",
            "Row:Age",
            "Row:Email",
        ]);
        // Every entry is Resolved — JS body already saw the values.
        expect(vars.every((v) => v.FailureReason === "Resolved")).toBe(true);
        expect(vars.every((v) => v.FailureDetail === null)).toBe(true);
    });

    it("masks sensitive keys (password, token, otp, …) with *** in both Vars and Row", () => {
        const ctx: JsInlineContext = {
            Vars: { Password: "p4ssw0rd", AuthToken: "abc.def.ghi", Email: "x@y.z" },
            Row: { OTP: "123456", CreditCard: "4111-1111-1111-1111" },
        };
        const vars = buildJsStepVariableContext(ctx);
        const byName = new Map(vars.map((v) => [v.Name, v.ResolvedValue]));
        expect(byName.get("Password")).toBe("***");
        expect(byName.get("AuthToken")).toBe("***");
        expect(byName.get("OTP")).toBe("***");
        expect(byName.get("CreditCard")).toBe("***");
        // Non-sensitive Email passes through.
        expect(byName.get("Email")).toBe("x@y.z");
    });

    it("handles null Row gracefully (Vars-only context)", () => {
        const vars = buildJsStepVariableContext({ Vars: { A: "1" }, Row: null });
        expect(vars).toHaveLength(1);
        expect(vars[0]).toMatchObject({ Source: "Vars", Name: "A", ResolvedValue: "1" });
    });

    it("preserves empty-string values verbatim (does not coerce to null)", () => {
        const vars = buildJsStepVariableContext({
            Vars: { Empty: "" },
            Row: { Blank: "" },
        });
        const byName = new Map(vars.map((v) => [v.Name, v.ResolvedValue]));
        expect(byName.get("Empty")).toBe("");
        expect(byName.get("Blank")).toBe("");
    });
});

/* ================================================================== */
/*  buildJsStepFailureReport — schema parity                           */
/* ================================================================== */

describe("buildJsStepFailureReport schema parity", () => {
    function makeReport(
        err: unknown,
        verbose: boolean,
        logs: ReadonlyArray<string> = [],
    ): FailureReport {
        return buildJsStepFailureReport({
            Body: "return Ctx.Row.Email.toUpperCase();",
            Error: err,
            Context: {
                Vars: { TenantId: "acme" },
                Row: { Email: "alice@example.com" },
            },
            LogLines: logs,
            StepId: 42,
            Index: 7,
            SourceFile: SOURCE_FILE,
            Verbose: verbose,
            Now: FIXED_NOW,
            DataRow: { Email: "alice@example.com" },
        });
    }

    for (const verbose of [false, true] as const) {
        it(`declares every REQUIRED_REPORT_FIELD (Verbose=${verbose})`, () => {
            const report = makeReport(new JsExecError("InlineJs execution failed: TypeError: x is undefined"), verbose);
            for (const field of REQUIRED_REPORT_FIELDS) {
                expect(
                    Object.prototype.hasOwnProperty.call(report, field),
                    `Missing required field '${String(field)}' in JS-step report (Verbose=${verbose})`,
                ).toBe(true);
            }
            expect(report.Phase).toBe("Replay");
            expect(report.StepKind).toBe("JsInline");
            expect(report.Reason).toBe("JsThrew");
            expect(report.SourceFile).toBe(SOURCE_FILE);
            expect(report.Verbose).toBe(verbose);
            expect(report.Timestamp).toBe("2026-04-26T10:00:00.000Z");
        });
    }

    it("classifies JsValidationError as 'Validation: …'", () => {
        const report = makeReport(new JsValidationError("InlineJs body cannot be empty"), false);
        expect(report.ReasonDetail).toBe("Validation: InlineJs body cannot be empty");
    });

    it("classifies JsExecError as 'Runtime: …' and strips the sandbox prefix", () => {
        const report = makeReport(
            new JsExecError("InlineJs execution failed: TypeError: x is undefined"),
            false,
        );
        expect(report.ReasonDetail).toMatch(/^Runtime: TypeError: x is undefined/);
        // body hint appended.
        expect(report.ReasonDetail).toContain("(in: return Ctx.Row.Email.toUpperCase();)");
    });

    it("classifies non-Error throws by JSON-stringifying", () => {
        const report = makeReport({ code: 42 }, false);
        expect(report.ReasonDetail).toBe('Runtime: {"code":42}');
    });

    it("populates Variables with Vars+Row+JsLog entries in order", () => {
        const report = makeReport(new JsExecError("boom"), false, ["entered hot path", "got value=null"]);
        const sources = report.Variables.map((v) => v.Source);
        // Vars first, then Row, then JsLog (preserves caller intent).
        expect(sources).toEqual(["Vars", "Row", "JsLog", "JsLog"]);
        expect(report.Variables[2]).toMatchObject({
            Name: "Log[0]", Source: "JsLog", ResolvedValue: "entered hot path",
        });
        expect(report.Variables[3]).toMatchObject({
            Name: "Log[1]", Source: "JsLog", ResolvedValue: "got value=null",
        });
    });

    it("Selectors is always an empty array (JS steps have none) — schema-required field still present", () => {
        const report = makeReport(new JsExecError("boom"), false);
        expect(Array.isArray(report.Selectors)).toBe(true);
        expect(report.Selectors).toHaveLength(0);
    });

    it("DomContext is null and CapturedHtml is null — no DOM target for JS steps", () => {
        const report = makeReport(new JsExecError("boom"), true);
        expect(report.DomContext).toBeNull();
        expect(report.CapturedHtml).toBeNull();
        expect(report.FormSnapshot).toBeNull();
    });
});

/* ================================================================== */
/*  Verbose toggle: payload-only gating                                */
/* ================================================================== */

describe("Verbose toggle never alters JS-step classification", () => {
    const ctx: JsInlineContext = {
        Vars: { TenantId: "acme", Password: "p4ssw0rd" },
        Row: { Email: "alice@example.com" },
    };
    const longLog = "x".repeat(500);

    function build(verbose: boolean): FailureReport {
        return buildJsStepFailureReport({
            Body: "throw new Error('nope');",
            Error: new JsExecError("InlineJs execution failed: nope"),
            Context: ctx,
            LogLines: [longLog],
            SourceFile: SOURCE_FILE,
            Verbose: verbose,
            Now: FIXED_NOW,
        });
    }

    it("Reason / ReasonDetail / Vars+Row entries identical across modes", () => {
        const off = build(false);
        const on = build(true);
        expect(on.Reason).toBe(off.Reason);
        expect(on.ReasonDetail).toBe(off.ReasonDetail);
        // Compare only the non-log entries — log truncation differs by mode.
        const nonLog = (r: FailureReport) => r.Variables.filter((v) => v.Source !== "JsLog");
        expect(nonLog(on)).toEqual(nonLog(off));
    });

    it("masks sensitive Vars in BOTH modes (verbose flag does not unmask)", () => {
        const off = build(false);
        const on = build(true);
        const pwdOff = off.Variables.find((v) => v.Name === "Password");
        const pwdOn = on.Variables.find((v) => v.Name === "Password");
        expect(pwdOff?.ResolvedValue).toBe("***");
        expect(pwdOn?.ResolvedValue).toBe("***");
    });

    it("truncates JsLog entries to 240 chars on non-verbose, full length on verbose", () => {
        const off = build(false);
        const on = build(true);
        const offLog = off.Variables.find((v) => v.Source === "JsLog");
        const onLog = on.Variables.find((v) => v.Source === "JsLog");
        expect(offLog?.ResolvedValue?.length).toBe(240);
        expect(offLog?.ResolvedValue?.endsWith("…")).toBe(true);
        expect(onLog?.ResolvedValue?.length).toBe(500);
    });
});

/* ================================================================== */
/*  formatFailureReport renders JS-step reports cleanly                */
/* ================================================================== */

describe("formatFailureReport for JS-step reports", () => {
    it("emits [MarcoReplay] tag, JsThrew Reason line, and Variables table", () => {
        const report = buildJsStepFailureReport({
            Body: "return Ctx.Row.Missing;",
            Error: new JsExecError("InlineJs execution failed: TypeError: cannot read 'Missing'"),
            Context: { Vars: { Tenant: "acme" }, Row: { Email: "x@y.z" } },
            LogLines: ["pre-throw log"],
            StepId: 99, Index: 4,
            SourceFile: SOURCE_FILE,
            Verbose: false,
            Now: FIXED_NOW,
        });
        const text = formatFailureReport(report);
        expect(text).toContain("[MarcoReplay]");
        expect(text).toContain("Reason: JsThrew —");
        expect(text).toContain("Kind=JsInline");
        expect(text).toContain("Variables:");
        expect(text).toMatch(/✓ \{\{Tenant}} = .* from Vars/);
        expect(text).toMatch(/✓ \{\{Email}} = .* from Row/);
        expect(text).toMatch(/✓ \{\{Log\[0]}} = .* from JsLog/);
    });
});

/* ================================================================== */
/*  runJsStepWithDiagnostics — converts throws into reports            */
/* ================================================================== */

describe("runJsStepWithDiagnostics", () => {
    const ctx: JsInlineContext = { Vars: { A: "1" }, Row: null };

    it("returns IsOk: true with the sandbox result on success", async () => {
        const fakeResult: JsInlineResult = { ReturnValue: 42, LogLines: [], DurationMs: 3 };
        const outcome = await runJsStepWithDiagnostics("ignored", ctx, {
            SourceFile: SOURCE_FILE,
            Run: async () => fakeResult,
        });
        expect(outcome.IsOk).toBe(true);
        if (outcome.IsOk) {
            expect(outcome.Result).toBe(fakeResult);
        }
    });

    it("returns IsOk: false with a canonical FailureReport on throw — never re-throws", async () => {
        const outcome = await runJsStepWithDiagnostics("throw new Error('boom');", ctx, {
            SourceFile: SOURCE_FILE,
            Verbose: false,
            Now: FIXED_NOW,
            Run: async () => {
                throw new JsExecError("InlineJs execution failed: boom");
            },
        });
        expect(outcome.IsOk).toBe(false);
        if (!outcome.IsOk) {
            const report = outcome.FailureReport;
            expect(report.Reason).toBe("JsThrew");
            expect(report.ReasonDetail).toMatch(/^Runtime: boom/);
            expect(report.SourceFile).toBe(SOURCE_FILE);
            // Schema check.
            for (const field of REQUIRED_REPORT_FIELDS) {
                expect(Object.prototype.hasOwnProperty.call(report, field)).toBe(true);
            }
        }
    });
});
