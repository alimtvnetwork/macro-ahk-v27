/**
 * Marco Extension — Keyword Event Bulk Actions
 *
 * Pure helpers backing the right-click context menu on the keyword events
 * list. Kept framework-free so they're trivially testable and reusable from
 * other surfaces (Steps, Sessions, Scripts/Projects) when those wire in.
 *
 *   • formatSequenceNumber  — zero-padded "01"/"001" rendering.
 *   • renderSequenceName    — "Login {n}" / "Login - 02" templating.
 *   • mergeTags             — flat-tag set add (de-duped, trimmed, sorted).
 *   • removeTags            — flat-tag set subtract.
 *   • buildExportPayload    — JSON snapshot of the selected events for ZIP.
 *
 * The full SQLite-in-ZIP exporter is a separate roadmap item; this module
 * intentionally produces JSON so the context menu can ship today.
 */

import type { KeywordEvent } from "@/hooks/use-keyword-events";

export interface SequenceRenameInput {
    readonly Base: string;
    readonly Start: number;
    readonly Padding: number;   // clamped to [1, 6]
    readonly Separator: string; // used only when {n} is absent
}

export const DEFAULT_SEQUENCE_RENAME: SequenceRenameInput = {
    Base: "Event {n}",
    Start: 1,
    Padding: 2,
    Separator: " ",
};

export function formatSequenceNumber(n: number, padding: number): string {
    const pad = Math.max(1, Math.min(6, Math.floor(padding)));
    const safe = Math.max(0, Math.floor(n));
    return safe.toString().padStart(pad, "0");
}

export function renderSequenceName(input: SequenceRenameInput, index: number): string {
    const num = formatSequenceNumber(input.Start + index, input.Padding);
    if (input.Base.includes("{n}")) {
        return input.Base.split("{n}").join(num);
    }
    const base = input.Base.trim();
    return base.length === 0 ? num : `${base}${input.Separator}${num}`;
}

/* ------------------------------------------------------------------ */
/*  Sequence rename validation                                         */
/* ------------------------------------------------------------------ */

export type SequencePreviewIssue =
    | "empty"           // resolved name is empty / whitespace
    | "too-long"        // > 200 chars; matches Keyword column soft limit
    | "duplicate"       // collides with another row inside this rename batch
    | "collision";      // collides with an existing event NOT in the selection

export interface SequencePreviewRow {
    readonly Id: string;
    readonly Old: string;
    readonly Next: string;
    readonly Issues: readonly SequencePreviewIssue[];
    /** Original-cased keywords from `outsideKeywords` whose normalised form
     *  matches `Next`. Empty when there is no `collision` issue. Surfaced by
     *  the rename dialog's "details" expander so the user can see which
     *  existing event each proposed name would clash with. */
    readonly CollidesWith: readonly string[];
}

export interface SequencePreviewSummary {
    readonly Rows: readonly SequencePreviewRow[];
    readonly DuplicateCount: number;
    readonly CollisionCount: number;
    readonly EmptyCount: number;
    readonly TooLongCount: number;
    /** True iff every row is issue-free. */
    readonly IsValid: boolean;
}

const SEQUENCE_NAME_MAX_LENGTH = 200;

/**
 * Computes the new name for every selected event AND flags duplicates,
 * collisions with non-selected events, and invalid (empty/over-long) names.
 *
 *   • `outsideKeywords` are the keywords of events NOT in `selectedEvents`
 *     (i.e. the rest of the list). Pass `[]` if collision detection is
 *     not desired. Comparison is case-insensitive + trimmed to mirror how
 *     users perceive duplicates.
 */
