/**
 * Marco Extension — Floating Controller Host
 *
 * Always-mounted wrapper that subscribes to the active recording session and
 * renders {@link FloatingController}. When no session exists we synthesize an
 * Idle session so the controller stays visible with disabled Pause/Stop and
 * an enabled Play button — clicking Play starts a fresh recording, which
 * automatically promotes the controller out of `mini` into `compact`.
 *
 * Also installs the global recorder keyboard shortcuts via
 * {@link useRecorderShortcuts}; they're only active while a real session
 * exists (Recording or Paused), per spec.
 *
 * @see ../../hooks/use-recording-session.ts
 * @see ../../hooks/use-recorder-shortcuts.ts
 * @see ./FloatingController.tsx
 */

import { useMemo } from "react";

import { useRecordingSession } from "@/hooks/use-recording-session";
import { useRecorderShortcuts } from "@/hooks/use-recorder-shortcuts";
import { FloatingController } from "./FloatingController";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";

const IDLE_PLACEHOLDER: RecordingSession = {
    SessionId: "",
    ProjectSlug: "default",
    StartedAt: "",
    Phase: "Idle",
    Steps: [],
};

export function FloatingControllerHost(): JSX.Element {
    const { session, start, pause, resume, stop } = useRecordingSession();
    useRecorderShortcuts({ session, onResume: resume, onPause: pause, onStop: stop });
    const view = useMemo(() => session ?? IDLE_PLACEHOLDER, [session]);
    return (
        <FloatingController
            session={view}
            onStart={start}
            onPause={pause}
            onResume={resume}
            onStop={stop}
        />
    );
}
