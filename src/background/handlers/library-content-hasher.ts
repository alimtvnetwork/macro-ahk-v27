/**
 * Marco Extension — Content Hash Utility
 *
 * SHA-256 content hashing for SharedAsset diff detection.
 * Uses Web Crypto API (available in service workers).
 *
 * @see spec/21-app/02-features/misc-features/cross-project-sync.md §7.3 — Content Hashing
 */

/**
 * Compute SHA-256 hex digest of a string.
 * Used for fast diff detection during promote-back and redundant-overwrite avoidance.
 */
export async function computeContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
