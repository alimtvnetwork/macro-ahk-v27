// @vitest-environment jsdom

/**
 * Marco Extension — FailureReport JSON Snapshot Tests
 *
 * Locks down the canonical `FailureReport` JSON shape emitted by the
 * three high-traffic instruction families:
 *
 *   1. **UrlTabClick** — every `UrlTabClickReason`.
 *   2. **Condition Wait / Gate** — `ConditionTimeout` for a compound tree.
 *   3. **XPath/CSS predicate** — single-leaf `InvalidSelector` for both
 *      dialects (covers the `XPathSyntaxError` / `CssSyntaxError`
 *      classification fork) and `ZeroMatches`.
 *
 * Every produced report is normalized (deterministic timestamp,
 * stack-trace stripped, CapturedHtml/FormSnapshot/DomContext nulled
 * when empty) and snapshotted to disk. CI fails the build the moment
 * a schema-breaking edit silently changes the wire format — including:
 *
 *   - field renames (`Reason` → `ReasonCode`)
 *   - field removals (e.g. dropping `Variables`)
 *   - changes to `ReasonDetail` formatting that downstream parsers
 *     and AI debuggers depend on
 *   - reorderings that break stable diffs
 *
 * The snapshots are intentionally produced with sorted keys so
 * additive changes (a new optional field appended) show up as a
 * single localized diff rather than a reshuffle.
 *
 * @see ./instruction-failure-adapters.test.ts — sister tests that
 *      assert *structural* requirements (validator, required fields,
 *      bundle shape). Snapshots here lock the *exact* wire format.
 * @see scripts/check-failure-log-schema.mjs   — build-time twin.
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

import { describe, expect, it } from "vitest";
import type { FailureReport } from "../failure-logger";
import {
    buildConditionFailureReport,
    buildSelectorPredicateFailureReport,
    buildUrlTabClickFailureReport,
    type UrlTabClickReason,
} from "../instruction-failure-adapters";
import type { Condition } from "../condition-evaluator";

/** Stable clock — every snapshot stamps this exact ISO timestamp. */
const FIXED_NOW = (): Date => new Date("2026-04-26T10:00:00.000Z");

/* ------------------------------------------------------------------ */
/*  Snapshot normalization                                             */
/* ------------------------------------------------------------------ */

/**
 * Strip values that vary between runs / Node versions but DO NOT
 * affect the wire schema. Keeps every key — only sanitizes values.
 *
 * - `StackTrace`: `new Error()` produces a stack with absolute paths
 *   and line numbers that change every time the source file moves.
 *   We replace it with a literal sentinel so renames in this test
 *   file don't cascade through every snapshot.
 * - Recursively stable-sorts object keys so the on-disk JSON is
 *   diff-friendly: an additive field shows up as a single insertion
 *   rather than a full re-shuffle.
 */
