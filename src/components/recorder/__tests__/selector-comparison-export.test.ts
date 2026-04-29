/**
 * selector-comparison-export unit tests.
 */

import { describe, it, expect } from "vitest";
import {
    buildSelectorComparisonBundle,
    serializeSelectorComparisonBundle,
    buildSelectorComparisonFilename,
} from "../selector-comparison-export";
import type { SelectorComparison } from "@/background/recorder/selector-comparison";

const FIXED_NOW = (): Date => new Date("2026-04-26T10:30:00.000Z");

function sampleComparison(): SelectorComparison {
    return {
        Attempts: [
            {
                SelectorId: 1,
                Kind: "XPathFull",
                Expression: '//button[@id="go"]',
                ResolvedExpression: '//button[@id="go"]',
                IsPrimary: true,
                Matched: false,
                MatchCount: 0,
                Element: null,
                Error: null,
            },
            {
                SelectorId: 2,
                Kind: "Css",
                Expression: ".primary",
                ResolvedExpression: ".primary",
                IsPrimary: false,
                Matched: true,
                MatchCount: 2,
                Element: {
                    TagName: "button", Id: null, ClassName: "primary",
                    AriaLabel: null, Name: null, Type: null,
                    TextSnippet: "Go", OuterHtmlSnippet: "<button class=\"primary\">Go</button>",
                },
                Error: null,
            },
        ],
        PrimaryMatched: false,
        AnyFallbackMatched: true,
        DriftDetected: true,
    };
}

describe("buildSelectorComparisonBundle", () => {
    it("wraps the comparison with metadata", () => {
        const bundle = buildSelectorComparisonBundle(sampleComparison(), {
            StepId: 7, Url: "https://example.com/login", Now: FIXED_NOW,
        });
        expect(bundle.Generator).toBe("marco-extension");
        expect(bundle.Kind).toBe("SelectorComparison");
        expect(bundle.Version).toBe(1);
        expect(bundle.StepId).toBe(7);
        expect(bundle.Url).toBe("https://example.com/login");
        expect(bundle.ExportedAt).toBe("2026-04-26T10:30:00.000Z");
        expect(bundle.Comparison.DriftDetected).toBe(true);
    });

    it("preserves errors and resolved expressions verbatim", () => {
        const cmp = sampleComparison();
        // Inject an error on the primary selector to confirm it round-trips.
        const withError: SelectorComparison = {
            ...cmp,
            Attempts: cmp.Attempts.map((a, i) => i === 0
                ? { ...a, Error: "Invalid XPath: unexpected token", ResolvedExpression: '//form//button[@id="go"]' }
                : a),
        };
        const bundle = buildSelectorComparisonBundle(withError, { Now: FIXED_NOW });
        const text = serializeSelectorComparisonBundle(bundle);
        const parsed = JSON.parse(text);
        expect(parsed.Comparison.Attempts[0].Error).toBe("Invalid XPath: unexpected token");
        expect(parsed.Comparison.Attempts[0].ResolvedExpression).toBe('//form//button[@id="go"]');
    });

    it("defaults StepId/Url to null when omitted", () => {
        const bundle = buildSelectorComparisonBundle(sampleComparison(), { Now: FIXED_NOW });
        expect(bundle.StepId).toBeNull();
        expect(bundle.Url).toBeNull();
    });
});

describe("serializeSelectorComparisonBundle", () => {
    it("returns parseable, pretty-printed JSON", () => {
        const bundle = buildSelectorComparisonBundle(sampleComparison(), { Now: FIXED_NOW });
        const text = serializeSelectorComparisonBundle(bundle);
        expect(text).toContain("\n  ");
        expect(JSON.parse(text).Kind).toBe("SelectorComparison");
    });
});

describe("buildSelectorComparisonFilename", () => {
    it("includes the step id and a UTC timestamp", () => {
        expect(buildSelectorComparisonFilename(7, new Date("2026-04-26T10:30:00.000Z")))
            .toBe("marco-selector-comparison-step7-2026-04-26-1030.json");
    });

    it("falls back to step-na when StepId is null", () => {
        expect(buildSelectorComparisonFilename(null, new Date("2026-04-26T10:30:00.000Z")))
            .toBe("marco-selector-comparison-step-na-2026-04-26-1030.json");
    });
});
