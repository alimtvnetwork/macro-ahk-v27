/**
 * Marco Extension — Recorder Keyboard Shortcuts
 *
 * Window-level keydown listener that maps three chords to the recorder
 * lifecycle while a recording session is active. Shortcuts intentionally
 * no-op when the user is in an editable field (input/textarea/contentEditable)
 * so they never swallow legitimate typing.
 *
 *   • Ctrl+Alt+P  — Play / Resume (Paused → Recording)
 *   • Ctrl+Alt+;  — Pause          (Recording → Paused)
 *   • Ctrl+Alt+.  — Stop           (active → Idle)
 *
 * The shortcuts are only wired while {@link UseRecorderShortcutsArgs.session}
 * is non-null — matching the requirement that they apply *while a recording
 * is active*. Stop in particular is a one-shot (no two-tap arming) because
 * the chord is already deliberate.
 */

import { useEffect } from "react";

import type { RecordingSession } from "@/background/recorder/recorder-session-types";

export interface UseRecorderShortcutsArgs {
    readonly session: RecordingSession | null;
    readonly onResume: () => void | Promise<void>;
    readonly onPause: () => void | Promise<void>;
    readonly onStop: () => void | Promise<void>;
}

export const RECORDER_SHORTCUT_LABELS = {
    Play: "Ctrl+Alt+P",
    Pause: "Ctrl+Alt+;",
    Stop: "Ctrl+Alt+.",
} as const;

function isEditableTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) { return false; }
    if (t.isContentEditable) { return true; }
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Returns true if the event matches a Ctrl+Alt+<key> chord (no Shift/Meta). */
function matchesChord(e: KeyboardEvent, key: string): boolean {
    return e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && e.key === key;
}

export function useRecorderShortcuts(args: UseRecorderShortcutsArgs): void {
    const { session, onResume, onPause, onStop } = args;
    const phase = session?.Phase ?? null;

    useEffect(() => {
        if (phase === null || phase === "Idle") { return; }
        if (typeof window === "undefined") { return; }

        const onKey = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) { return; }

            // Ctrl+Alt+P — Play/Resume (only meaningful when Paused).
            if (matchesChord(e, "p") || matchesChord(e, "P")) {
                if (phase === "Paused") {
                    e.preventDefault();
                    void onResume();
                }
                return;
            }

            // Ctrl+Alt+; — Pause (only meaningful when Recording).
            if (matchesChord(e, ";")) {
                if (phase === "Recording") {
                    e.preventDefault();
                    void onPause();
                }
                return;
            }

            // Ctrl+Alt+. — Stop (always allowed when a session exists).
            if (matchesChord(e, ".")) {
                e.preventDefault();
                void onStop();
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [phase, onResume, onPause, onStop]);
}
