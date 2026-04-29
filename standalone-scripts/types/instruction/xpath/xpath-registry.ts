import type { XPathEntry } from "./xpath-entry";
import type { XPathGroup } from "./xpath-group";

/**
 * Complete set of XPaths owned by one standalone script.
 * Top-level entries live in `entries`; logical bundles (sharing a
 * wrapping node) live in `groups`.
 */
export type XPathRegistry = {
    readonly entries: ReadonlyArray<XPathEntry>;
    readonly groups: ReadonlyArray<XPathGroup>;
};
