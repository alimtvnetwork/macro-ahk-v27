/**
 * Marco Extension — XPath Anchor + Relative Path Strategies
 *
 * Phase 06 — Macro Recorder.
 *
 * An *anchor* is an ancestor element selected by the user (or auto-detected
 * `<label>` / `<legend>` / `<fieldset>`) used to express a *relative* XPath
 * from the anchor to the captured element. Relative paths are shorter and
 * survive sibling reorder above the anchor, so they replay more reliably.
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports.
 */

import { buildPositionalXPath } from "./xpath-strategies";

const ANCHOR_TAGS = new Set(["LABEL", "LEGEND", "FIELDSET", "FORM"]);

/** Walks up the DOM and returns the nearest auto-detected anchor, or null. */
export function findAutoAnchor(element: Element): Element | null {
    let current: Element | null = element.parentElement;

    while (current !== null && current !== document.documentElement) {
        const isAnchor = ANCHOR_TAGS.has(current.tagName);

        if (isAnchor) {
            return current;
        }

        current = current.parentElement;
    }

    return null;
}

/** Returns true when `anchor` is a strict ancestor of `element`. */
export function isAncestor(anchor: Element, element: Element): boolean {
    const isSame = anchor === element;
    const contains = anchor.contains(element);

    return contains && isSame === false;
}

/**
 * Builds a positional XPath of `element` *relative to* `anchor`.
 * Returns null when anchor is not a strict ancestor.
 */
export function buildRelativeXPath(
    element: Element,
    anchor: Element,
): string | null {
    const valid = isAncestor(anchor, element);

    if (valid === false) {
        return null;
    }

    const fullFromDocument = buildPositionalXPath(element).xpath;
    const fullFromAnchor = buildPositionalXPath(anchor).xpath;
    const startsWithAnchor = fullFromDocument.startsWith(fullFromAnchor + "/");

    if (startsWithAnchor === false) {
        return null;
    }

    const tail = fullFromDocument.slice(fullFromAnchor.length + 1);
    return "./" + tail;
}
