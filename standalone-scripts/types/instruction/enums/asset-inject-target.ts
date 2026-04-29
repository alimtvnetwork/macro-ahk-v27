/**
 * DOM region into which a CSS asset should be injected at runtime.
 * Currently only `Head` is supported, but the enum exists so the
 * surface stays explicit if `Body` injection is added later.
 */
export const enum AssetInjectTarget {
    Head = "head",
}
