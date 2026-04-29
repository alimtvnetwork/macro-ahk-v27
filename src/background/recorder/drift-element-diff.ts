/**
 * Marco Extension — Drift Element Diff
 *
 * Compares the **primary** selector's resolved element against the
 * **fallback** element that actually matched during replay, and reports the
 * per-attribute differences. Powers the failure post-mortem "Drift Diff"
 * view so the user can see exactly *how* the page changed (renamed id,
 * dropped aria-label, restructured class list, edited text, etc.) versus
 * what the recording captured.
 *
 * Inputs: two {@link DomContext} snapshots produced by
 * {@link compareSelectorAttempts}. When the primary did not match (the
 * common drift case), the "primary" side carries the *recorded* DomContext
 * from the original capture so the user still sees a meaningful before/after.
 *
 * Pure: no DOM access, no chrome.*, deterministic. Caller is responsible
 * for sourcing the two DomContexts.
 *
 * @see ./selector-comparison.ts — Produces SelectorComparison + DomContext.
 * @see ../../components/recorder/DriftElementDiffView.tsx — Presentation.
 */

import type { DomContext } from "./failure-logger";

export type DriftFieldName =
    | "TagName"
    | "Id"
    | "ClassName"
    | "AriaLabel"
    | "Name"
    | "Type"
    | "TextSnippet"
    | "OuterHtmlSnippet";

export type DriftChangeKind = "Unchanged" | "Added" | "Removed" | "Modified";

export interface DriftFieldDiff {
    readonly Field: DriftFieldName;
    readonly Primary: string | null;
    readonly Fallback: string | null;
    readonly Change: DriftChangeKind;
}

export interface DriftClassListDiff {
    /** Classes present on primary but missing on fallback. */
    readonly Removed: ReadonlyArray<string>;
    /** Classes present on fallback but missing on primary. */
    readonly Added: ReadonlyArray<string>;
    /** Classes present on both. */
    readonly Shared: ReadonlyArray<string>;
}

export type DriftVerdict =
    | "Identical"             // Both DomContexts are byte-equal.
    | "AttributeDrift"        // Same tag, same/missing id, only attrs/text changed.
    | "RenamedIdentity"       // Tag matches but id or aria-label changed.
    | "DifferentElement"      // Different tag — fallback resolved a *different* node.
    | "PrimaryMissing"        // Primary side absent (no recorded snapshot to compare).
    | "FallbackMissing";      // Fallback side absent (nothing matched at all).

export interface DriftElementDiff {
    readonly Verdict: DriftVerdict;
    readonly Fields: ReadonlyArray<DriftFieldDiff>;
    readonly ClassList: DriftClassListDiff;
    /** True when at least one field differs. */
    readonly HasChanges: boolean;
}

const DIFF_FIELDS: ReadonlyArray<DriftFieldName> = [
    "TagName",
    "Id",
    "ClassName",
    "AriaLabel",
    "Name",
    "Type",
    "TextSnippet",
    "OuterHtmlSnippet",
];

/**
 * Compute a structured diff between the recorded/primary element and the
 * fallback element that resolved during replay. Either side may be `null`
 * (primary never captured, or no fallback matched) — the verdict reflects
 * that.
 */
export function diffDriftElements(
    primary: DomContext | null,
    fallback: DomContext | null,
): DriftElementDiff {
    if (primary === null && fallback === null) {
        return emptyDiff("PrimaryMissing");
    }
    if (primary === null) {
        return oneSidedDiff(fallback as DomContext, "PrimaryMissing", /*fallbackSide*/ true);
    }
    if (fallback === null) {
        return oneSidedDiff(primary, "FallbackMissing", /*fallbackSide*/ false);
    }

    const fields: DriftFieldDiff[] = DIFF_FIELDS.map((field) => {
        const a = readField(primary, field);
        const b = readField(fallback, field);
        return {
            Field: field,
            Primary: a,
            Fallback: b,
            Change: classifyChange(a, b),
        };
    });

    const classList = diffClassList(primary.ClassName, fallback.ClassName);
    const hasChanges = fields.some((f) => f.Change !== "Unchanged");

    return {
        Verdict: classifyVerdict(primary, fallback, fields, hasChanges),
        Fields: fields,
        ClassList: classList,
        HasChanges: hasChanges,
    };
}

function classifyChange(a: string | null, b: string | null): DriftChangeKind {
    if (a === b) return "Unchanged";
    if (a === null || a === "") return "Added";
    if (b === null || b === "") return "Removed";
    return "Modified";
}

function classifyVerdict(
    primary: DomContext,
    fallback: DomContext,
    fields: ReadonlyArray<DriftFieldDiff>,
    hasChanges: boolean,
): DriftVerdict {
    if (!hasChanges) return "Identical";
    if (primary.TagName !== fallback.TagName) return "DifferentElement";

    const idChanged = fields.find((f) => f.Field === "Id")?.Change !== "Unchanged";
    const ariaChanged = fields.find((f) => f.Field === "AriaLabel")?.Change !== "Unchanged";
    if (idChanged || ariaChanged) return "RenamedIdentity";

    return "AttributeDrift";
}

function diffClassList(a: string | null, b: string | null): DriftClassListDiff {
    const aSet = toClassSet(a);
    const bSet = toClassSet(b);
    const removed: string[] = [];
    const added: string[] = [];
    const shared: string[] = [];
    for (const c of aSet) {
        if (bSet.has(c)) shared.push(c);
        else removed.push(c);
    }
    for (const c of bSet) {
        if (!aSet.has(c)) added.push(c);
    }
    removed.sort();
    added.sort();
    shared.sort();
    return { Removed: removed, Added: added, Shared: shared };
}

function toClassSet(value: string | null): Set<string> {
    if (value === null || value.trim() === "") return new Set();
    return new Set(value.trim().split(/\s+/));
}

function readField(ctx: DomContext, field: DriftFieldName): string | null {
    switch (field) {
        case "TagName": return ctx.TagName;
        case "Id": return ctx.Id;
        case "ClassName": return ctx.ClassName;
        case "AriaLabel": return ctx.AriaLabel;
        case "Name": return ctx.Name;
        case "Type": return ctx.Type;
        case "TextSnippet": return ctx.TextSnippet;
        case "OuterHtmlSnippet": return ctx.OuterHtmlSnippet;
    }
}

function emptyDiff(verdict: DriftVerdict): DriftElementDiff {
    return {
        Verdict: verdict,
        Fields: [],
        ClassList: { Removed: [], Added: [], Shared: [] },
        HasChanges: false,
    };
}

function oneSidedDiff(
    present: DomContext,
    verdict: DriftVerdict,
    fallbackSide: boolean,
): DriftElementDiff {
    const fields: DriftFieldDiff[] = DIFF_FIELDS.map((field) => {
        const value = readField(present, field);
        return {
            Field: field,
            Primary: fallbackSide ? null : value,
            Fallback: fallbackSide ? value : null,
            Change: value === null || value === "" ? "Unchanged" : (fallbackSide ? "Added" : "Removed"),
        };
    });
    const classList = fallbackSide
        ? diffClassList(null, present.ClassName)
        : diffClassList(present.ClassName, null);
    return {
        Verdict: verdict,
        Fields: fields,
        ClassList: classList,
        HasChanges: fields.some((f) => f.Change !== "Unchanged"),
    };
}
