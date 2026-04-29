import type { UrlPattern } from "../primitives/url-pattern";

/**
 * One URL pattern used by the injection scheduler. `MatchType`
 * disambiguates how `Pattern` is evaluated.
 *
 * `MatchType` is the literal string union (matches the runtime
 * matcher's vocabulary) per `mem://standards/pascalcase-json-keys`.
 */
export type TargetUrl = {
    readonly Pattern: UrlPattern;
    readonly MatchType: "glob" | "regex" | "exact";
};
