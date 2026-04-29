/**
 * Marco Extension — Keyword Event Chain shortcut matcher
 *
 * Pure helpers used by the panel to decide whether a keyboard event
 * should run or stop the chain. Kept framework-free so it can be unit-
 * tested without a DOM wrapper.
 *
 * Bindings:
 *   - **Run**  → `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (macOS).
 *   - **Stop** → `Escape` with no modifiers.
 *
 * Both shortcuts ignore key events that originate from text-editing
 * surfaces (`<input>`, `<textarea>`, `contenteditable`) so the user can
 * still type freely inside event editors. The Run shortcut additionally
 * requires the chain to be idle; Stop requires it to be running.
 */

export type ChainShortcutAction = "run" | "stop";

export interface ChainShortcutEvent {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly altKey: boolean;
    readonly shiftKey: boolean;
    /** The element that received the event (used to skip text inputs). */
    readonly target: EventTarget | null;
}

export interface ChainShortcutContext {
    readonly chainRunning: boolean;
    readonly enabledCount: number;
}

/**
 * Returns true when the event originates from a control where a person is
 * actively typing free-form text. We deliberately allow plain `<button>`
 * and other focusable widgets through so the shortcut is reachable from
 * anywhere in the panel.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (target === null) { return false; }
    // EventTarget isn't structurally an Element; guard before reading
    // DOM-specific fields so the helper stays safe in jsdom + headless env.
    const el = target as Partial<HTMLElement> & { tagName?: string; isContentEditable?: boolean };
    const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { return true; }
    if (el.isContentEditable === true) { return true; }
    return false;
}

/**
 * Map a key event to a chain action (or `null` when the event does not
 * match any binding or is suppressed by the current context).
 */
export function matchChainShortcut(
    event: ChainShortcutEvent,
    context: ChainShortcutContext,
): ChainShortcutAction | null {
    // Stop — Escape with no modifiers, only meaningful while running.
    if (event.key === "Escape" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        // Allow Escape from text fields too — closing an editor focus is
        // a common reflex and we don't want it swallowed by the chain.
        if (isTypingTarget(event.target)) { return null; }
        return context.chainRunning ? "stop" : null;
    }

    // Run — Ctrl+Enter / Cmd+Enter, only when idle and there's something
    // to run. Shift/Alt suppress the binding so users can still compose
    // multi-line entries with Shift+Enter inside text fields.
    const isEnter = event.key === "Enter";
    const hasPrimaryMod = event.ctrlKey || event.metaKey;
    if (isEnter && hasPrimaryMod && !event.shiftKey && !event.altKey) {
        if (isTypingTarget(event.target)) { return null; }
        if (context.chainRunning) { return null; }
        if (context.enabledCount <= 0) { return null; }
        return "run";
    }

    return null;
}

/** Human-readable label for the Run shortcut, platform-aware. */
export function describeRunShortcut(isMac: boolean = detectMac()): string {
    return isMac ? "⌘ Enter" : "Ctrl+Enter";
}

/** Human-readable label for the Stop shortcut. */
export function describeStopShortcut(): string {
    return "Esc";
}

function detectMac(): boolean {
    if (typeof navigator === "undefined") { return false; }
    const platform = navigator.platform ?? "";
    return /Mac|iPhone|iPad|iPod/.test(platform);
}
