/**
 * Marco Extension — Keyword Event playback engine
 *
 * Executes a {@link KeywordEvent}'s ordered steps sequentially:
 *   • "Key"  — dispatches a synthetic KeyboardEvent (keydown+keyup) on the
 *             active element (or document.body fallback) with parsed modifiers.
 *   • "Wait" — awaits the specified duration before continuing.
 *
 * Designed to be cancellable via {@link AbortSignal} so the recorder can
 * abort scripted playback when the user hits Stop.
 */

import {
    DEFAULT_KEYWORD_EVENT_TARGET,
    type KeywordEvent,
    type KeywordEventStep,
    type KeywordEventTarget,
} from "@/hooks/use-keyword-events";

export interface PlaybackOptions {
    /**
     * Explicit override target. When provided, **always wins** over the
     * event's own `Target` config — used by tests and by callers that need to
     * route playback to a specific in-page element regardless of the event's
     * stored preference. When omitted, the event's `Target` is resolved.
     */
    readonly target?: EventTarget | null;
    /** Abort the playback mid-sequence. */
    readonly signal?: AbortSignal;
    /** Per-step lifecycle callback for telemetry/UI progress. */
    readonly onStep?: (step: KeywordEventStep, index: number) => void;
}

export interface PlaybackResult {
    readonly Completed: boolean;
    readonly StepsRun: number;
    readonly Aborted: boolean;
}

interface ParsedCombo {
    readonly Key: string;
    readonly Ctrl: boolean;
    readonly Shift: boolean;
    readonly Alt: boolean;
    readonly Meta: boolean;
}

/** Parse a combo string like "Ctrl+Shift+Enter" into its parts. */
export function parseCombo(combo: string): ParsedCombo {
    const parts = combo.split("+").map(p => p.trim()).filter(Boolean);
    let Ctrl = false, Shift = false, Alt = false, Meta = false;
    let Key = "";
    for (const p of parts) {
        const lower = p.toLowerCase();
        if (lower === "ctrl" || lower === "control") Ctrl = true;
        else if (lower === "shift") Shift = true;
        else if (lower === "alt" || lower === "option") Alt = true;
        else if (lower === "meta" || lower === "cmd" || lower === "command") Meta = true;
        else Key = p;
    }
    return { Key, Ctrl, Shift, Alt, Meta };
}

/**
 * Resolve a {@link KeywordEventTarget} to a concrete `EventTarget` against
 * the live DOM. Pure helper exported so the panel UI can reuse the same
 * logic to preview which element will receive playback.
 *
 * Falls back to `document.body` (then `document`) when a Selector matches
 * nothing — playback never silently no-ops, and tests can detect the
 * fallback by checking the returned node identity.
 */
export function resolveEventTarget(
    cfg: KeywordEventTarget | undefined,
    doc?: Document,
): EventTarget {
    const d: Document | undefined = doc ?? (typeof document !== "undefined" ? document : undefined);
    if (d === undefined) {
        throw new Error("No DOM target available for keyboard playback");
    }
    const fallback: EventTarget = d.body ?? d;
    const target = cfg ?? DEFAULT_KEYWORD_EVENT_TARGET;
    switch (target.Kind) {
        case "ActiveElement":
            return d.activeElement ?? fallback;
        case "Body":
            return fallback;
        case "Selector": {
            const sel = target.Selector.trim();
            if (sel === "") { return fallback; }
            try {
                const node = d.querySelector(sel);
                return node ?? fallback;
            } catch {
                // Invalid CSS selector — surface a fallback rather than throw
                // so a typo in the panel doesn't crash playback.
                return fallback;
            }
        }
    }
}

function resolveTarget(
    explicit: EventTarget | null | undefined,
    eventCfg: KeywordEventTarget | undefined,
): EventTarget {
    if (explicit) { return explicit; }
    return resolveEventTarget(eventCfg);
}

function dispatchKey(target: EventTarget, type: "keydown" | "keyup", parsed: ParsedCombo): void {
    const init: KeyboardEventInit = {
        key: parsed.Key,
        code: parsed.Key.length === 1 ? `Key${parsed.Key.toUpperCase()}` : parsed.Key,
        ctrlKey: parsed.Ctrl,
        shiftKey: parsed.Shift,
        altKey: parsed.Alt,
        metaKey: parsed.Meta,
        bubbles: true,
        cancelable: true,
    };
    target.dispatchEvent(new KeyboardEvent(type, init));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, Math.max(0, ms));
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/**
 * Run all steps of `event` sequentially. Resolves with a result describing
 * whether playback completed or was aborted.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Enabled-skip + abort + Kind switch in one loop is intentional
export async function runKeywordEvent(
    event: KeywordEvent,
    options: PlaybackOptions = {},
): Promise<PlaybackResult> {
    if (!event.Enabled) {
        return { Completed: false, StepsRun: 0, Aborted: false };
    }

    const target = resolveTarget(options.target, event.Target);
    let stepsRun = 0;

    try {
        for (let i = 0; i < event.Steps.length; i += 1) {
            if (options.signal?.aborted) {
                return { Completed: false, StepsRun: stepsRun, Aborted: true };
            }
            const step = event.Steps[i];
            // Per-step Enabled flag: undefined / true = run, false = skip.
            // The onStep notification still fires so UIs that highlight the
            // currently-running index stay in sync with the visible list.
            options.onStep?.(step, i);
            if (step.Enabled === false) continue;

            if (step.Kind === "Key") {
                const parsed = parseCombo(step.Combo);
                if (!parsed.Key) continue;
                dispatchKey(target, "keydown", parsed);
                dispatchKey(target, "keyup", parsed);
            } else {
                await wait(step.DurationMs, options.signal);
            }
            stepsRun += 1;
        }
        return { Completed: true, StepsRun: stepsRun, Aborted: false };
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
            return { Completed: false, StepsRun: stepsRun, Aborted: true };
        }
        throw err;
    }
}
