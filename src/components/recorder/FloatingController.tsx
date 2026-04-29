/**
 * Marco Extension — Floating Recorder Controller (MVP)
 *
 * Compact floating panel that surfaces the active RecordingSession with
 * Play/Pause/Stop controls. Three modes:
 *   • Mini     — recording dot + Stop (two-tap safety)
 *   • Compact  — Play/Pause + Stop, elapsed timer, status chips for the
 *                active StepGroup / SubGroup, step counter
 *   • Expanded — Compact + space for future panels (last captured step,
 *                quick-actions). MVP renders the chips only.
 *
 * Position: per-session top-right (no drag in MVP). Mode persists in
 * `chrome.storage.local` via a tiny adapter so the user's preference
 * survives reloads. Phase + dispatchers come from
 * {@link useRecordingSession} so this component is purely presentational.
 *
 * @see ../../hooks/use-recording-session.ts
 * @see ../../background/recorder/recorder-store.ts
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Activity,
    Circle,
    ExternalLink,
    Keyboard,
    Layers,
    Maximize2,
    Minimize2,
    Pause,
    Play,
    Plus,
    Square,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RecordingSession } from "@/background/recorder/recorder-session-types";
import { RecorderLiveTreePanel } from "./RecorderLiveTreePanel";
import { LiveRecordedActionsTree } from "./LiveRecordedActionsTree";
import { HotkeyChordCapture } from "./HotkeyChordCapture";
import { useStepLibrary } from "@/hooks/use-step-library";
import { useRecorderSelection } from "@/hooks/use-recorder-selection";
import { useDraggable } from "@/hooks/use-draggable";
import { openExtensionOptions } from "@/lib/open-extension-options";
import { loadPanelToggles, savePanelToggles } from "@/lib/controller-panel-toggles";
import { StepKindId } from "@/background/recorder/step-library/schema";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

export type ControllerMode = "mini" | "compact" | "expanded";

const MODE_STORAGE_KEY = "marco-floating-controller-mode";
const STOP_CONFIRM_TIMEOUT_MS = 2500;

export interface FloatingControllerProps {
    readonly session: RecordingSession;
    readonly activeStepGroupName?: string | null;
    readonly activeSubGroupName?: string | null;
    readonly onStart?: () => void | Promise<void>;
    readonly onPause: () => void | Promise<void>;
    readonly onResume: () => void | Promise<void>;
    readonly onStop: () => void | Promise<void>;
    /** Optional override for SSR/tests so we don't poke window during render. */
    readonly initialMode?: ControllerMode;
}

/* ------------------------------------------------------------------ */
/*  Mode persistence                                                   */
/* ------------------------------------------------------------------ */

function loadMode(): ControllerMode {
    if (typeof window === "undefined") { return "compact"; }
    try {
        const raw = window.localStorage.getItem(MODE_STORAGE_KEY);
        if (raw === "mini" || raw === "compact" || raw === "expanded") { return raw; }
    } catch { /* ignore */ }
    return "compact";
}

