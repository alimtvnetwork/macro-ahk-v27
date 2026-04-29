import type { Identifier } from "../primitives/identifier";
import type { XPathEntry } from "./xpath-entry";

/**
 * A named bundle of related XPaths plus an optional `wrappingXPath`
 * that scopes every entry inside the group.
 *
 * When `wrappingXPath` is set, the runtime resolver evaluates each
 * entry under the wrapping node — equivalent to making every entry
 * relative to it.
 *
 * Example:
 *   {
 *     name: "payment-banner",
 *     wrappingXPath: "//div[@data-role='payment-banner']",
 *     entries: [
 *       { kind: XPathKind.Direct, name: "title", value: ".//h2" },
 *       { kind: XPathKind.Direct, name: "close", value: ".//button" },
 *     ],
 *   }
 */
export type XPathGroup = {
    readonly name: Identifier;
    readonly wrappingXPath?: string;
    readonly description?: string;
    readonly entries: ReadonlyArray<XPathEntry>;
};
