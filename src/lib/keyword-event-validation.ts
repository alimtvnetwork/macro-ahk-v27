/**
 * Marco Extension — Keyword Event input validation
 *
 * Pure validation helpers for the Keyword Events editor. The editor uses
 * these to surface inline error messages and to gate the per-event Run
 * button so users can't dispatch a sequence containing malformed steps
 * (empty combos, modifier-only combos, unknown key tokens, NaN/negative
 * wait durations, …).
 *
 * Pure — no DOM, no React, no localStorage. Drives both UI (panel) and
 * tests directly.
 */

import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";

/* ------------------------------------------------------------------ */
/*  Known-key vocabulary                                               */
/* ------------------------------------------------------------------ */

const MODIFIER_TOKENS: ReadonlySet<string> = new Set([
    "ctrl", "control",
    "shift",
    "alt", "option",
    "meta", "cmd", "command",
]);

/**
 * Curated list of named keys we consider valid in a combo. Single-character
 * keys (letters/digits/punctuation) are also accepted — see {@link isKnownKey}.
 * Kept in sync with the playback parser (`parseCombo`) so what the editor
 * accepts is exactly what the dispatcher can fire.
 */
const NAMED_KEYS: ReadonlySet<string> = new Set([
    "enter", "return",
    "tab",
    "escape", "esc",
    "space", "spacebar",
    "backspace",
    "delete", "del",
    "insert", "ins",
    "home", "end",
    "pageup", "pagedown",
    "arrowup", "arrowdown", "arrowleft", "arrowright",
    "up", "down", "left", "right",
    "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
    "capslock",
    "numlock",
    "scrolllock",
    "printscreen",
    "pause",
    "contextmenu",
]);

function isKnownKey(token: string): boolean {
    const t = token.trim();
    if (t === "") { return false; }
    // Single character — printable ASCII / unicode letter, digit, or symbol.
    if (t.length === 1) { return true; }
    return NAMED_KEYS.has(t.toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Combo validation                                                   */
/* ------------------------------------------------------------------ */

export type ComboValidation =
    | { readonly Valid: true }
    | { readonly Valid: false; readonly Reason: ComboInvalidReason; readonly Message: string };

export type ComboInvalidReason =
    | "Empty"
    | "ModifiersOnly"
    | "UnknownKey"
    | "MultipleKeys";

/**
 * Validate a key combo string the user typed in the editor.
 *
 *   parseCombo accepts whitespace-separated tokens joined by `+`. We mirror
 *   that here, then enforce: at least one non-modifier token, exactly one
 *   non-modifier (the key), and the key must be known.
 */
export function validateCombo(raw: string): ComboValidation {
    const trimmed = raw.trim();
    if (trimmed === "") {
        return { Valid: false, Reason: "Empty", Message: "Key combo cannot be empty." };
    }

    const tokens = trimmed.split("+").map(t => t.trim()).filter(t => t !== "");
    if (tokens.length === 0) {
        return { Valid: false, Reason: "Empty", Message: "Key combo cannot be empty." };
    }

    const nonModifier = tokens.filter(t => !MODIFIER_TOKENS.has(t.toLowerCase()));
    if (nonModifier.length === 0) {
        return {
            Valid: false,
            Reason: "ModifiersOnly",
            Message: "Combo must include a key, not only modifiers (Ctrl/Shift/Alt/Meta).",
        };
    }
    if (nonModifier.length > 1) {
        return {
            Valid: false,
            Reason: "MultipleKeys",
            Message: `Combo can only have one key — found: ${nonModifier.join(", ")}.`,
        };
    }
    const key = nonModifier[0];
    if (!isKnownKey(key)) {
        return {
            Valid: false,
            Reason: "UnknownKey",
            Message: `Unknown key "${key}". Use a single character or a named key like Enter, Tab, F5.`,
        };
    }
    return { Valid: true };
}

/* ------------------------------------------------------------------ */
/*  Wait validation                                                    */
/* ------------------------------------------------------------------ */

export type WaitValidation =
    | { readonly Valid: true; readonly Ms: number }
    | { readonly Valid: false; readonly Reason: WaitInvalidReason; readonly Message: string };

export type WaitInvalidReason =
    | "Empty"
    | "NotANumber"
    | "Negative"
    | "NotFinite"
    | "TooLarge";

const MAX_WAIT_MS = 600_000; // 10 minutes — generous upper bound

/**
 * Validate a wait-duration draft (the raw string from the input). Accepts
 * integer milliseconds in the closed range [0, {@link MAX_WAIT_MS}].
 */
export function validateWait(raw: string): WaitValidation {
    const trimmed = raw.trim();
    if (trimmed === "") {
        return { Valid: false, Reason: "Empty", Message: "Wait duration is required." };
    }
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
        return { Valid: false, Reason: "NotANumber", Message: "Wait duration must be a number." };
    }
    if (!Number.isFinite(n)) {
        return { Valid: false, Reason: "NotFinite", Message: "Wait duration must be a finite number." };
    }
    if (n < 0) {
        return { Valid: false, Reason: "Negative", Message: "Wait duration cannot be negative." };
    }
    if (n > MAX_WAIT_MS) {
        return {
            Valid: false,
            Reason: "TooLarge",
            Message: `Wait duration is too large (max ${MAX_WAIT_MS} ms).`,
        };
    }
    return { Valid: true, Ms: Math.floor(n) };
}

/* ------------------------------------------------------------------ */
/*  Step + event validation                                            */
/* ------------------------------------------------------------------ */

export interface StepIssue {
    readonly StepId: string;
    readonly Index: number;
    readonly Kind: KeywordEventStep["Kind"];
    readonly Message: string;
}

/**
 * Walk an event's stored steps and surface issues for any step that would
 * be rejected by the editor today (empty/invalid combos, bad wait values).
 */
export function validateEventSteps(event: KeywordEvent): readonly StepIssue[] {
    const issues: StepIssue[] = [];
    event.Steps.forEach((step, index) => {
        if (step.Kind === "Key") {
            const v = validateCombo(step.Combo);
            if (!v.Valid) {
                issues.push({ StepId: step.Id, Index: index, Kind: "Key", Message: v.Message });
            }
        } else {
            // Wait steps are stored as numbers — re-run the same checks.
            const ms = step.DurationMs;
            if (typeof ms !== "number" || Number.isNaN(ms)) {
                issues.push({ StepId: step.Id, Index: index, Kind: "Wait", Message: "Wait duration must be a number." });
            } else if (!Number.isFinite(ms)) {
                issues.push({ StepId: step.Id, Index: index, Kind: "Wait", Message: "Wait duration must be a finite number." });
            } else if (ms < 0) {
                issues.push({ StepId: step.Id, Index: index, Kind: "Wait", Message: "Wait duration cannot be negative." });
            } else if (ms > MAX_WAIT_MS) {
                issues.push({ StepId: step.Id, Index: index, Kind: "Wait", Message: `Wait duration is too large (max ${MAX_WAIT_MS} ms).` });
            }
        }
    });
    return issues;
}

/** Convenience — true when an event has zero validation issues across all steps. */
export function isEventRunnable(event: KeywordEvent): boolean {
    if (!event.Enabled) { return false; }
    if (event.Steps.length === 0) { return false; }
    return validateEventSteps(event).length === 0;
}

export const KEYWORD_EVENT_VALIDATION_LIMITS = {
    MaxWaitMs: MAX_WAIT_MS,
} as const;
