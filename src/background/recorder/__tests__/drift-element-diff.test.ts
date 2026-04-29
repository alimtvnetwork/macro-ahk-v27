/**
 * Tests — Drift Element Diff
 */

import { describe, it, expect } from "vitest";
import { diffDriftElements } from "../drift-element-diff";
import type { DomContext } from "../failure-logger";

const ctx = (overrides: Partial<DomContext> = {}): DomContext => ({
    TagName: "button",
    Id: "submit-btn",
    ClassName: "btn primary",
    AriaLabel: "Submit form",
    Name: null,
    Type: "submit",
    TextSnippet: "Submit",
    OuterHtmlSnippet: "<button id=\"submit-btn\" class=\"btn primary\">Submit</button>",
    ...overrides,
});

describe("diffDriftElements", () => {
    it("returns Identical verdict and no changes when both snapshots are equal", () => {
        const a = ctx();
        const result = diffDriftElements(a, ctx());
        expect(result.Verdict).toBe("Identical");
        expect(result.HasChanges).toBe(false);
        expect(result.Fields.every((f) => f.Change === "Unchanged")).toBe(true);
    });

    it("classifies an id rename as RenamedIdentity", () => {
        const result = diffDriftElements(ctx(), ctx({ Id: "submit-btn-v2" }));
        expect(result.Verdict).toBe("RenamedIdentity");
        const idField = result.Fields.find((f) => f.Field === "Id")!;
        expect(idField.Change).toBe("Modified");
        expect(idField.Primary).toBe("submit-btn");
        expect(idField.Fallback).toBe("submit-btn-v2");
    });

    it("classifies a tag change as DifferentElement", () => {
        const result = diffDriftElements(ctx(), ctx({ TagName: "a" }));
        expect(result.Verdict).toBe("DifferentElement");
    });

    it("classifies pure attribute/text changes as AttributeDrift", () => {
        const result = diffDriftElements(ctx(), ctx({ TextSnippet: "Submit now" }));
        expect(result.Verdict).toBe("AttributeDrift");
        expect(result.HasChanges).toBe(true);
    });

    it("computes class list add/remove/shared", () => {
        const result = diffDriftElements(
            ctx({ ClassName: "btn primary large" }),
            ctx({ ClassName: "btn secondary large rounded" }),
        );
        expect(result.ClassList.Shared).toEqual(["btn", "large"]);
        expect(result.ClassList.Removed).toEqual(["primary"]);
        expect(result.ClassList.Added).toEqual(["rounded", "secondary"]);
    });

    it("flags Added when primary value is null/empty", () => {
        const result = diffDriftElements(ctx({ Name: null }), ctx({ Name: "email" }));
        const f = result.Fields.find((x) => x.Field === "Name")!;
        expect(f.Change).toBe("Added");
    });

    it("flags Removed when fallback value is null", () => {
        const result = diffDriftElements(ctx({ AriaLabel: "Submit" }), ctx({ AriaLabel: null }));
        const f = result.Fields.find((x) => x.Field === "AriaLabel")!;
        expect(f.Change).toBe("Removed");
    });

    it("returns FallbackMissing when fallback is null", () => {
        const result = diffDriftElements(ctx(), null);
        expect(result.Verdict).toBe("FallbackMissing");
        expect(result.Fields.every((f) => f.Fallback === null)).toBe(true);
    });

    it("returns PrimaryMissing when primary is null", () => {
        const result = diffDriftElements(null, ctx());
        expect(result.Verdict).toBe("PrimaryMissing");
        expect(result.Fields.every((f) => f.Primary === null)).toBe(true);
    });

    it("returns PrimaryMissing with empty diff when both sides are null", () => {
        const result = diffDriftElements(null, null);
        expect(result.Verdict).toBe("PrimaryMissing");
        expect(result.Fields).toEqual([]);
        expect(result.HasChanges).toBe(false);
    });
});
