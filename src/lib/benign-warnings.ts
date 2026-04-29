/**
 * Marco Extension — Benign warning patterns
 *
 * Centralised list of regex patterns that match operational warnings the
 * background service worker emits but which do NOT represent a real
 * failure (e.g. `chrome.userScripts.configureWorld` unavailable on
 * Chrome <135 — the source path is already a no-op fallback).
 *
 * Shared by:
 *  - `useActivityTimeline` to filter the Errors drawer noise
 *  - `BootFailureBanner` "Filtered benign warnings" report section
 *    so support reports name *which* patterns suppressed *how many*
 *    entries — making it auditable rather than invisible.
 */

export interface BenignWarningPattern {
    /** Stable identifier surfaced in support reports. */
    id: string;
    /** Human-readable description shown alongside the match count. */
    label: string;
    /** Regex tested against `message + " " + detail` of each warning. */
    re: RegExp;
}

export const BENIGN_WARNING_PATTERNS: ReadonlyArray<BenignWarningPattern> = [
    {
        id: "csp-configure-world-unavailable",
        label: "chrome.userScripts.configureWorld unavailable (Chrome <135 fallback)",
        re: /\[injection:csp\][^\n]*configureWorld unavailable/i,
    },
];

export interface BenignWarningEntryLike {
    level: string;
    message: string;
    detail?: string;
}

/** Returns true when an entry matches any benign-warning pattern. */
export function isBenignWarning(entry: BenignWarningEntryLike): boolean {
    if (entry.level !== "warn") return false;
    const haystack = `${entry.message} ${entry.detail ?? ""}`;
    return BENIGN_WARNING_PATTERNS.some((p) => p.re.test(haystack));
}

/** Per-pattern hit counts produced by `tallyBenignWarnings()`. */
export interface BenignWarningTally {
    /** Total warnings suppressed across all patterns. */
    total: number;
    /** Per-pattern breakdown — entries with `count > 0` only. */
    matched: Array<{ id: string; label: string; count: number }>;
}

/**
 * Counts how many entries match each benign-warning pattern. Patterns with
 * zero matches are omitted from `matched` to keep support reports concise.
 */
export function tallyBenignWarnings(entries: ReadonlyArray<BenignWarningEntryLike>): BenignWarningTally {
    const counts = new Map<string, number>();
    for (const entry of entries) {
        if (entry.level !== "warn") continue;
        const haystack = `${entry.message} ${entry.detail ?? ""}`;
        for (const pattern of BENIGN_WARNING_PATTERNS) {
            if (pattern.re.test(haystack)) {
                counts.set(pattern.id, (counts.get(pattern.id) ?? 0) + 1);
            }
        }
    }

    const matched: BenignWarningTally["matched"] = [];
    let total = 0;
    for (const pattern of BENIGN_WARNING_PATTERNS) {
        const count = counts.get(pattern.id) ?? 0;
        if (count > 0) {
            matched.push({ id: pattern.id, label: pattern.label, count });
            total += count;
        }
    }
    return { total, matched };
}
