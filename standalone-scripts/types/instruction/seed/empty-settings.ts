/**
 * Explicit empty-settings type — preferred over inlining
 * `Record<string, never>` at every callsite. Use as the `TSettings`
 * generic argument when a script has no user-tunable settings.
 */
export type EmptySettings = Record<string, never>;
