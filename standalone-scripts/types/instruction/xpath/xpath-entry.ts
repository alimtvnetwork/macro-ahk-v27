import type { XPathDirectEntry } from "./xpath-direct-entry";
import type { XPathRelativeEntry } from "./xpath-relative-entry";

/**
 * Discriminated union of every supported XPath entry shape.
 * Switch on `entry.kind` for exhaustive narrowing.
 */
export type XPathEntry = XPathDirectEntry | XPathRelativeEntry;
