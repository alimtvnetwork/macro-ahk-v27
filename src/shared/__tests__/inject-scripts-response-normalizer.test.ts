/**
 * Marco — Unit tests for `normalizeInjectScriptsResponse`.
 *
 * Locks in the backward-compatibility contract between the popup UI and
 * the background `INJECT_SCRIPTS` handler:
 *
 *   - When the background sends `inlineSyntaxErrorDetected`, the
 *     normalized value must reflect it exactly and the source must be
 *     `"wire"`.
 *   - When the background omits the field (older build) the normalized
 *     value must default to `false` with source `"legacy-default"`,
 *     so UI conditionals never receive `undefined` and accidentally
 *     short-circuit.
 *   - Garbage inputs (`null`, missing `results`, non-boolean flag) must
 *     not throw — older message relays could send any of these.
 */

import { describe, it, expect } from "vitest";
import {
    normalizeInjectScriptsResponse,
    type InjectScriptsResponse,
    type InjectionResult,
} from "../injection-types";

const sampleResults: InjectionResult[] = [
    { scriptId: "s1", scriptName: "alpha.js", isSuccess: true, durationMs: 10 },
    { scriptId: "s2", scriptName: "beta.js", isSuccess: false, durationMs: 4, errorMessage: "boom" },
];

describe("normalizeInjectScriptsResponse", () => {
    it("preserves results and reports source=wire when flag is true", () => {
        const raw: InjectScriptsResponse = {
            results: sampleResults,
            inlineSyntaxErrorDetected: true,
        };
        const out = normalizeInjectScriptsResponse(raw);
        expect(out.results).toEqual(sampleResults);
        expect(out.inlineSyntaxErrorDetected).toBe(true);
        expect(out.inlineSyntaxFlagSource).toBe("wire");
    });

    it("preserves results and reports source=wire when flag is false", () => {
        const raw: InjectScriptsResponse = {
            results: sampleResults,
            inlineSyntaxErrorDetected: false,
        };
        const out = normalizeInjectScriptsResponse(raw);
        expect(out.inlineSyntaxErrorDetected).toBe(false);
        expect(out.inlineSyntaxFlagSource).toBe("wire");
    });

    it("defaults missing flag to false and reports source=legacy-default (older background build)", () => {
        // Simulates a popup talking to a background that pre-dates the
        // `inlineSyntaxErrorDetected` field. Prior to this normalizer
        // the popup would read `undefined` and any `if (...)` branch
        // would silently fall through.
        const raw = { results: sampleResults } as InjectScriptsResponse;
        const out = normalizeInjectScriptsResponse(raw);
        expect(out.inlineSyntaxErrorDetected).toBe(false);
        expect(out.inlineSyntaxFlagSource).toBe("legacy-default");
        expect(out.results).toEqual(sampleResults);
    });

    it("treats a non-boolean flag as legacy-default (corrupted relay or mock typo)", () => {
        // Non-boolean values can leak through misconfigured mocks or a
        // broken relay; we treat them the same as missing rather than
        // coercing — coercion would mask the corruption.
        const raw = {
            results: sampleResults,
            inlineSyntaxErrorDetected: "yes" as unknown as boolean,
        } as InjectScriptsResponse;
        const out = normalizeInjectScriptsResponse(raw);
        expect(out.inlineSyntaxErrorDetected).toBe(false);
        expect(out.inlineSyntaxFlagSource).toBe("legacy-default");
    });

    it("returns an empty results array when results is missing", () => {
        const raw = { inlineSyntaxErrorDetected: true } as unknown as InjectScriptsResponse;
        const out = normalizeInjectScriptsResponse(raw);
        expect(out.results).toEqual([]);
        expect(out.inlineSyntaxErrorDetected).toBe(true);
        expect(out.inlineSyntaxFlagSource).toBe("wire");
    });

    it("returns a safe shape for null/undefined input without throwing", () => {
        const fromNull = normalizeInjectScriptsResponse(null);
        expect(fromNull.results).toEqual([]);
        expect(fromNull.inlineSyntaxErrorDetected).toBe(false);
        expect(fromNull.inlineSyntaxFlagSource).toBe("legacy-default");

        const fromUndef = normalizeInjectScriptsResponse(undefined);
        expect(fromUndef.results).toEqual([]);
        expect(fromUndef.inlineSyntaxErrorDetected).toBe(false);
        expect(fromUndef.inlineSyntaxFlagSource).toBe("legacy-default");
    });
});
