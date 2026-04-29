/**
 * Lovable login flow — DOM resolver via XPath.
 *
 * Wraps `document.evaluate` so callers don't repeat the boilerplate.
 * Returns `null` when the node is missing — caller decides whether
 * that's a wait-loop continuation or a hard failure.
 */

const XPATH_RESULT_FIRST_ORDERED = 9;

export const queryByXPath = (xpath: string, root: Document = document): Element | null => {
    const result = root.evaluate(xpath, root, null, XPATH_RESULT_FIRST_ORDERED, null);
    const node = result.singleNodeValue;

    if (node === null) {
        return null;
    }

    return node instanceof Element ? node : null;
};

export const queryInputByXPath = (xpath: string, root: Document = document): HTMLInputElement | null => {
    const el = queryByXPath(xpath, root);

    return el instanceof HTMLInputElement ? el : null;
};

export const queryButtonByXPath = (xpath: string, root: Document = document): HTMLButtonElement | null => {
    const el = queryByXPath(xpath, root);

    return el instanceof HTMLButtonElement ? el : null;
};
