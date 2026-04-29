/**
 * Optional cookie-name string attached to a seed identifying which
 * page cookie carries the bearer token for that script.
 *
 * Historically this was a `{ cookieName, url, role }` triple; today
 * the runtime only needs the cookie name (the URL is implied by the
 * project's `TargetUrls`). Keeping it as a single `string` keeps the
 * JSON minimal and matches the existing manifest shape.
 */
export type CookieBinding = string;
