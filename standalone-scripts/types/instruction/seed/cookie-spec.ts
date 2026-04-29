/**
 * One cookie that the seed expects to be present. `CookieName` +
 * `Url` (origin) are required; `Role` is a free-form label used for
 * diagnostics and bridge wiring.
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type CookieSpec = {
    readonly CookieName: string;
    readonly Url: string;
    readonly Role: "session" | "refresh" | "other";
    readonly Description: string;
};
