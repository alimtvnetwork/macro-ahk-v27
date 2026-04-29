// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { testSelector, detectSelectorKind } from "../selector-tester";

describe("detectSelectorKind", () => {
    it("treats slash-leading and paren-leading expressions as XPath", () => {
        expect(detectSelectorKind("//button")).toBe("XPath");
        expect(detectSelectorKind("(//a)[1]")).toBe("XPath");
        expect(detectSelectorKind("./input")).toBe("XPath");
    });
    it("treats everything else as CSS", () => {
        expect(detectSelectorKind("#go")).toBe("Css");
        expect(detectSelectorKind(".primary > button")).toBe("Css");
        expect(detectSelectorKind("button[name=submit]")).toBe("Css");
    });
});

describe("testSelector", () => {
    it("counts CSS matches and snapshots the first element", () => {
        document.body.innerHTML = `
            <button class="b" id="go">Go</button>
            <button class="b">Other</button>
        `;
        const r = testSelector(".b", document);
        expect(r.Kind).toBe("Css");
        expect(r.MatchCount).toBe(2);
        expect(r.FirstMatch?.Id).toBe("go");
        expect(r.FirstMatch?.TextSnippet).toBe("Go");
        expect(r.Error).toBeNull();
    });

    it("counts XPath matches via auto-detection", () => {
        document.body.innerHTML = `<a href="/x">x</a><a href="/y">y</a>`;
        const r = testSelector("//a", document);
        expect(r.Kind).toBe("XPath");
        expect(r.MatchCount).toBe(2);
        expect(r.FirstMatch?.TagName).toBe("a");
    });

    it("reports zero matches without erroring when the DOM is empty", () => {
        document.body.innerHTML = `<div></div>`;
        const r = testSelector("#nope", document);
        expect(r.MatchCount).toBe(0);
        expect(r.FirstMatch).toBeNull();
        expect(r.Error).toBeNull();
    });

    it("captures syntax errors instead of throwing", () => {
        document.body.innerHTML = `<div></div>`;
        const r = testSelector(":::bad", document);
        expect(r.Error).not.toBeNull();
        expect(r.MatchCount).toBe(0);
    });

    it("rejects empty input with a clear error", () => {
        const r = testSelector("   ", document);
        expect(r.Error).toBe("Selector is empty");
        expect(r.MatchCount).toBe(0);
    });

    it("honours an explicit kind override", () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        // "#go" auto-detects as Css; force XPath to confirm override is used and fails cleanly.
        const r = testSelector("#go", document, "XPath");
        expect(r.Kind).toBe("XPath");
        expect(r.Error).not.toBeNull();
    });
});
