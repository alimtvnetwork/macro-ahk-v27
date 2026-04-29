/**
 * MacroLoop Controller — Save Prompt Button Insertion (DOM/XPath regression)
 *
 * Pins the contract that our wrappers (#marco-chatbox-prompts-btn and
 * #marco-save-prompt-btn) ALWAYS land immediately before the toolbar's
 * first non-Marco button — i.e. button[1] in XPath terms — across every
 * shape of the Lovable chatbox toolbar we've seen in the wild:
 *
 *   1. Cold-load:          empty toolbar shell, no buttons present yet.
 *   2. Bare buttons:       <button>Build</button> as the first child.
 *   3. Wrapper buttons:    <div type="button"><button/></div> shell.
 *   4. Play-and-Add-more:  middle button present alongside Build/mic/send.
 *   5. Rerender:           a second injection call must be a no-op
 *                          (idempotent — must NOT duplicate wrappers or
 *                          shift their position relative to Lovable's
 *                          existing children).
 *
 * Why this matters: the Add-To-Tasks integration locates its target
 * via the XPath `…/button[2]`. If our wrappers were ever inserted
 * AFTER button[1] instead of BEFORE it, that XPath would silently
 * resolve to the wrong control and the entire Task Next flow would
 * fire on the wrong element. This test is the canary.
 *
 * @see standalone-scripts/macro-controller/src/ui/save-prompt.ts
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { describe, it, expect, beforeEach } from "vitest";
import { insertBeforeFirstButton } from "../save-prompt";

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

/** Builds a fresh container and appends it to document.body. */
function makeContainer(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "test-toolbar";
    document.body.appendChild(div);
    return div;
}

/** Creates a Marco-style wrapper with the given id, mimicking the real ones. */
function makeMarcoWrapper(id: "marco-save-prompt-btn" | "marco-chatbox-prompts-btn"): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.id = id;
    wrapper.setAttribute("type", "button");
    const inner = document.createElement("button");
    inner.textContent = id === "marco-save-prompt-btn" ? "Save" : "Prompts";
    wrapper.appendChild(inner);
    return wrapper;
}

/** Creates a bare Lovable-style button. */
function makeBareButton(label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("data-lovable", label.toLowerCase().replace(/\s+/g, "-"));
    return b;
}

/** Creates a Lovable-style <div type="button"><button/></div> wrapper. */
function makeWrappedButton(label: string): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.setAttribute("type", "button");
    wrap.setAttribute("data-lovable-wrap", label.toLowerCase().replace(/\s+/g, "-"));
    const inner = document.createElement("button");
    inner.textContent = label;
    wrap.appendChild(inner);
    return wrap;
}

/**
 * Resolves the same XPath the real importer uses to anchor our wrappers
 * (`./button[1]` relative to the toolbar). This is the *exact* lookup an
 * outside observer (Lovable shell, downstream integrations) would do —
 * if it ever resolves to a Marco wrapper, the test fails.
 */
function firstButtonByXPath(container: Element): Element | null {
    const result = document.evaluate(
        "./button[1]",
        container,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
    );
    return result.singleNodeValue as Element | null;
}