function normalize(report: FailureReport): unknown {
    const cloned = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    if (typeof cloned.StackTrace === "string" && cloned.StackTrace.length > 0) {
        cloned.StackTrace = "<stripped-for-snapshot>";
    }
    return sortKeys(cloned);
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value as Record<string, unknown>).sort()) {
            out[k] = sortKeys((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
}

/* ================================================================== */
/*  1. UrlTabClick — every reason                                       */
/* ================================================================== */

const URL_TAB_CLICK_REASONS: ReadonlyArray<UrlTabClickReason> = [
    "UrlTabClickTimeout",
    "TabNotFound",
    "InvalidUrlPattern",
    "SelectorNotFound",
    "UrlPatternMismatch",
];

describe("FailureReport snapshots — UrlTabClick", () => {
    it.each(URL_TAB_CLICK_REASONS)(
        "matches the canonical JSON for reason=%s",
        (reason) => {
            const report = buildUrlTabClickFailureReport({
                Failure: {
                    Reason: reason,
                    Detail: `simulated ${reason}`,
                    UrlPattern: "https://app.example.com/orders/*",
                    UrlMatch: "Glob",
                    Mode: "OpenOrFocus",
                    ObservedUrl: "https://app.example.com/orders/42",
                    Selector: "a.open-orders",
                    SelectorKind: "Css",
                    TimeoutMs: 5_000,
                    DurationMs: 5_001,
                },
                StepId: 901,
                Index: 3,
                Now: FIXED_NOW,
            });
            expect(normalize(report)).toMatchSnapshot();
        },
    );

    it("matches the canonical JSON when optional fields are omitted", () => {
        const report = buildUrlTabClickFailureReport({
            Failure: {
                Reason: "TabNotFound",
                Detail: "no matching tab",
                UrlPattern: "https://x.test/",
                UrlMatch: "Exact",
                Mode: "FocusExisting",
                TimeoutMs: 1_000,
                DurationMs: 1_000,
                // No ObservedUrl, Selector, or SelectorKind — proves the
                // serializer omits them cleanly without producing
                // `undefined` placeholders in the snapshot.
            },
            StepId: 1, Index: 0, Now: FIXED_NOW,
        });
        expect(normalize(report)).toMatchSnapshot();
    });
});

/* ================================================================== */
/*  2. Condition Wait / Gate — compound tree timeout                    */
/* ================================================================== */

const SAMPLE_COMPOUND_CONDITION: Condition = {
    All: [
        { Selector: "//button[@id='submit']", Matcher: { Kind: "Visible" } },
        { Not: { Selector: ".loading", Matcher: { Kind: "Visible" } } },
    ],
};

describe("FailureReport snapshots — Condition wait", () => {
    it("matches the canonical JSON for a Gate ConditionTimeout", () => {
        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 2_050,
                Polls: 41,
                Reason: "ConditionTimeout",
                Detail: "Condition not met within 2000ms",
                LastEvaluation: [
                    {
                        Selector: "//button[@id='submit']",
                        Kind: "XPath",
                        Matcher: "Visible",
                        Result: false,
                        Detail: "no match",
                    },
                    {
                        Selector: ".loading",
                        Kind: "Css",
                        Matcher: "Visible",
                        Result: true,
                    },
                ],
            },
            Condition: SAMPLE_COMPOUND_CONDITION,
            Source: "Gate",
            StepId: 501,
            Index: 2,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        expect(normalize(report)).toMatchSnapshot();
    });

    it("matches the canonical JSON for a dedicated ConditionStep failure", () => {
        const report = buildConditionFailureReport({
            Outcome: {
                Ok: false,
                DurationMs: 1_500,
                Polls: 30,
                Reason: "ConditionTimeout",
                Detail: "predicate stayed false for 1500ms",
                LastEvaluation: [
                    {
                        Selector: "#status",
                        Kind: "Css",
                        Matcher: "TextEquals",
                        Result: false,
                        Detail: "got 'pending'",
                    },
                ],
            },
            Condition: {
                Selector: "#status",
                Matcher: { Kind: "TextEquals", Value: "done" },
            },
            Source: "ConditionStep",
            StepId: 502,
            Index: 7,
            StepKind: "Condition",
            Now: FIXED_NOW,
        });
        expect(normalize(report)).toMatchSnapshot();
    });
});

/* ================================================================== */
/*  3. XPath/CSS predicate — InvalidSelector + ZeroMatches              */
/* ================================================================== */

describe("FailureReport snapshots — XPath/CSS predicate", () => {
    it("matches the canonical JSON for an XPath InvalidSelector", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "//button[@id=", // unterminated predicate
            SelectorKind: "Auto",       // Auto detects XPath via leading `/`
            Reason: "InvalidSelector",
            Detail: "Unexpected end of expression",
            StepId: 701,
            Index: 1,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        // Sanity: this MUST classify as XPathSyntaxError, not CssSyntaxError.
        expect(report.Reason).toBe("XPathSyntaxError");
        expect(normalize(report)).toMatchSnapshot();
    });

    it("matches the canonical JSON for a CSS InvalidSelector", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "div..broken",     // double-dot is invalid CSS
            SelectorKind: "Css",
            Reason: "InvalidSelector",
            Detail: "Expected identifier after '.'",
            StepId: 702,
            Index: 1,
            StepKind: "Click",
            Now: FIXED_NOW,
        });
        expect(report.Reason).toBe("CssSyntaxError");
        expect(normalize(report)).toMatchSnapshot();
    });

    it("matches the canonical JSON for a ZeroMatches predicate failure", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "#never-rendered",
            SelectorKind: "Css",
            Reason: "ZeroMatches",
            Detail: "0 elements matched",
            StepId: 703,
            Index: 4,
            StepKind: "Wait",
            Now: FIXED_NOW,
        });
        expect(report.Reason).toBe("ZeroMatches");
        expect(normalize(report)).toMatchSnapshot();
    });

    it("matches the canonical JSON for a predicate ConditionTimeout", () => {
        const report = buildSelectorPredicateFailureReport({
            Selector: "//*[@data-state='ready']",
            SelectorKind: "XPath",
            Reason: "ConditionTimeout",
            Detail: "predicate never became true",
            StepId: 704,
            Index: 5,
            StepKind: "Wait",
            Now: FIXED_NOW,
        });
        expect(report.Reason).toBe("Timeout");
        expect(normalize(report)).toMatchSnapshot();
    });
});
