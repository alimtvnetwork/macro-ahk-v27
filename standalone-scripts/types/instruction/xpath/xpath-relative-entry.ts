import { XPathKind } from "../enums/xpath-kind";
import type { Identifier } from "../primitives/identifier";

/**
 * An XPath fragment evaluated relative to another entry referenced by
 * `relativeTo`. The runtime resolver concatenates the parent's resolved
 * value with this entry's `value` (handling the leading `.` and `/`
 * normalisation).
 *
 * Example:
 *   {
 *     kind: XPathKind.Relative,
 *     name: "payment-banner-close-button",
 *     relativeTo: "payment-banner-root",
 *     value: ".//button[@aria-label='Close']",
 *   }
 */
export type XPathRelativeEntry = {
    readonly kind: XPathKind.Relative;
    readonly name: Identifier;
    readonly relativeTo: Identifier;
    readonly value: string;
    readonly description?: string;
};
