/**
 * Discriminator for `XPathEntry`. Lets a registry mix absolute and
 * relative XPaths without losing type safety.
 *
 * - `Direct`   — value is a complete XPath expression evaluated from
 *                the document root.
 * - `Relative` — value is an XPath fragment evaluated from another
 *                entry referenced by `relativeTo`.
 */
export const enum XPathKind {
    Direct = "direct",
    Relative = "relative",
}
