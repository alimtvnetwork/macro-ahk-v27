/**
 * URL pattern string. Interpretation depends on the sibling `MatchType`
 * value on the owning `TargetUrl`.
 *
 * Kept as a structural alias (not a branded type) for the Phase 1
 * PascalCase migration. See the rationale in `./identifier.ts`.
 */
export type UrlPattern = string;
