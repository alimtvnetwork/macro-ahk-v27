/**
 * Marco Extension — Keyword Event target resolution tests
 *
 * Covers the new per-event `Target` selector (ActiveElement / Body / Selector)
 * including missing-element fallback behaviour and end-to-end routing through
 * {@link runKeywordEvent}.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveEventTarget, runKeywordEvent } from "@/lib/keyword-event-playback";
import type { KeywordEvent, KeywordEventTarget } from "@/hooks/use-keyword-events";

function mkEvent(target: KeywordEventTarget | undefined): KeywordEvent {
    return {
        Id: "ev-target",
        Keyword: "kw",
        Description: "",
        Enabled: true,
        Steps: [{ Kind: "Key", Id: "s1", Combo: "Enter" }],
        Target: target,
    };
}

describe("resolveEventTarget", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        if (document.activeElement instanceof HTMLElement) { document.activeElement.blur(); }
    });

    it("falls back to document.body when no Target is configured (legacy events)", () => {
        // No focused element + no Target field — should resolve to body.
        const r = resolveEventTarget(undefined);
        expect(r).toBe(document.body);
    });

    it("ActiveElement returns the focused element", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        expect(resolveEventTarget({ Kind: "ActiveElement" })).toBe(input);
    });

    it("ActiveElement falls back to body when nothing is focused", () => {
        // jsdom default: activeElement is body — resolver should still hand
        // back body (which is the documented fallback) rather than null.
        expect(resolveEventTarget({ Kind: "ActiveElement" })).toBe(document.body);
    });

    it("Body always returns document.body", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();
        expect(resolveEventTarget({ Kind: "Body" })).toBe(document.body);
    });

    it("Selector returns the first matching element", () => {
        document.body.innerHTML = `<div><textarea id="chat"></textarea></div>`;
        const ta = document.querySelector("#chat");
        expect(resolveEventTarget({ Kind: "Selector", Selector: "#chat" })).toBe(ta);
    });

    it("Selector falls back to body when nothing matches", () => {
        document.body.innerHTML = `<div></div>`;
        expect(resolveEventTarget({ Kind: "Selector", Selector: "#missing" })).toBe(document.body);
    });

    it("Selector falls back to body when the selector is empty / whitespace", () => {
        expect(resolveEventTarget({ Kind: "Selector", Selector: "   " })).toBe(document.body);
    });

    it("Selector falls back to body for invalid CSS instead of throwing", () => {
        // `:::` is not a valid selector — querySelector throws SyntaxError.
        expect(resolveEventTarget({ Kind: "Selector", Selector: ":::" })).toBe(document.body);
    });
});

describe("runKeywordEvent — target routing", () => {
    beforeEach(() => { document.body.innerHTML = ""; });

    it("dispatches to the element matched by Target.Selector", async () => {
        document.body.innerHTML = `<input id="login" /><input id="other" />`;
        const login = document.querySelector("#login") as HTMLInputElement;
        const other = document.querySelector("#other") as HTMLInputElement;
        const seenLogin: string[] = [];
        const seenOther: string[] = [];
        login.addEventListener("keydown", (e) => seenLogin.push(e.key));
        other.addEventListener("keydown", (e) => seenOther.push(e.key));

        const result = await runKeywordEvent(
            mkEvent({ Kind: "Selector", Selector: "#login" }),
        );
        expect(result.Completed).toBe(true);
        expect(seenLogin).toEqual(["Enter"]);
        expect(seenOther).toEqual([]);
    });

    it("dispatches to document.body when Target.Kind is 'Body'", async () => {
        document.body.innerHTML = `<input id="focused" />`;
        const focused = document.querySelector("#focused") as HTMLInputElement;
        focused.focus();
        const seenBody: string[] = [];
        const seenFocused: string[] = [];
        document.body.addEventListener("keydown", (e) => seenBody.push(e.key), true);
        focused.addEventListener("keydown", (e) => seenFocused.push(e.key));

        await runKeywordEvent(mkEvent({ Kind: "Body" }));
        // Body capture sees it; the focused input does not (no ancestor reach).
        expect(seenBody).toEqual(["Enter"]);
        expect(seenFocused).toEqual([]);
    });

    it("explicit options.target overrides the event's Target config", async () => {
        document.body.innerHTML = `<input id="cfg" /><input id="override" />`;
        const cfg = document.querySelector("#cfg") as HTMLInputElement;
        const override = document.querySelector("#override") as HTMLInputElement;
        const seenCfg: string[] = [];
        const seenOverride: string[] = [];
        cfg.addEventListener("keydown", (e) => seenCfg.push(e.key));
        override.addEventListener("keydown", (e) => seenOverride.push(e.key));

        await runKeywordEvent(
            mkEvent({ Kind: "Selector", Selector: "#cfg" }),
            { target: override },
        );
        expect(seenOverride).toEqual(["Enter"]);
        expect(seenCfg).toEqual([]);
    });
});
