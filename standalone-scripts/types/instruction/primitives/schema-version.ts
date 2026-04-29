/**
 * Single source of truth for the `SchemaVersion` field that appears at
 * the top of every standalone project's `dist/instruction.json` (and
 * its camelCase compat sibling).
 *
 * Why this lives in `types/instruction/primitives/`:
 *   - It is the shape contract the instruction compiler writes and the
 *     runtime / validator read. Putting it next to `version-string.ts`
 *     and `identifier.ts` keeps the contract co-located with the rest
 *     of the instruction primitives.
 *
 * Mirror file: `schema-version.json` — same data, JSON-only, so the
 * dep-free `scripts/validate-instruction-schema.mjs` can load the
 * contract without parsing TypeScript. Both files MUST stay in lock-
 * step; CI lints the JSON against this TS module on every build.
 *
 * Bumping the version (checklist):
 *   1. Add the new version string to `SUPPORTED_SCHEMA_VERSIONS` here
 *      AND in `schema-version.json`.
 *   2. Update `CURRENT_SCHEMA_VERSION` in both files.
 *   3. Update every `standalone-scripts/<name>/src/instruction.ts`
 *      `SchemaVersion: "X.Y"` literal.
 *   4. Document the breaking shape change in `CHANGELOG.md` and the
 *      migration path (see runtime `manifest-seeder.ts`).
 *
 * The pattern intentionally requires a dotted MAJOR.MINOR — single
 * integers ("1") and pre-release suffixes ("1.0-beta") are rejected
 * so the field stays trivially comparable.
 */

/** Regex literal pattern every SchemaVersion string must match. */
export const SCHEMA_VERSION_PATTERN = /^\d+\.\d+$/;

/**
 * Every SchemaVersion the current compiler + runtime can read. The
 * validator rejects anything outside this list (even if it matches
 * the pattern) so an accidentally-bumped source file fails CI BEFORE
 * it ships a forwards-incompatible artifact.
 */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const;

/** The version the compiler currently emits. Must be in the list above. */
export const CURRENT_SCHEMA_VERSION = "1.0" as const;

export type SupportedSchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number];

export function isSupportedSchemaVersion(v: unknown): v is SupportedSchemaVersion {
    return typeof v === "string"
        && SCHEMA_VERSION_PATTERN.test(v)
        && (SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(v);
}