/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/02-url-activation-guard.md
 *
 * STRICT exact-match values. Any mutation here is a behavior change — update spec
 * file 02 first, then this enum.
 */
export enum AllowedHomeUrl {
    DASHBOARD = "https://lovable.dev/dashboard",
    ROOT_SLASH = "https://lovable.dev/",
    ROOT = "https://lovable.dev",
}

export const ALLOWED_HOME_URLS: readonly string[] = Object.values(AllowedHomeUrl);
