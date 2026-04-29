/**
 * Marco Extension — Semantic Versioning Helpers
 *
 * Version bump utilities for SharedAsset version management.
 *
 * @see spec/21-app/02-features/misc-features/cross-project-sync.md §6.2 — Version Conflicts
 */

/** Parse a semver string into [major, minor, patch]. */
export function parseSemver(version: string): [number, number, number] {
    const parts = version.split(".").map(Number);
    return [parts[0] ?? 1, parts[1] ?? 0, parts[2] ?? 0];
}

/** Format [major, minor, patch] back to string. */
export function formatSemver(major: number, minor: number, patch: number): string {
    return `${major}.${minor}.${patch}`;
}

/** Bump minor version (e.g., 2.1.0 → 2.2.0). Used on Replace. */
export function bumpMinor(version: string): string {
    const [major, minor] = parseSemver(version);
    return formatSemver(major, minor + 1, 0);
}

/** Bump patch version (e.g., 2.1.0 → 2.1.1). */
export function bumpPatch(version: string): string {
    const [major, minor, patch] = parseSemver(version);
    return formatSemver(major, minor, patch + 1);
}

/** Bump major version (e.g., 2.1.0 → 3.0.0). */
export function bumpMajor(version: string): string {
    const [major] = parseSemver(version);
    return formatSemver(major + 1, 0, 0);
}

/** Compare two semver strings. Returns -1, 0, or 1. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
    const [aMajor, aMinor, aPatch] = parseSemver(a);
    const [bMajor, bMinor, bPatch] = parseSemver(b);

    if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
    if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
    if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
    return 0;
}
