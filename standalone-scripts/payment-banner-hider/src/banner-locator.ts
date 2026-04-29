/**
 * Payment Banner Hider — Banner locator.
 *
 * Single-responsibility class that resolves the sticky billing banner
 * via XPath and confirms its text content. Injected into the
 * PaymentBannerHider entry-point class so it can be swapped for a
 * test double (per class-based-standalone-scripts standard).
 *
 * Errors are NEVER swallowed — XPath defects throw and surface to
 * the caller's catch block where they are logged via
 * RiseupAsiaMacroExt.Logger.error and rethrown
 * (per no-error-swallowing standard).
 */

import { TARGET_TEXT, TARGET_XPATH } from "./types";

// 9 = XPathResult.FIRST_ORDERED_NODE_TYPE. Keep this numeric so the
// standalone bundle can be smoke-tested in Node shims without a global
// XPathResult constructor.
const XPATH_RESULT_FIRST_ORDERED_NODE_TYPE = 9;

function isHtmlElement(node: Node | null): node is HTMLElement {
    if (node === null) {
        return false;
    }

    if (typeof HTMLElement === "undefined") {
        return false;
    }

    return node instanceof HTMLElement;
}

export class BannerLocator {
    /**
     * Resolve the target element if it exists in the live DOM AND
     * carries the exact "Payment issue detected." text.
     *
     * @returns the matched element, or `null` when the banner is
     *   genuinely absent. Throws when the XPath itself is malformed
     *   (a programmer defect — must surface, not be swallowed).
     */
    public locate(): HTMLElement | null {
        if (typeof document === "undefined" || typeof document.evaluate !== "function") {
            return null;
        }
        const result = document.evaluate(
            TARGET_XPATH,
            document,
            null,
            XPATH_RESULT_FIRST_ORDERED_NODE_TYPE,
            null,
        );
        const node = result.singleNodeValue;

        if (!isHtmlElement(node)) {
            return null;
        }

        const text = node.textContent ?? "";

        if (!text.includes(TARGET_TEXT)) {
            return null;
        }

        return node;
    }
}
