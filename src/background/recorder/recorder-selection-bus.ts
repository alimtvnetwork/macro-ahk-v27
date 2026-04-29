/**
 * Marco Extension — Recorder Selection Bus
 *
 * Tiny pub/sub channel that lets the Options Step Group Library panel
 * and the in-page Floating Controller share a single "active selection"
 * between them. When a user clicks a tree node on either surface, both
 * surfaces update; clicking a step on the Controller scrolls/highlights
 * the matching row in Options, and vice versa.
 *
 * Persistence is intentionally **memory + window event** only — no
 * `chrome.storage`, no `localStorage`. The selection is ephemeral UX
 * state, not user data, and we want zero round-trip lag while clicking.
 * Cross-tab sync (Options tab ↔ recorded tab) layers on top via the
 * `chrome.storage.local` mirror in `recorder-session-storage.ts` plus
 * a separate, dedicated key (kept here as a constant so future wiring
 * has one canonical name to import).
 *
 * @see ../../components/recorder/FloatingController.tsx
 * @see ../../components/options/StepGroupLibraryPanel.tsx
 */

export interface RecorderSelection {
    /** StepGroupId of the active branch (Project root if null). */
    readonly StepGroupId: number | null;
    /** Optional StepId when a single step row is active. */
    readonly StepId: number | null;
    /** Origin of the change — used to suppress feedback loops. */
    readonly Source: "options" | "controller" | "external";
}

const EVENT_NAME = "marco:recorder-selection-changed";

/** Storage key reserved for future cross-tab mirroring. */
export const RECORDER_SELECTION_STORAGE_KEY = "marco_recorder_selection_v1";

let current: RecorderSelection = { StepGroupId: null, StepId: null, Source: "external" };

export function getSelection(): RecorderSelection {
    return current;
}

export function setSelection(next: RecorderSelection): void {
    current = next;
    if (typeof window === "undefined") { return; }
    window.dispatchEvent(new CustomEvent<RecorderSelection>(EVENT_NAME, { detail: next }));
}

export function subscribeSelection(listener: (sel: RecorderSelection) => void): () => void {
    if (typeof window === "undefined") { return () => { /* noop */ }; }
    const handler = (e: Event) => {
        const detail = (e as CustomEvent<RecorderSelection>).detail;
        listener(detail);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
}
