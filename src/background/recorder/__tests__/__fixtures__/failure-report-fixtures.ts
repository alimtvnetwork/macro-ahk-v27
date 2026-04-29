// @vitest-environment jsdom

/**
 * Marco Extension — Failure Report Fixtures
 *
 * Canonical sample `FailureReport` objects covering the main pipelines
 * (Record / Replay) and both verbose modes. Used by:
 *
 *   - `failure-report-fixtures.test.ts` (this folder) — schema/format checks.
 *   - Any future UI snapshot tests for `FailureDetailsPanel` /
 *     `SelectorReplayTracePanel` that need a deterministic report.
 *
 * Every fixture is built via `buildFailureReport` (the production code path)
 * — never hand-rolled object literals — so the build-time schema guard at
 * `scripts/check-failure-log-schema.mjs` continues to apply, and any future
 * field added to `FailureReport` is automatically present in every fixture.
 *
 * Conformance:
 *   - mem://standards/verbose-logging-and-failure-diagnostics
 *   - mem://standards/error-logging-requirements
 */

import {
    buildFailureReport,
    type FailureReport,
} from "../../failure-logger";
import type { PersistedSelector } from "../../step-persistence";
import type { EvaluatedAttempt } from "../../selector-attempt-evaluator";
import type { VariableContext } from "../../field-reference-resolver";
import { SelectorKindId } from "../../../recorder-db-schema";
import { JsExecError } from "../../js-step-sandbox";
import { buildJsStepFailureReport } from "../../js-step-diagnostics";

/** Deterministic clock — every fixture uses this so timestamps are stable. */
export const FIXTURE_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

/* ------------------------------------------------------------------ */
/*  Source data                                                        */
/* ------------------------------------------------------------------ */

