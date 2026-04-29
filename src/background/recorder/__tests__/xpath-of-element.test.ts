// @vitest-environment jsdom

/**
 * xpath-of-element unit tests — covers id-anchored shortcut, positional
 * fallback, and detached/null inputs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { xpathOfElement } from "../xpath-of-element";

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("xpathOfElement", () => {
    it("returns empty string for null", () => {
        expect(xpathOfElement(null)).toBe("");
    });

    it("uses id shortcut when id is unique in the document", () => {
        document.body.innerHTML = `<div><button id="go">Go</button></div>`;
        const el = document.getElementById("go");
        expect(xpathOfElement(el)).toBe("//*[@id='go']");
    });

    it("falls back to positional path when id is duplicated", () => {
        document.body.innerHTML = `
            <div>
                <span id="dup">a</span>
                <span id="dup">b</span>
            </div>
        `;
        const second = document.querySelectorAll("#dup")[1] as Element;
        const path = xpathOfElement(second);
        // Positional fallback — exact tag chain, second span position
        expect(path).toMatch(/\/html\/body\[\d+\]\/div\[\d+\]\/span\[2\]$/);
    });

    it("emits 1-based position among same-tag siblings", () => {
        document.body.innerHTML = `
            <ul>
                <li>a</li>
                <li>b</li>
                <li>c</li>
            </ul>
        `;
        const items = document.querySelectorAll("li");
        expect(xpathOfElement(items[0])).toMatch(/\/li\[1\]$/);
        expect(xpathOfElement(items[1])).toMatch(/\/li\[2\]$/);
        expect(xpathOfElement(items[2])).toMatch(/\/li\[3\]$/);
    });

    it("respects UseIdShortcut=false", () => {
        document.body.innerHTML = `<button id="go">Go</button>`;
        const el = document.getElementById("go");
        const path = xpathOfElement(el, { UseIdShortcut: false });
        expect(path).not.toBe("//*[@id='go']");
        expect(path).toMatch(/\/button\[1\]$/);
    });

    it("walks up to the html root for elements without ids", () => {
        document.body.innerHTML = `<section><p><a>x</a></p></section>`;
        const a = document.querySelector("a")!;
        const path = xpathOfElement(a);
        expect(path).toMatch(/^\/html\/body\[\d+\]\/section\[1\]\/p\[1\]\/a\[1\]$/);
    });
});
