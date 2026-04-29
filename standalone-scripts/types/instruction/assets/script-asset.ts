/**
 * One JavaScript bundle file shipped with the script. The injection
 * scheduler honours `Order` for stable load sequencing.
 *
 * - `ConfigBinding` / `ThemeBinding` — name of a `ConfigAsset.Key` whose
 *   parsed value should be passed to the IIFE on load (resolved by the
 *   loader, never by the script itself).
 * - `IsIife` — true when the bundle is an IIFE wrapper.
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type ScriptAsset = {
    readonly File: string;
    readonly Order: number;
    readonly ConfigBinding?: string;
    readonly ThemeBinding?: string;
    readonly IsIife?: boolean;
};
