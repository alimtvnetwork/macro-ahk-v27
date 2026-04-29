/**
 * Phase 06 — XPath Capture Engine unit tests.
 *
 * Covers: anchor detection, relative XPath construction, label-based
 * PascalCase variable suggestion, and end-to-end capture-payload determinism.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    findAutoAnchor,
    isAncestor,
    buildRelativeXPath,
} from "../xpath-anchor-strategies";
import {
    suggestVariableName,
    toPascalCase,
    resolveLabelText,
} from "../xpath-label-suggester";
import { buildCapturePayload } from "../xpath-recorder";

const FIXTURE = `
<main>
  <form id="ContactForm">
    <fieldset>
      <legend>Contact Details</legend>
      <label for="EmailField">Email Address</label>
      <input id="EmailField" type="email" placeholder="you@example.com" />
      <label>Wrap Phone <input data-testid="PhoneInput" type="tel" /></label>
      <input aria-label="Search Query" type="search" />
      <input placeholder="Zip Code" type="text" />
      <input type="text" />
    </fieldset>
  </form>
</main>
`;

beforeEach(() => {
    document.body.innerHTML = FIXTURE;
});

/* ------------------------------------------------------------------ */
/*  Anchor strategies                                                  */
/* ------------------------------------------------------------------ */

describe("findAutoAnchor", () => {
    it("returns the nearest <label> for a wrapped input", () => {
        const input = document.querySelector('[data-testid="PhoneInput"]')!;
        expect(findAutoAnchor(input)?.tagName).toBe("LABEL");
    });

    it("falls back to <fieldset> when no label wraps the element", () => {
        const input = document.querySelector("#EmailField")!;
        expect(findAutoAnchor(input)?.tagName).toBe("FIELDSET");
    });
});

describe("isAncestor + buildRelativeXPath", () => {
    it("rejects non-ancestors", () => {
        const a = document.querySelector("#EmailField")!;
        const b = document.querySelector('[data-testid="PhoneInput"]')!;
        expect(isAncestor(a, b)).toBe(false);
        expect(buildRelativeXPath(b, a)).toBeNull();
    });

    it("produces a relative path shorter than the full path", () => {
        const input = document.querySelector("#EmailField")!;
        const anchor = document.querySelector("fieldset")!;
        const relative = buildRelativeXPath(input, anchor)!;
        expect(relative.startsWith("./")).toBe(true);
        expect(relative.length).toBeLessThan(40);
    });
});

/* ------------------------------------------------------------------ */
/*  Label suggester                                                    */
/* ------------------------------------------------------------------ */

describe("toPascalCase", () => {
    it("PascalCases hyphens, underscores, and spaces", () => {
        expect(toPascalCase("email address")).toBe("EmailAddress");
        expect(toPascalCase("first-name_field")).toBe("FirstNameField");
    });

    it("falls back to Element when input is empty or pure punctuation", () => {
        expect(toPascalCase("")).toBe("Element");
        expect(toPascalCase("!!!")).toBe("Element");
    });

    it("prefixes Element when name starts with a digit", () => {
        expect(toPascalCase("3rd party")).toBe("Element3rdParty");
    });
});

describe("resolveLabelText", () => {
    it("uses for=ID label when present", () => {
        const input = document.querySelector("#EmailField")!;
        expect(resolveLabelText(input)).toBe("Email Address");
    });

    it("uses wrapping label", () => {
        const input = document.querySelector('[data-testid="PhoneInput"]')!;
        expect(resolveLabelText(input)).toContain("Wrap Phone");
    });

    it("uses aria-label", () => {
        const input = document.querySelector('[type="search"]')!;
        expect(resolveLabelText(input)).toBe("Search Query");
    });

    it("uses placeholder", () => {
        const input = document.querySelector('[placeholder="Zip Code"]')!;
        expect(resolveLabelText(input)).toBe("Zip Code");
    });
});

describe("suggestVariableName", () => {
    it("returns PascalCase from the resolved label source", () => {
        const input = document.querySelector("#EmailField")!;
        expect(suggestVariableName(input)).toBe("EmailAddress");
    });

    it("falls back to the tag name for a totally bare element", () => {
        const bareInput = document.querySelectorAll("fieldset > input")[3]!;
        expect(suggestVariableName(bareInput)).toBe("Input");
    });
});

/* ------------------------------------------------------------------ */
/*  End-to-end capture payload                                         */
/* ------------------------------------------------------------------ */

describe("buildCapturePayload", () => {
    it("produces a complete payload for an input with an id", () => {
        const input = document.querySelector("#EmailField")!;
        const payload = buildCapturePayload(input);

        expect(payload.type).toBe("XPATH_CAPTURED");
        expect(payload.Strategy).toBe("id");
        expect(payload.XPathFull).toBe('//*[@id="EmailField"]');
        expect(payload.SuggestedVariableName).toBe("EmailAddress");
        expect(payload.AnchorXPath).not.toBeNull();
        // Relative path is built positionally from the auto-anchor regardless
        // of which full-XPath strategy won — both projections are useful.
        expect(payload.XPathRelative).toMatch(/^\.\//);
    });

    it("is deterministic for the same DOM (no random/timestamps in selector)", () => {
        const input = document.querySelector("#EmailField")!;
        const a = buildCapturePayload(input);
        const b = buildCapturePayload(input);

        expect(a.XPathFull).toBe(b.XPathFull);
        expect(a.Strategy).toBe(b.Strategy);
        expect(a.SuggestedVariableName).toBe(b.SuggestedVariableName);
        expect(a.AnchorXPath).toBe(b.AnchorXPath);
    });

    it("includes Strategy=testid when only data-testid is present", () => {
        const input = document.querySelector('[data-testid="PhoneInput"]')!;
        const payload = buildCapturePayload(input);
        expect(payload.Strategy).toBe("testid");
        expect(payload.SuggestedVariableName).toContain("WrapPhone");
    });
});