export function computeSequencePreview(
    selectedEvents: ReadonlyArray<{ readonly Id: string; readonly Keyword: string }>,
    input: SequenceRenameInput,
    outsideKeywords: ReadonlyArray<string>,
): SequencePreviewSummary {
    const norm = (s: string): string => s.trim().toLowerCase();
    // Build a map: normalised key → list of original-cased outside keywords
    // sharing that key. Lets the UI surface "Login 01 collides with Login 01,
    // login 01" when casing differs in the existing list.
    const outsideByKey = new Map<string, string[]>();
    for (const raw of outsideKeywords) {
        const key = norm(raw);
        if (key.length === 0) continue;
        const bucket = outsideByKey.get(key);
        if (bucket) bucket.push(raw);
        else outsideByKey.set(key, [raw]);
    }

    const proposed = selectedEvents.map((ev, i) => ({
        Id: ev.Id,
        Old: ev.Keyword,
        Next: renderSequenceName(input, i),
    }));

    // Count occurrences of each normalised proposed name to find within-batch
    // duplicates. >1 occurrence ⇒ every occurrence is a duplicate.
    const counts = new Map<string, number>();
    for (const p of proposed) {
        const key = norm(p.Next);
        if (key.length === 0) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    let duplicateCount = 0;
    let collisionCount = 0;
    let emptyCount = 0;
    let tooLongCount = 0;

    const rows: SequencePreviewRow[] = proposed.map(p => {
        const issues: SequencePreviewIssue[] = [];
        const key = norm(p.Next);
        if (key.length === 0) {
            issues.push("empty");
            emptyCount += 1;
        }
        if (p.Next.length > SEQUENCE_NAME_MAX_LENGTH) {
            issues.push("too-long");
            tooLongCount += 1;
        }
        if (key.length > 0 && (counts.get(key) ?? 0) > 1) {
            issues.push("duplicate");
            duplicateCount += 1;
        }
        const collidesWith = key.length > 0 ? (outsideByKey.get(key) ?? []) : [];
        if (collidesWith.length > 0) {
            issues.push("collision");
            collisionCount += 1;
        }
        return {
            Id: p.Id,
            Old: p.Old,
            Next: p.Next,
            Issues: issues,
            CollidesWith: collidesWith,
        };
    });

    return {
        Rows: rows,
        DuplicateCount: duplicateCount,
        CollisionCount: collisionCount,
        EmptyCount: emptyCount,
        TooLongCount: tooLongCount,
        IsValid: duplicateCount === 0 && collisionCount === 0 && emptyCount === 0 && tooLongCount === 0,
    };
}

/** Returns a fresh, sorted, de-duplicated tag list (case-insensitive). */
export function mergeTags(
    current: readonly string[] | undefined,
    toAdd: readonly string[],
): string[] {
    const seen = new Map<string, string>();
    const consume = (raw: string): void => {
        const trimmed = raw.trim();
        if (trimmed.length === 0) return;
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) seen.set(key, trimmed);
    };
    (current ?? []).forEach(consume);
    toAdd.forEach(consume);
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function removeTags(
    current: readonly string[] | undefined,
    toRemove: readonly string[],
): string[] {
    const drop = new Set(toRemove.map(t => t.trim().toLowerCase()).filter(Boolean));
    return (current ?? [])
        .filter(t => !drop.has(t.trim().toLowerCase()))
        .slice()
        .sort((a, b) => a.localeCompare(b));
}

/**
 * Parses comma/space/newline separated tag input into a clean list.
 * "  foo, bar  baz\nqux " → ["foo", "bar", "baz", "qux"]
 */
export function parseTagInput(raw: string): string[] {
    return raw
        .split(/[\s,]+/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

/**
 * Normalises a category string for storage. Trims whitespace and collapses
 * inner runs; empty input returns `undefined` so the field round-trips as
 * "uncategorised" through the persistence layer (matching the
 * `Category?: string` shape on `KeywordEvent`).
 */
export function normaliseCategory(raw: string | undefined): string | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw.replace(/\s+/g, " ").trim();
    return trimmed.length === 0 ? undefined : trimmed;
}

/** Returns the unique, non-empty categories currently in use across the
 *  given events — sorted case-insensitively for stable suggestion lists. */
export function collectCategories(
    events: ReadonlyArray<{ readonly Category?: string }>,
): string[] {
    const seen = new Map<string, string>();
    for (const ev of events) {
        const c = normaliseCategory(ev.Category);
        if (c === undefined) continue;
        const key = c.toLowerCase();
        if (!seen.has(key)) seen.set(key, c);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export interface ExportPayload {
    readonly Format: "marco.keyword-events.v1";
    readonly ExportedAt: string;
    readonly Events: readonly KeywordEvent[];
}

export function buildExportPayload(events: readonly KeywordEvent[]): ExportPayload {
    return {
        Format: "marco.keyword-events.v1",
        ExportedAt: new Date().toISOString(),
        Events: events,
    };
}

/** Slug for the .zip filename — "marco-keyword-events-2026-04-27T...". */
export function buildExportFilename(now: Date = new Date()): string {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    return `marco-keyword-events-${stamp}.zip`;
}
