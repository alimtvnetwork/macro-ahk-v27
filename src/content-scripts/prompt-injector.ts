/**
 * Marco Extension — Prompt Injector (Content Script)
 *
 * v2.170.0: Refactored to standalone bundle injected via
 * `chrome.scripting.executeScript({ files: [...] })`. Args are handed off
 * via `chrome.storage.session` keyed by a correlation ID; the result is
 * posted back to the background via `chrome.runtime.sendMessage`.
 *
 * Bundle activation contract:
 *   1. Background writes args to `chrome.storage.session` under
 *      `marco_prompt_args.<correlationId>` (TTL: until consumed).
 *   2. Background calls `executeScript({ files: ["content-scripts/prompt-injector.js"] })`.
 *      Chrome may still pass extra metadata via the `world: "ISOLATED"` content-script
 *      `chrome.scripting.executeScript` API. We rely on session storage instead.
 *   3. Bundle bootstrap reads ALL pending args, runs `injectPromptText` for each one,
 *      then posts `{ type: "PROMPT_INJECT_RESULT", correlationId, success, verified, ... }`
 *      and deletes the consumed key.
 *
 * Why pull-all-pending instead of single-key:
 *   `executeScript({ files })` does not let us pass argv. The content script has no
 *   way to know its correlation ID at startup. Reading the entire pending queue and
 *   processing every entry is robust to repeat injection and lost runs.
 */

import { logError } from "./prompt-injector-logger";

/* ------------------------------------------------------------------ */
/*  Editor Discovery                                                   */
/* ------------------------------------------------------------------ */

function findEditorByXPath(xpath: string): HTMLElement | null {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue;
        if (!node) return null;
        // Walk up to find the nearest contenteditable or input/textarea
        let el = node as HTMLElement;
        while (el && el !== document.body) {
            if (el.getAttribute?.("contenteditable") === "true" ||
                el instanceof HTMLTextAreaElement ||
                el instanceof HTMLInputElement) {
                return el;
            }
            el = el.parentElement as HTMLElement;
        }
        return null;
    } catch {
        return null;
    }
}

function findTiptapEditor(chatBoxXPath?: string): HTMLElement | null {
    // Try XPath-based discovery first
    if (chatBoxXPath) {
        const xpathResult = findEditorByXPath(chatBoxXPath);
        if (xpathResult) return xpathResult;
    }

    // Fallback: CSS selectors
    const selectors = [
        ".tiptap.ProseMirror",
        ".ProseMirror[contenteditable='true']",
        "[contenteditable='true'].tiptap",
        "form [contenteditable='true']",
        "[role='textbox'][contenteditable='true']",
        "textarea",
    ];

    for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  DOM Append Insertion                                               */
/* ------------------------------------------------------------------ */

/**
 * Appends prompt text to the editor using direct DOM manipulation.
 * For contenteditable: creates a <p> element and appends it.
 * For textarea/input: appends text to .value.
 * Never uses clipboard APIs or execCommand.
 */
function appendToEditor(editor: HTMLElement, text: string): boolean {
    try {
        editor.focus();

        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            // For textarea/input: append text to existing value
            const currentVal = editor.value ?? "";
            const newVal = currentVal + (currentVal.length > 0 ? "\n" : "") + text;
            const nativeSetter =
                Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ??
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

            if (nativeSetter) {
                nativeSetter.call(editor, newVal);
            } else {
                editor.value = newVal;
            }
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            editor.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
            // For contenteditable (ProseMirror/Tiptap): create a <p> and append it
            const p = document.createElement("p");
            p.textContent = text;
            editor.appendChild(p);
            // Dispatch input event so the editor framework picks up the change
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
            // Move cursor to end of the new content
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(p);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        console.log(`[Marco] Prompt appended (${text.length} chars)`);
        return true;
    } catch (err) {
        logError(
            "appendToEditor",
            `Prompt append failed\n  Path: DOM target element (contenteditable/textarea/ProseMirror)\n  Missing: Successful text insertion of ${text.length} chars\n  Reason: ${err instanceof Error ? err.message : String(err)} — DOM element may not be found or not editable`,
            err,
        );
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Auto-Submit                                                        */
/* ------------------------------------------------------------------ */

function findSubmitButton(): HTMLElement | null {
    const selectors = [
        'button[type="submit"]',
        'form button:last-of-type',
        'button[aria-label*="send" i]',
        'button[aria-label*="submit" i]',
        'button svg[class*="arrow"]',
        'button svg[class*="send"]',
        'form [role="button"]',
    ];

    for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) {
            const btn = el.closest("button") ?? el;
            if (btn && !btn.hasAttribute("disabled")) return btn as HTMLElement;
        }
    }

    // Fallback: last enabled button inside a form containing the editor
    const editor = findTiptapEditor();
    if (editor) {
        const form = editor.closest("form");
        if (form) {
            const buttons = form.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
            if (buttons.length > 0) return buttons[buttons.length - 1];
        }
    }

    return null;
}

function triggerSubmit(): boolean {
    const btn = findSubmitButton();
    if (btn) {
        console.log("[Marco] Auto-submit: clicking send button");
        btn.click();
        return true;
    }

    const editor = findTiptapEditor();
    if (editor) {
        console.log("[Marco] Auto-submit: sending Enter key");
        editor.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
        }));
        return true;
    }

    return false;
}

