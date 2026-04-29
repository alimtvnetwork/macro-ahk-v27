/**
 * Marco Extension — Label → PascalCase Variable Suggester
 *
 * Phase 06 — Macro Recorder.
 *
 * Derives a deterministic PascalCase variable name from the most semantic
 * source available, in priority order:
 *   1. associated `<label for=...>`
 *   2. wrapping `<label>`
 *   3. `aria-label`
 *   4. `placeholder`
 *   5. element `id`
 *   6. tag name + ordinal fallback (`Element`)
 *
 * Output is safe for use as a JS identifier: ASCII letters/digits only,
 * starts with a letter, no spaces.
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports.
 */

const FALLBACK_NAME = "Element";

/** Resolves the raw label text for an element, or null when none is found. */
export function resolveLabelText(element: Element): string | null {
    const fromForLabel = readForLabel(element);
    if (fromForLabel !== null) return fromForLabel;

    const fromWrapLabel = readWrappingLabel(element);
    if (fromWrapLabel !== null) return fromWrapLabel;

    const aria = element.getAttribute("aria-label");
    if (aria !== null && aria.trim() !== "") return aria;

    const placeholder = element.getAttribute("placeholder");
    if (placeholder !== null && placeholder.trim() !== "") return placeholder;

    const id = element.getAttribute("id");
    if (id !== null && id.trim() !== "") return id;

    return null;
}

function readForLabel(element: Element): string | null {
    const id = element.getAttribute("id");
    const hasId = id !== null && id !== "";

    if (hasId === false) return null;

    const label = element.ownerDocument.querySelector(`label[for="${id}"]`);
    const text = label?.textContent?.trim() ?? "";

    return text === "" ? null : text;
}

function readWrappingLabel(element: Element): string | null {
    const label = element.closest("label");
    const text = label?.textContent?.trim() ?? "";

    return text === "" ? null : text;
}

/** Converts an arbitrary string to PascalCase ASCII (letters + digits). */
export function toPascalCase(raw: string): string {
    const cleaned = raw.replace(/[^a-zA-Z0-9]+/g, " ").trim();

    if (cleaned === "") return FALLBACK_NAME;

    const words = cleaned.split(/\s+/);
    const joined = words.map(capitaliseWord).join("");
    const startsWithDigit = /^[0-9]/.test(joined);

    return startsWithDigit ? FALLBACK_NAME + joined : joined;
}

function capitaliseWord(word: string): string {
    const first = word.charAt(0).toUpperCase();
    const rest = word.slice(1).toLowerCase();
    return first + rest;
}

/** End-to-end: element → suggested PascalCase variable name. */
export function suggestVariableName(element: Element): string {
    const raw = resolveLabelText(element);
    const tagFallback = element.tagName.toLowerCase();
    const source = raw ?? tagFallback;

    return toPascalCase(source);
}
