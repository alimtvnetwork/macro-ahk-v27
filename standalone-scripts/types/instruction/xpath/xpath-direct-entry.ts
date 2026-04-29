import { XPathKind } from "../enums/xpath-kind";
import type { Identifier } from "../primitives/identifier";

/**
 * A complete XPath expression evaluated from the document root.
 *
 * Example:
 *   {
 *     kind: XPathKind.Direct,
 *     name: "payment-banner-root",
 *     value: "//div[@data-role='payment-banner']",
 *   }
 */
export type XPathDirectEntry = {
    readonly kind: XPathKind.Direct;
    readonly name: Identifier;
    readonly value: string;
    readonly description?: string;
};