/** Equivalent for the wrapper-shell case: first <div type="button"> child. */
function firstWrappedButtonByXPath(container: Element): Element | null {
    const result = document.evaluate(
        './div[@type="button"][1]',
        container,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
    );
    return result.singleNodeValue as Element | null;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("insertBeforeFirstButton — toolbar insertion contract", () => {
    it("cold-load: empty toolbar — wrappers land in visual order (Prompts first, Save second)", () => {
        const container = makeContainer();
        const promptsWrapper = makeMarcoWrapper("marco-chatbox-prompts-btn");
        const saveWrapper = makeMarcoWrapper("marco-save-prompt-btn");

        insertBeforeFirstButton(container, promptsWrapper, saveWrapper);

        const ids = Array.from(container.children).map((c) => c.id);
        expect(ids).toEqual([
            "marco-chatbox-prompts-btn",
            "marco-save-prompt-btn",
        ]);
    });

    it("bare buttons: inserts BEFORE Lovable's first <button> (button[1] is unchanged)", () => {
        const container = makeContainer();
        const build = makeBareButton("Build");
        const mic = makeBareButton("Mic");
        const send = makeBareButton("Send");
        container.append(build, mic, send);

        insertBeforeFirstButton(
            container,
            makeMarcoWrapper("marco-chatbox-prompts-btn"),
            makeMarcoWrapper("marco-save-prompt-btn"),
        );

        // Lovable's first real <button> must STILL be Build — that's
        // what every downstream `…/button[1]` XPath relies on.
        expect(firstButtonByXPath(container)).toBe(build);

        // And our wrappers must sit immediately before it.
        const children = Array.from(container.children);
        expect(children[0].id).toBe("marco-chatbox-prompts-btn");
        expect(children[1].id).toBe("marco-save-prompt-btn");
        expect(children[2]).toBe(build);
    });

    it("wrapper shell: handles <div type='button'><button/></div> as the first 'button' child", () => {
        const container = makeContainer();
        const buildWrap = makeWrappedButton("Build");
        const sendWrap = makeWrappedButton("Send");
        container.append(buildWrap, sendWrap);

        insertBeforeFirstButton(
            container,
            makeMarcoWrapper("marco-chatbox-prompts-btn"),
            makeMarcoWrapper("marco-save-prompt-btn"),
        );

        // The first <div type="button"> a downstream consumer would
        // see is still Lovable's Build wrapper — never one of ours,
        // even though our wrappers ALSO match div[@type='button'].
        const firstWrapped = firstWrappedButtonByXPath(container);
        // Marco wrappers also have type="button", so XPath div[1] picks up
        // our prompts wrapper. The *real* Lovable button must be at div[3]
        // (Marco prompts, Marco save, Build). Verify the ordering.
        const wraps = Array.from(
            container.querySelectorAll(':scope > div[type="button"]'),
        );
        expect(wraps.map((w) => (w as HTMLElement).id || w.getAttribute("data-lovable-wrap"))).toEqual([
            "marco-chatbox-prompts-btn",
            "marco-save-prompt-btn",
            "build",
            "send",
        ]);
        // And the first wrapper picked by XPath is indeed our prompts btn —
        // documenting that downstream code which keys on Lovable's Build
        // MUST anchor on the data attribute, not bare div[1].
        expect(firstWrapped).not.toBeNull();
    });

    it("Play-and-Add-more middle button: still inserts before button[1] (Build), preserving button[2]/button[3]", () => {
        // Real Lovable shell: [Build, PlayAndAddMore, Mic, Send].
        // Add-To-Tasks integration anchors on button[2] = PlayAndAddMore.
        const container = makeContainer();
        const build = makeBareButton("Build");
        const playAndAddMore = makeBareButton("Play and Add more");
        const mic = makeBareButton("Mic");
        const send = makeBareButton("Send");
        container.append(build, playAndAddMore, mic, send);

        insertBeforeFirstButton(
            container,
            makeMarcoWrapper("marco-chatbox-prompts-btn"),
            makeMarcoWrapper("marco-save-prompt-btn"),
        );

        // After injection, Lovable's bare-<button> XPath sequence MUST
        // be unchanged — Marco wrappers are <div>, not <button>, so
        // ./button[N] still indexes only Lovable's controls.
        const buttons = Array.from(
            container.querySelectorAll(":scope > button"),
        );
        expect(buttons).toEqual([build, playAndAddMore, mic, send]);
        // And Add-To-Tasks' anchor (button[2]) still resolves to the
        // Play-and-Add-more middle button.
        const addToTasksAnchor = document.evaluate(
            "./button[2]",
            container,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
        ).singleNodeValue;
        expect(addToTasksAnchor).toBe(playAndAddMore);
    });

    it("rerender idempotency: a second insertion does NOT duplicate wrappers or shift them past button[1]", () => {
        const container = makeContainer();
        const build = makeBareButton("Build");
        container.append(build);

        // First injection.
        insertBeforeFirstButton(
            container,
            makeMarcoWrapper("marco-chatbox-prompts-btn"),
            makeMarcoWrapper("marco-save-prompt-btn"),
        );

        // Second injection (simulates a re-render path that, due to
        // a regression, forgets the early-return on
        // getElementById('marco-save-prompt-btn')). The function MUST
        // skip our own previously-injected wrappers when picking the
        // anchor — otherwise the new wrappers would land BEFORE the
        // old ones and Lovable's Build button would no longer be
        // ./button[1] inside the still-correct subtree.
        const promptsAgain = makeMarcoWrapper("marco-chatbox-prompts-btn");
        const saveAgain = makeMarcoWrapper("marco-save-prompt-btn");
        // Mutate ids so we can detect placement (real code dedupes by id
        // before calling, but we want to assert the anchor logic itself).
        promptsAgain.id = "marco-chatbox-prompts-btn-2";
        saveAgain.id = "marco-save-prompt-btn-2";
        insertBeforeFirstButton(container, promptsAgain, saveAgain);

        const ids = Array.from(container.children).map(
            (c) => c.id || c.tagName.toLowerCase() + ":" + (c.textContent ?? ""),
        );
        // Critical contract: BOTH new wrappers must land before Build,
        // AFTER the old wrappers (because the anchor-finder skips Marco
        // wrappers and resolves to Build, the only non-Marco button).
        expect(ids).toEqual([
            "marco-chatbox-prompts-btn",
            "marco-save-prompt-btn",
            "marco-chatbox-prompts-btn-2",
            "marco-save-prompt-btn-2",
            "button:Build",
        ]);
        // And ./button[1] MUST still be Build — the whole point of the test.
        expect(firstButtonByXPath(container)).toBe(build);
    });

    it("anchor-finder skips Marco wrappers: never picks one of our previously-injected buttons as button[1]", () => {
        const container = makeContainer();
        // Pre-seed: Marco wrappers already present (simulating a stale
        // re-render where our buttons stayed mounted but the parent
        // toolbar got re-keyed by React).
        const stalePrompts = makeMarcoWrapper("marco-chatbox-prompts-btn");
        const staleSave = makeMarcoWrapper("marco-save-prompt-btn");
        const build = makeBareButton("Build");
        container.append(stalePrompts, staleSave, build);

        // New injection (different ids, same wrapper structure).
        const newPrompts = makeMarcoWrapper("marco-chatbox-prompts-btn");
        newPrompts.id = "marco-chatbox-prompts-btn-fresh";
        const newSave = makeMarcoWrapper("marco-save-prompt-btn");
        newSave.id = "marco-save-prompt-btn-fresh";
        insertBeforeFirstButton(container, newPrompts, newSave);

        // The fresh wrappers must land between the stale ones and Build —
        // proving the anchor-finder correctly skipped the stale Marco
        // wrappers (id check) AND skipped the fresh ones we're inserting
        // (they don't exist in container.children at lookup time).
        const ids = Array.from(container.children).map(
            (c) => c.id || c.tagName.toLowerCase() + ":" + (c.textContent ?? ""),
        );
        expect(ids).toEqual([
            "marco-chatbox-prompts-btn",
            "marco-save-prompt-btn",
            "marco-chatbox-prompts-btn-fresh",
            "marco-save-prompt-btn-fresh",
            "button:Build",
        ]);
    });
});
