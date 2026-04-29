/**
 * Marco Extension — Keyword Event Search Filter
 *
 * Pure helper that filters a list of {@link KeywordEvent}s by a user-typed
 * search string. Matches case-insensitively against:
 *
 *   • `Keyword`
 *   • `Description`
 *   • `Tags[]` (any tag containing the substring counts)
 *   • `Category` (single string)
 *
 * Empty / whitespace queries return the original list unchanged so callers
 * can hand the result straight to render code without an extra branch.
 *
 * Multi-token queries (whitespace-separated) are AND-ed: every token must
 * match at least one field. This matches how every mainstream task tracker
 * handles multi-word search and avoids the surprise of a single-token OR
 * (where typing "login form" would explode into a much wider hit set).
 */

import type { KeywordEvent } from "@/hooks/use-keyword-events";

/** Splits the raw search text into trimmed, lower-cased tokens.
 *  Exported for unit tests and for callers that need to highlight matches. */
export function tokenizeSearch(raw: string): readonly string[] {
    return raw
        .toLowerCase()
        .split(/\s+/u)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

/** True when a single token matches at least one searchable field. */
function matchesToken(event: KeywordEvent, token: string): boolean {
    if ((event.Keyword ?? "").toLowerCase().includes(token)) return true;
    if ((event.Description ?? "").toLowerCase().includes(token)) return true;
    if ((event.Category ?? "").toLowerCase().includes(token)) return true;
    const tags = event.Tags ?? [];
    return tags.some(t => t.toLowerCase().includes(token));
}

/**
 * Filters `events` to those matching the search string. AND semantics across
 * tokens. Returns the original array reference when the query is empty so
 * React.memo / useMemo consumers can rely on referential equality.
 */
export function filterKeywordEvents(
    events: readonly KeywordEvent[],
    search: string,
): readonly KeywordEvent[] {
    const tokens = tokenizeSearch(search);
    if (tokens.length === 0) return events;
    return events.filter(ev => tokens.every(t => matchesToken(ev, t)));
}
