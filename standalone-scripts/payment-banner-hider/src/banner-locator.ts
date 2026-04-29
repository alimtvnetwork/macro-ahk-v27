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
        const result = document.evaluate(
            TARGET_XPATH,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
        );
        const node = result.singleNodeValue;

        if (!(node instanceof HTMLElement)) {
            return null;
        }

        const text = node.textContent ?? "";

        if (!text.includes(TARGET_TEXT)) {
            return null;
        }

        return node;
    }
}