function saveMode(mode: ControllerMode): void {
    if (typeof window === "undefined") { return; }
    try { window.localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/*  Elapsed timer                                                      */
/* ------------------------------------------------------------------ */

function formatElapsed(startedAt: string, nowMs: number): string {
    const startMs = Date.parse(startedAt);
    if (Number.isNaN(startMs)) { return "00:00"; }
    const total = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    if (total < 3600) { return `${m}:${s}`; }
    const h = Math.floor(total / 3600).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function useElapsedTicker(startedAt: string, isRunning: boolean): string {
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        if (!isRunning) { return; }
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [isRunning]);
    return useMemo(() => formatElapsed(startedAt, now), [startedAt, now]);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FloatingController(props: FloatingControllerProps): JSX.Element {
    const { session, activeStepGroupName, activeSubGroupName, onStart, onPause, onResume, onStop, initialMode } = props;

    const [mode, setMode] = useState<ControllerMode>(() => initialMode ?? loadMode());
    const [stopArmed, setStopArmed] = useState<boolean>(false);
    const stopTimer = useRef<number | null>(null);

    /** Toggles for the three expanded-mode panels. Persisted per-SessionId
     *  via {@link loadPanelToggles} / {@link savePanelToggles} so the user's
     *  last layout (e.g. "Tree open + Actions open + Hotkey closed") survives
     *  reloads while a session is active, and a fresh session starts from the
     *  documented defaults instead of inheriting the previous one's UI. */
    const initialToggles = useMemo(() => loadPanelToggles(session.SessionId), [session.SessionId]);
    const [showActions, setShowActions] = useState<boolean>(initialToggles.Actions);
    const [showTree, setShowTree] = useState<boolean>(initialToggles.Tree);
    const [showHotkey, setShowHotkey] = useState<boolean>(initialToggles.Hotkey);

    // When the active session changes (e.g. the user stopped one and started
    // another), re-hydrate the panel state from storage so each session shows
    // its own remembered layout.
    const lastSessionIdRef = useRef<string>(session.SessionId);
    useEffect(() => {
        if (lastSessionIdRef.current === session.SessionId) { return; }
        lastSessionIdRef.current = session.SessionId;
        const next = loadPanelToggles(session.SessionId);
        setShowActions(next.Actions);
        setShowTree(next.Tree);
        setShowHotkey(next.Hotkey);
    }, [session.SessionId]);

    // Persist any toggle change for the current session immediately so a
    // page reload or controller remount restores the same layout.
    useEffect(() => {
        savePanelToggles(session.SessionId, {
            Actions: showActions,
            Tree: showTree,
            Hotkey: showHotkey,
        });
    }, [session.SessionId, showActions, showTree, showHotkey]);

    useEffect(() => { saveMode(mode); }, [mode]);
    useEffect(() => () => {
        if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
    }, []);

    const isRecording = session.Phase === "Recording";
    const isPaused = session.Phase === "Paused";
    const isIdle = session.Phase === "Idle";
    const isActive = !isIdle;
    const elapsed = useElapsedTicker(session.StartedAt, isRecording);
    const stepCount = session.Steps.length;

    /* Auto-promote: when a recording starts while we're in mini mode,
     * pop up to compact so the user can see step count + chips. We
     * remember the previous mode so Stop returns the user to it. */
    const prevPhaseRef = useRef(session.Phase);
    const prePromoteModeRef = useRef<ControllerMode | null>(null);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = session.Phase;
        if (prev === "Idle" && session.Phase === "Recording" && mode === "mini") {
            prePromoteModeRef.current = "mini";
            setMode("compact");
            return;
        }
        if (prev !== "Idle" && session.Phase === "Idle" && prePromoteModeRef.current !== null) {
            setMode(prePromoteModeRef.current);
            prePromoteModeRef.current = null;
        }
    }, [session.Phase, mode]);

    const handleStop = () => {
        if (!isActive) { return; }
        if (!stopArmed) {
            setStopArmed(true);
            if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
            stopTimer.current = window.setTimeout(() => setStopArmed(false), STOP_CONFIRM_TIMEOUT_MS);
            return;
        }
        if (stopTimer.current !== null) { window.clearTimeout(stopTimer.current); }
        stopTimer.current = null;
        setStopArmed(false);
        void onStop();
    };

    const cyclePrimary = () => {
        if (isIdle) { if (onStart !== undefined) { void onStart(); } return; }
        void (isRecording ? onPause() : onResume());
    };

    const primaryAriaLabel = isIdle
        ? "Start recording"
        : isRecording ? "Pause recording" : "Resume recording";
    const primaryDisabled = isIdle && onStart === undefined;
    const primaryShortcut = isRecording ? "Ctrl+Alt+;" : "Ctrl+Alt+P";
    const primaryTooltip = `${primaryAriaLabel} (${primaryShortcut})`;
    const stopTooltip = isActive ? "Stop recording (Ctrl+Alt+.)" : "Stop recording";

    /* ------------------------------------------------------------ */
    /*  Mini mode                                                    */
    /* ------------------------------------------------------------ */
    if (mode === "mini") {
        return (
            <FloatingShell mode={mode} onModeChange={setMode} testid="floating-controller-mini">
                <div className="flex items-center gap-2">
                    <RecordingDot isRecording={isRecording} />
                    <StopButton armed={stopArmed} onClick={handleStop} compact disabled={!isActive} title={stopTooltip} />
                </div>
            </FloatingShell>
        );
    }

    /* ------------------------------------------------------------ */
    /*  Compact / Expanded modes                                     */
    /* ------------------------------------------------------------ */
    return (
        <FloatingShell mode={mode} onModeChange={setMode} testid={`floating-controller-${mode}`}>
            <div className="flex items-center gap-2">
                <RecordingDot isRecording={isRecording} />
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={cyclePrimary}
                    disabled={primaryDisabled}
                    className="h-8 px-3"
                    data-testid="controller-primary"
                    data-phase={session.Phase}
                    aria-label={primaryAriaLabel}
                    title={primaryTooltip}
                >
                    {isRecording ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <StopButton armed={stopArmed} onClick={handleStop} disabled={!isActive} title={stopTooltip} />
                <span
                    className="text-xs font-mono tabular-nums text-muted-foreground min-w-[3.5rem] text-right"
                    data-testid="controller-elapsed"
                >
                    {elapsed}
                </span>
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { openExtensionOptions(); }}
                    className="h-8 w-8 ml-auto"
                    data-testid="controller-open-options"
                    aria-label="Open extension options page"
                    title="Open Options — view full recording status & captured items"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {session.Phase}
                </Badge>
                {activeStepGroupName !== null && activeStepGroupName !== undefined && activeStepGroupName !== "" ? (
                    <Badge variant="secondary" className="text-[10px]" data-testid="controller-stepgroup-chip">
                        {activeStepGroupName}
                    </Badge>
                ) : null}
                {activeSubGroupName !== null && activeSubGroupName !== undefined && activeSubGroupName !== "" ? (
                    <Badge variant="secondary" className="text-[10px]" data-testid="controller-subgroup-chip">
                        {activeSubGroupName}
                    </Badge>
                ) : null}
                <Badge variant="outline" className="text-[10px]">
                    {stepCount} step{stepCount === 1 ? "" : "s"}
                </Badge>
            </div>

            {mode === "expanded" ? (
                <>
                    <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 mt-1">
                        Project: <span className="font-mono">{session.ProjectSlug}</span>
                    </div>
                    <div className="flex items-center gap-1 pt-1">
                        <ToolToggle
                            active={showActions}
                            onClick={() => setShowActions((p) => !p)}
                            icon={<Activity className="h-3 w-3" />}
                            label="Actions"
                            testid="controller-toggle-actions"
                        />
                        <ToolToggle
                            active={showTree}
                            onClick={() => setShowTree((p) => !p)}
                            icon={<Layers className="h-3 w-3" />}
                            label="Tree"
                            testid="controller-toggle-tree"
                        />
                        <ToolToggle
                            active={showHotkey}
                            onClick={() => setShowHotkey((p) => !p)}
                            icon={<Keyboard className="h-3 w-3" />}
                            label="Hotkey"
                            testid="controller-toggle-hotkey"
                        />
                    </div>
                    {showActions ? <LiveRecordedActionsTree /> : null}
                    {showHotkey ? <HotkeyQuickAdd onClose={() => setShowHotkey(false)} /> : null}
                    {showTree ? <RecorderLiveTreePanel /> : null}
                </>
            ) : null}
        </FloatingShell>
    );
}

/* ------------------------------------------------------------------ */
/*  Hotkey quick-add panel                                              */
/* ------------------------------------------------------------------ */

function HotkeyQuickAdd(props: { onClose: () => void }): JSX.Element {
    const lib = useStepLibrary();
    const { selection } = useRecorderSelection("controller");
    const [chords, setChords] = useState<readonly string[]>([]);
    const [waitMs, setWaitMs] = useState<string>("");
    const [label, setLabel] = useState<string>("");
    const [error, setError] = useState<string | null>(null);

    // Pick the active group from the shared selection bus, falling
    // back to the first available group so users don't get stuck when
    // they haven't clicked anything yet.
    const targetGroup = useMemo(() => {
        if (selection.StepGroupId !== null) {
            return lib.Groups.find((g) => g.StepGroupId === selection.StepGroupId) ?? null;
        }
        return lib.Groups[0] ?? null;
    }, [selection.StepGroupId, lib.Groups]);

    const handleAdd = () => {
        setError(null);
        if (targetGroup === null) {
            setError("No StepGroup available — create one in the Options page first.");
            return;
        }
        if (chords.length === 0) {
            setError("Capture at least one key combination.");
            return;
        }
        const wait = waitMs.trim() === "" ? undefined : Number(waitMs.trim());
        if (wait !== undefined && (!Number.isFinite(wait) || wait < 0)) {
            setError("Wait (ms) must be a non-negative number.");
            return;
        }
        const payload = wait === undefined
            ? { Keys: [...chords] }
            : { Keys: [...chords], WaitMs: wait };
        try {
            lib.appendStep({
                StepGroupId: targetGroup.StepGroupId,
                StepKindId: StepKindId.Hotkey,
                Label: label.trim() === "" ? null : label.trim(),
                PayloadJson: JSON.stringify(payload),
            });
            setChords([]);
            setWaitMs("");
            setLabel("");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <div className="border-t border-border/40 mt-1 pt-1.5 space-y-1.5" data-testid="controller-hotkey-panel">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Hotkey macro</span>
                <button
                    type="button"
                    onClick={props.onClose}
                    aria-label="Close hotkey panel"
                    className="text-muted-foreground hover:text-foreground"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>
            <div className="text-[11px] text-muted-foreground">
                Target: <span className="font-mono">{targetGroup?.Name ?? "(none)"}</span>
            </div>
            <HotkeyChordCapture value={chords} onChange={setChords} />
            <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optional)"
                className="h-7 text-xs"
            />
            <Input
                type="number"
                min={0}
                value={waitMs}
                onChange={(e) => setWaitMs(e.target.value)}
                placeholder="Wait after (ms, optional)"
                className="h-7 text-xs"
            />
            {error !== null ? (
                <p className="text-[11px] text-destructive">{error}</p>
            ) : null}
            <Button
                size="sm"
                onClick={handleAdd}
                className="w-full h-7 text-xs"
                data-testid="controller-hotkey-add"
            >
                <Plus className="h-3 w-3 mr-1" /> Append hotkey step
            </Button>
        </div>
    );
}

function ToolToggle(props: {
    readonly active: boolean;
    readonly onClick: () => void;
    readonly icon: React.ReactNode;
    readonly label: string;
    readonly testid: string;
}): JSX.Element {
    return (
        <button
            type="button"
            onClick={props.onClick}
            data-testid={props.testid}
            aria-pressed={props.active}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors",
                props.active
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
        >
            {props.icon}
            {props.label}
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Subcomponents                                                      */
/* ------------------------------------------------------------------ */

function FloatingShell(props: {
    mode: ControllerMode;
    onModeChange: (m: ControllerMode) => void;
    children: React.ReactNode;
    testid: string;
}): JSX.Element {
    const { mode, onModeChange, children, testid } = props;
    const { position, isDragging, containerRef, handleProps } = useDraggable();
    const positioned = position !== null;
    return (
        <div
            ref={containerRef}
            className={cn(
                "fixed z-[2147483600]",
                // Default top-right anchor only when the user hasn't dragged yet.
                positioned ? null : "top-4 right-4",
                "rounded-lg border border-border bg-card/95 backdrop-blur",
                "shadow-lg shadow-black/30 text-card-foreground",
                "p-2 flex flex-col gap-1",
                // Smooth size + padding transitions when toggling modes.
                // (We deliberately omit `top/left` from the transition list so
                //  drag motion is 1:1 with the pointer — no easing lag.)
                "transition-[width,min-width,max-width,padding,box-shadow] duration-300 ease-out",
                "will-change-[width,transform]",
                mode === "mini" ? "w-auto min-w-0 max-w-[160px]" : "min-w-[260px] max-w-[340px]",
                isDragging ? "select-none shadow-xl ring-1 ring-primary/40" : null,
            )}
            style={positioned ? { top: position.y, left: position.x, right: "auto" } : undefined}
            role="region"
            aria-label="Floating recorder controller"
            data-testid={testid}
            data-mode={mode}
            data-positioned={positioned ? "true" : "false"}
        >
            <div className="flex items-center justify-between gap-2">
                <span
                    {...handleProps}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground px-1 select-none"
                    title="Drag to reposition"
                >
                    Recorder
                </span>
                <ModeSwitcher mode={mode} onModeChange={onModeChange} />
            </div>
            {/* Re-key on mode swap so the body fades+scales in via the
                shared `enter` keyframe combo. */}
            <div
                key={mode}
                className="animate-enter flex flex-col gap-1"
                data-testid="floating-controller-body"
            >
                {children}
            </div>
        </div>
    );
}

function ModeSwitcher(props: { mode: ControllerMode; onModeChange: (m: ControllerMode) => void }): JSX.Element {
    const { mode, onModeChange } = props;
    const next: Record<ControllerMode, ControllerMode> = {
        mini: "compact",
        compact: "expanded",
        expanded: "mini",
    };
    const Icon = mode === "expanded" ? Minimize2 : Maximize2;
    return (
        <button
            type="button"
            onClick={() => onModeChange(next[mode])}
            className="text-muted-foreground hover:text-foreground transition-all duration-200 p-1 rounded hover-scale"
            aria-label={`Switch to ${next[mode]} mode`}
            data-testid="controller-mode-switch"
        >
            <Icon key={mode} className="h-3 w-3 animate-scale-in" />
        </button>
    );
}

function RecordingDot(props: { isRecording: boolean }): JSX.Element {
    const { isRecording } = props;
    return (
        <span
            className={cn(
                "inline-flex h-2.5 w-2.5 rounded-full",
                isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground",
            )}
            aria-label={isRecording ? "Recording" : "Paused"}
            data-testid="controller-status-dot"
        >
            <Circle className="sr-only" />
        </span>
    );
}

function StopButton(props: { armed: boolean; onClick: () => void; compact?: boolean; disabled?: boolean; title?: string }): JSX.Element {
    const { armed, onClick, compact, disabled, title } = props;
    return (
        <Button
            size="sm"
            variant={armed ? "destructive" : "outline"}
            onClick={onClick}
            disabled={disabled}
            className={cn("h-8", compact ? "px-2" : "px-3")}
            data-testid="controller-stop"
            data-armed={armed ? "true" : "false"}
            aria-label={armed ? "Confirm stop recording" : "Stop recording"}
            title={title}
        >
            <Square className="h-3.5 w-3.5" />
            {!compact ? <span className="ml-1 text-xs">{armed ? "Confirm" : "Stop"}</span> : null}
        </Button>
    );
}