/* ------------------------------------------------------------------ */
/*  Public API (still exported for future imports)                     */
/* ------------------------------------------------------------------ */

export interface InjectOptions {
    autoSubmit?: boolean;
    submitDelayMs?: number;
    chatBoxXPath?: string;
}

export interface InjectResult {
    success: boolean;
    method: string;
    verified: boolean;
    submitted: boolean;
}

export async function injectPromptText(text: string, options?: InjectOptions): Promise<InjectResult> {
    const editor = findTiptapEditor(options?.chatBoxXPath);
    if (!editor) {
        return { success: false, method: "none", verified: false, submitted: false };
    }

    const success = appendToEditor(editor, text);

    // Auto-submit after injection
    let submitted = false;
    if (success && (options?.autoSubmit ?? true)) {
        const delay = options?.submitDelayMs ?? 200;
        console.log(`[Marco] Waiting ${delay}ms before auto-submit`);
        await new Promise(r => setTimeout(r, delay));
        submitted = triggerSubmit();
    }

    return {
        success,
        method: success ? "dom-append" : "none",
        verified: success,
        submitted,
    };
}

/* ------------------------------------------------------------------ */
/*  Bootstrap — runs immediately when injected via                     */
/*  chrome.scripting.executeScript({ files: [...] })                   */
/* ------------------------------------------------------------------ */

/** Session-storage namespace shared with the background handler. */
const PROMPT_ARGS_KEY = "marco_prompt_args";

/** Result-message type — handled by an inline one-shot listener in the background. */
const PROMPT_INJECT_RESULT = "PROMPT_INJECT_RESULT";

interface PendingPromptArgs {
    text: string;
    chatBoxXPath?: string;
    autoSubmit?: boolean;
    submitDelayMs?: number;
}

/**
 * Drains all pending prompt-injection requests from session storage,
 * runs each one, and posts the result back. Idempotent: if no pending
 * requests exist, the bootstrap is a no-op (so this bundle is safe to
 * load statically in the future).
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- content-script bootstrap: chrome guards + listener wiring + handshake all need shared closure
async function bootstrap(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.session || !chrome.runtime?.sendMessage) {
        return;
    }

    let pending: Record<string, PendingPromptArgs> = {};
    try {
        const stored = await chrome.storage.session.get(PROMPT_ARGS_KEY);
        pending = (stored[PROMPT_ARGS_KEY] as Record<string, PendingPromptArgs> | undefined) ?? {};
    } catch (err) {
        logError(
            "bootstrap.readSession",
            `Failed to read session storage\n  Path: chrome.storage.session.${PROMPT_ARGS_KEY}\n  Missing: pending args object\n  Reason: ${err instanceof Error ? err.message : String(err)}`,
            err,
        );
        return;
    }

    const correlationIds = Object.keys(pending);
    if (correlationIds.length === 0) return;

    for (const correlationId of correlationIds) {
        const args = pending[correlationId];
        let result: InjectResult;
        try {
            result = await injectPromptText(args.text, {
                chatBoxXPath: args.chatBoxXPath,
                autoSubmit: args.autoSubmit,
                submitDelayMs: args.submitDelayMs,
            });
        } catch (err) {
            result = {
                success: false,
                method: "error",
                verified: false,
                submitted: false,
            };
            logError(
                "bootstrap.injectPromptText",
                `Injection threw\n  Path: injectPromptText(correlationId=${correlationId})\n  Missing: completed injection\n  Reason: ${err instanceof Error ? err.message : String(err)}`,
                err,
            );
        }

        try {
            await chrome.runtime.sendMessage({
                type: PROMPT_INJECT_RESULT,
                correlationId,
                ...result,
            });
        } catch (err) {
            // Background may have torn down — no recovery possible.
            logError(
                "bootstrap.sendResult",
                `Failed to post result\n  Path: chrome.runtime.sendMessage(PROMPT_INJECT_RESULT, correlationId=${correlationId})\n  Missing: result delivery to background\n  Reason: ${err instanceof Error ? err.message : String(err)}`,
                err,
            );
        }
    }

    // Clear consumed args so a subsequent injection starts clean.
    try {
        const remaining = await chrome.storage.session.get(PROMPT_ARGS_KEY);
        const map = (remaining[PROMPT_ARGS_KEY] as Record<string, PendingPromptArgs> | undefined) ?? {};
        for (const id of correlationIds) delete map[id];
        if (Object.keys(map).length === 0) {
            await chrome.storage.session.remove(PROMPT_ARGS_KEY);
        } else {
            await chrome.storage.session.set({ [PROMPT_ARGS_KEY]: map });
        }
    } catch (err) {
        console.warn(
            `[Marco] prompt-injector: failed to clear consumed args (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

void bootstrap();
