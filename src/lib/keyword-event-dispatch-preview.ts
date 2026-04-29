/**
 * Marco Extension — Live dispatch preview formatter
 *
 * Pure helpers that translate a {@link KeywordEventStep} (the step currently
 * being executed by `runKeywordEvent`) into a presentation-friendly preview
 * for the Keyword Events panel. Reused by the live preview pill so the user
 * can see exactly which modifiers + key are being dispatched right now.
 *
 * Pure — no DOM, no React, no localStorage.
 */

import type { KeywordEventStep } from "@/hooks/use-keyword-events";
import { parseCombo } from "@/lib/keyword-event-playback";

export interface KeyDispatchPreview {
    readonly Kind: "Key";
    /** Ordered modifier display labels (e.g. ["Ctrl", "Shift"]). Empty when none. */
    readonly Modifiers: readonly string[];
    /** Display label for the main key (e.g. "Enter", "A"). Empty when the combo has no key. */
    readonly Key: string;
    /** True when the combo had a non-empty key after parsing. */
    readonly HasKey: boolean;
    /** Raw combo string as authored by the user. */
    readonly Raw: string;
}

export interface WaitDispatchPreview {
    readonly Kind: "Wait";
    readonly DurationMs: number;
}

export type DispatchPreview = KeyDispatchPreview | WaitDispatchPreview;

/**
 * Build a structured preview for a step so the UI can render the modifiers
 * and the key as separate styled chips. Modifier order is fixed
 * (Ctrl → Shift → Alt → Meta) to keep the preview stable across renders
 * regardless of the order the user typed them.
 */
export function buildDispatchPreview(step: KeywordEventStep): DispatchPreview {
    if (step.Kind === "Wait") {
        return { Kind: "Wait", DurationMs: step.DurationMs };
    }
    const parsed = parseCombo(step.Combo);
    const modifiers: string[] = [];
    if (parsed.Ctrl) { modifiers.push("Ctrl"); }
    if (parsed.Shift) { modifiers.push("Shift"); }
    if (parsed.Alt) { modifiers.push("Alt"); }
    if (parsed.Meta) { modifiers.push("Meta"); }
    return {
        Kind: "Key",
        Modifiers: modifiers,
        Key: formatKeyLabel(parsed.Key),
        HasKey: parsed.Key.length > 0,
        Raw: step.Combo,
    };
}

/**
 * Pretty-print the key portion of a combo. Single characters are shown
 * upper-cased; named keys keep their canonical capitalisation. Pure — does
 * not read from or write to any DOM.
 */
function formatKeyLabel(raw: string): string {
    const k = raw.trim();
    if (k === "") { return ""; }
    if (k.length === 1) { return k.toUpperCase(); }
    // Capitalise the first letter for named keys ("enter" -> "Enter") so the
    // preview matches the editor's placeholder text style.
    return k.charAt(0).toUpperCase() + k.slice(1);
}

/**
 * Flatten a {@link KeyDispatchPreview} back to a single human-readable
 * string ("Ctrl + Shift + Enter"). Used for tooltips/aria labels where the
 * structured chip layout is not available.
 */
export function previewToString(preview: DispatchPreview): string {
    if (preview.Kind === "Wait") {
        return `Wait ${preview.DurationMs} ms`;
    }
    if (!preview.HasKey && preview.Modifiers.length === 0) {
        return "(empty combo)";
    }
    return [...preview.Modifiers, preview.Key].filter(Boolean).join(" + ");
}
