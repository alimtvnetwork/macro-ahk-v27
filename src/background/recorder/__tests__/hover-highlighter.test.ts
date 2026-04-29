/**
 * Tests for hover-highlighter.ts — smart group detection (§1.3),
 * Alt-key ancestor cycling (§1.4), and mode lifecycle (§1.1).
 *
 * @see spec/31-macro-recorder/17-hover-highlighter-and-data-controllers.md
 */

/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    HOVER_HIGHLIGHTER_HOST_ID,
    findSmartGroup,
    mountHoverHighlighter,
    nthAncestor,
    describeElement,
} from "../hover-highlighter";

describe("findSmartGroup — priority order", () => {
    beforeEach(() => { document.body.innerHTML = ""; });

    it("prefers <form> over [role='group']", () => {
        document.body.innerHTML = `
            <div role="group" id="group">
                <form id="form">
                    <input id="i1">
                </form>
            </div>`;
        const input = document.getElementById("i1")!;
        expect(findSmartGroup(input)?.id).toBe("form");
    });

    it("falls back to <fieldset> when no form", () => {
        document.body.innerHTML = `<fieldset id="fs"><input id="i1"></fieldset>`;
        const input = document.getElementById("i1")!;
        expect(findSmartGroup(input)?.id).toBe("fs");
    });

    it("matches table row", () => {
        document.body.innerHTML = `
            <table><tbody><tr id="r1"><td><button id="b">x</button></td></tr></tbody></table>`;
        const btn = document.getElementById("b")!;
        expect(findSmartGroup(btn)?.id).toBe("r1");
    });

    it("matches role='listitem'", () => {
        document.body.innerHTML = `<ul><li role="listitem" id="li"><span id="s">x</span></li></ul>`;
        const span = document.getElementById("s")!;
        expect(findSmartGroup(span)?.id).toBe("li");
    });

    it("matches card-class container", () => {
        document.body.innerHTML = `<div class="user-card" id="c"><button id="b">x</button></div>`;
        const btn = document.getElementById("b")!;
        expect(findSmartGroup(btn)?.id).toBe("c");
    });
});

describe("nthAncestor", () => {
    it("returns same element at depth 0", () => {
        document.body.innerHTML = `<div id="a"><span id="b"></span></div>`;
        const span = document.getElementById("b")!;
        expect(nthAncestor(span, 0)).toBe(span);
    });

    it("walks up N levels", () => {
        document.body.innerHTML = `<section id="s"><div id="d"><span id="b"></span></div></section>`;
        const span = document.getElementById("b")!;
        expect(nthAncestor(span, 2).id).toBe("s");
    });

    it("clamps at document root", () => {
        document.body.innerHTML = `<span id="b"></span>`;
        const span = document.getElementById("b")!;
        const result = nthAncestor(span, 999);
        expect(result.tagName.toLowerCase()).toBe("html");
    });
});

describe("describeElement", () => {
    it("formats tag, id, classes, and depth chip", () => {
        const el = document.createElement("button");
        el.id = "submit";
        el.className = "btn primary large";
        expect(describeElement(el, 0)).toBe("button#submit.btn.primary.large");
        expect(describeElement(el, 2)).toBe("button#submit.btn.primary.large  · depth +2");
    });
});

describe("mountHoverHighlighter — lifecycle", () => {
    afterEach(() => {
        const host = document.getElementById(HOVER_HIGHLIGHTER_HOST_ID);
        if (host !== null) host.remove();
    });

    it("mounts host into body and attaches shadow root", () => {
        const handle = mountHoverHighlighter();
        const host = document.getElementById(HOVER_HIGHLIGHTER_HOST_ID);
        expect(host).not.toBeNull();
        expect(handle.GetMode()).toBe("off");
        handle.Destroy();
        expect(document.getElementById(HOVER_HIGHLIGHTER_HOST_ID)).toBeNull();
    });

    it("setMode persists current mode", () => {
        const handle = mountHoverHighlighter();
        handle.SetMode("inspector");
        expect(handle.GetMode()).toBe("inspector");
        handle.SetMode("off");
        expect(handle.GetMode()).toBe("off");
        handle.Destroy();
    });

    it("removing existing host before mounting prevents duplicates", () => {
        const a = mountHoverHighlighter();
        const b = mountHoverHighlighter();
        const hosts = document.querySelectorAll(`#${HOVER_HIGHLIGHTER_HOST_ID}`);
        expect(hosts.length).toBe(1);
        a.Destroy();
        b.Destroy();
    });
});