const SELECTORS_PRIMARY_AND_FALLBACK: ReadonlyArray<PersistedSelector> = [
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

const ATTEMPTS_ZERO_MATCHES: ReadonlyArray<EvaluatedAttempt> = [
    {
        SelectorId: 100, Strategy: "XPathFull",
        Expression: "//button[@id='go']", ResolvedExpression: "//button[@id='go']",
        IsPrimary: true, Matched: false, MatchCount: 0,
        FailureReason: "ZeroMatches",
        FailureDetail: "XPath returned 0 nodes.",
    },
    {
        SelectorId: 101, Strategy: "Css",
        Expression: "#go", ResolvedExpression: "#go",
        IsPrimary: false, Matched: false, MatchCount: 0,
        FailureReason: "ZeroMatches",
        FailureDetail: "querySelectorAll returned 0 nodes.",
    },
];

const ATTEMPTS_PRIMARY_MISS_FALLBACK_OK: ReadonlyArray<EvaluatedAttempt> = [
    {
        SelectorId: 100, Strategy: "XPathFull",
        Expression: "//button[@id='go']", ResolvedExpression: "//button[@id='go']",
        IsPrimary: true, Matched: false, MatchCount: 0,
        FailureReason: "ZeroMatches",
        FailureDetail: "XPath returned 0 nodes — selector drift.",
    },
    {
        SelectorId: 101, Strategy: "Css",
        Expression: "#go", ResolvedExpression: "#go",
        IsPrimary: false, Matched: true, MatchCount: 1,
        FailureReason: "Matched", FailureDetail: null,
    },
];

const VARIABLES_OK: ReadonlyArray<VariableContext> = [
    {
        Name: "Email", Source: "DataSource:Customers",
        RowIndex: 3, Column: "Email",
        ResolvedValue: "alice@example.com", ValueType: "string",
        FailureReason: "Resolved", FailureDetail: null,
    },
];

const VARIABLES_MISSING: ReadonlyArray<VariableContext> = [
    {
        Name: "Email", Source: "DataSource:Customers",
        RowIndex: 3, Column: "Email",
        ResolvedValue: null, ValueType: "undefined",
        FailureReason: "MissingColumn",
        FailureDetail: "Column 'Email' not present in row #3.",
    },
];

/** Build a target element parented to a real document so jsdom-dependent
 *  helpers like `xpathOfElement` produce a non-empty string. */
function makeTargetElement(): Element {
    const host = document.createElement("div");
    host.id = "host";
    host.innerHTML = `<button id="go" name="submit" type="button" aria-label="Go now">Go</button>`;
    document.body.appendChild(host);
    const btn = host.querySelector("button");
    if (btn === null) {
        throw new Error("Fixture setup failed: <button> not found in jsdom.");
    }
    return btn;
}

/* ------------------------------------------------------------------ */
/*  Fixture factories                                                  */
/*                                                                     */
/*  Each scenario is exposed as a function (not a frozen object) so    */
/*  callers can attach a fresh DOM element per test — sharing one      */
/*  detached node across tests would break jsdom isolation.            */
/* ------------------------------------------------------------------ */

export interface FixtureBundle {
    readonly NonVerbose: FailureReport;
    readonly Verbose: FailureReport;
}

/** Replay-phase: every selector returned 0 nodes. */
export function fixtureReplayZeroMatches(): FixtureBundle {
    const target = makeTargetElement();
    const err = new Error("Element not found for selector '#go'");
    const base = {
        Phase: "Replay" as const,
        Error: err,
        StepId: 7,
        Index: 3,
        StepKind: "Click",
        EvaluatedAttempts: ATTEMPTS_ZERO_MATCHES,
        Variables: VARIABLES_OK,
        Target: target,
        DataRow: { Email: "alice@example.com" },
        ResolvedXPath: "//button[@id='go']",
        SourceFile: "src/background/recorder/live-dom-replay.ts",
        Now: FIXTURE_NOW,
        FormSnapshot: null,
    };
    return {
        NonVerbose: buildFailureReport({ ...base, Verbose: false }),
        Verbose: buildFailureReport({ ...base, Verbose: true }),
    };
}

/** Replay-phase: primary missed but fallback matched (drift signal). */
export function fixtureReplayPrimaryDrift(): FixtureBundle {
    const target = makeTargetElement();
    const err = new Error("Primary selector drifted; fallback used.");
    const base = {
        Phase: "Replay" as const,
        Error: err,
        StepId: 7, Index: 3, StepKind: "Click",
        EvaluatedAttempts: ATTEMPTS_PRIMARY_MISS_FALLBACK_OK,
        Variables: VARIABLES_OK,
        Target: target,
        DataRow: { Email: "alice@example.com" },
        ResolvedXPath: "#go",
        SourceFile: "src/background/recorder/live-dom-replay.ts",
        Now: FIXTURE_NOW,
        FormSnapshot: null,
    };
    return {
        NonVerbose: buildFailureReport({ ...base, Verbose: false }),
        Verbose: buildFailureReport({ ...base, Verbose: true }),
    };
}

/** Replay-phase: variable missing — outranks selector outcomes. */
export function fixtureReplayVariableMissing(): FixtureBundle {
    const target = makeTargetElement();
    const err = new Error("Field reference {{Email}} — column missing in row");
    const base = {
        Phase: "Replay" as const,
        Error: err,
        StepId: 7, Index: 3, StepKind: "Type",
        EvaluatedAttempts: ATTEMPTS_PRIMARY_MISS_FALLBACK_OK,
        Variables: VARIABLES_MISSING,
        Target: target,
        DataRow: { /* Email intentionally missing */ },
        ResolvedXPath: null,
        SourceFile: "src/background/recorder/live-dom-replay.ts",
        Now: FIXTURE_NOW,
        FormSnapshot: null,
    };
    return {
        NonVerbose: buildFailureReport({ ...base, Verbose: false }),
        Verbose: buildFailureReport({ ...base, Verbose: true }),
    };
}

/**
 * Record-phase: persisted selectors only, no live DOM evaluation, no Target.
 * Verifies the fixture set still complies with the schema when DomContext is
 * absent — the build-time guard requires the *fields* to exist, not values.
 */
export function fixtureRecordNoTarget(): FixtureBundle {
    const err = new Error("Recorder failed to capture click target.");
    const base = {
        Phase: "Record" as const,
        Error: err,
        StepId: 12, Index: 0, StepKind: "Click",
        Selectors: SELECTORS_PRIMARY_AND_FALLBACK,
        Variables: [],
        DataRow: undefined,
        ResolvedXPath: undefined,
        SourceFile: "src/background/recorder/capture-step-recorder.ts",
        Now: FIXTURE_NOW,
        FormSnapshot: null,
    };
    return {
        NonVerbose: buildFailureReport({ ...base, Verbose: false }),
        Verbose: buildFailureReport({ ...base, Verbose: true }),
    };
}

/**
 * Replay-phase: `JsInline` step body threw inside the sandbox. Built via
 * the JS-step diagnostics helper so the fixture exercises the same code
 * path the recorder uses in production. Verifies the JS-step report
 * complies with the same required-field schema as DOM-target failures.
 */
export function fixtureReplayJsInlineThrew(): FixtureBundle {
    const err = new JsExecError(
        "InlineJs execution failed: TypeError: cannot read 'Email'",
    );
    const ctx = {
        Vars: { TenantId: "acme", AuthToken: "secret-abc" },
        Row: { Email: "alice@example.com" },
    };
    const base = {
        Body: "return Ctx.Row.Email.toUpperCase();",
        Error: err,
        Context: ctx,
        LogLines: ["entered hot path"],
        StepId: 18,
        Index: 4,
        SourceFile: "src/background/recorder/js-step-sandbox.ts",
        Now: FIXTURE_NOW,
        DataRow: { Email: "alice@example.com" },
    };
    return {
        NonVerbose: buildJsStepFailureReport({ ...base, Verbose: false }),
        Verbose: buildJsStepFailureReport({ ...base, Verbose: true }),
    };
}

/** Convenience — every fixture, used by the schema test. */
export function allFixtures(): ReadonlyArray<{ Name: string; Bundle: FixtureBundle }> {
    return [
        { Name: "ReplayZeroMatches",       Bundle: fixtureReplayZeroMatches() },
        { Name: "ReplayPrimaryDrift",      Bundle: fixtureReplayPrimaryDrift() },
        { Name: "ReplayVariableMissing",   Bundle: fixtureReplayVariableMissing() },
        { Name: "RecordNoTarget",          Bundle: fixtureRecordNoTarget() },
        { Name: "ReplayJsInlineThrew",     Bundle: fixtureReplayJsInlineThrew() },
    ];
}
