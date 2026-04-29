/**
 * Marco Extension — Recorder Control Bar
 *
 * Always-visible Play / Pause / Stop control strip for the recorder. Buttons
 * enable/disable based on the active {@link RecordingSession} phase:
 *
 *   • Play   — enabled when no session OR Phase === "Paused" (acts as Resume)
 *   • Pause  — enabled only when Phase === "Recording"
 *   • Stop   — enabled when a session exists (Recording or Paused)
 *
 * Purely presentational over {@link useRecordingSession}; safe to mount in
 * the Options page or any other surface that wants quick recorder controls.
 */

import { Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRecordingSession } from "@/hooks/use-recording-session";
import { KeywordEventsPanel } from "@/components/recorder/KeywordEventsPanel";

export interface RecorderControlBarProps {
    /** Project slug used when starting a fresh session. Defaults to "default". */
    readonly projectSlug?: string;
    readonly className?: string;
}

export function RecorderControlBar(props: RecorderControlBarProps): JSX.Element {
    const { projectSlug, className } = props;
    const { session, start, pause, resume, stop } = useRecordingSession();

    const phase = session?.Phase ?? "Idle";
    const isRecording = phase === "Recording";
    const isPaused = phase === "Paused";
    const isActive = isRecording || isPaused;

    const playEnabled = !isActive || isPaused;
    const pauseEnabled = isRecording;
    const stopEnabled = isActive;

    const handlePlay = () => {
        if (isPaused) { void resume(); return; }
        if (!isActive) { void start(projectSlug); }
    };

    return (
        <div
            className={cn(
                "inline-flex items-center gap-2 rounded-md border border-border bg-card/80 p-1.5",
                className,
            )}
            role="toolbar"
            aria-label="Recorder controls"
            data-testid="recorder-control-bar"
        >
            <Button
                size="sm"
                variant="secondary"
                disabled={!playEnabled}
                onClick={handlePlay}
                className="h-8 px-3"
                aria-label={isPaused ? "Resume recording" : "Start recording"}
                data-testid="recorder-control-play"
            >
                <Play className="h-3.5 w-3.5 mr-1" />
                {isPaused ? "Resume" : "Play"}
            </Button>
            <Button
                size="sm"
                variant="secondary"
                disabled={!pauseEnabled}
                onClick={() => { void pause(); }}
                className="h-8 px-3"
                aria-label="Pause recording"
                data-testid="recorder-control-pause"
            >
                <Pause className="h-3.5 w-3.5 mr-1" />
                Pause
            </Button>
            <Button
                size="sm"
                variant="destructive"
                disabled={!stopEnabled}
                onClick={() => { void stop(); }}
                className="h-8 px-3"
                aria-label="Stop recording"
                data-testid="recorder-control-stop"
            >
                <Square className="h-3.5 w-3.5 mr-1" />
                Stop
            </Button>
            <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider ml-1"
                data-testid="recorder-control-phase"
            >
                {phase}
            </Badge>
            <KeywordEventsPanel className="ml-1" />
        </div>
    );
}
