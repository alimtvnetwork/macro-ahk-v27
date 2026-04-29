/**
 * Marco Extension — Live Recorded Actions Tree
 *
 * Real-time view of `session.Steps` from the active {@link useRecordingSession}.
 * Renders the in-flight steps (Click / Type / Select / Submit / Wait / JsInline)
 * as a clickable list inside the Floating Controller's Expanded mode. Updates
 * automatically as the recorder appends new steps because the source hook
 * re-renders on every storage change.
 *
 * This is intentionally separate from {@link RecorderLiveTreePanel}, which
 * shows the *persisted* Step Group library. This component shows the
 * *transient* draft of the active session — the actions the user is
 * recording right now.
 *
 * ## Selection scroll/highlight contract
 *
 * Selection can be either internal (user clicks a row) or external (the
 * Options page drives `selectedStepId` from the URL / detail panel).
 * Whenever the active selection changes, the matching row is scrolled
 * into view via `scrollIntoView({ block: "nearest" })` and pulses a
 * highlight ring for ~1.2s so the user can locate it without manually
 * scrolling the long action list.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Clock,
    FileCode2,
    MousePointerClick,
    Send,
    SquareCheck,
    Type as TypeIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
    detectTransport,
    subscribeRecorderSession,
    type RecorderSyncTransport,
} from "@/lib/recorder-session-sync";
import type {
    RecordedStep,
    RecordedStepKind,
    RecordingSession,
} from "@/background/recorder/recorder-session-types";

interface KindMeta {
    readonly Icon: typeof MousePointerClick;
    readonly Label: string;
    readonly Tone: string;
}

const KIND_META: Record<RecordedStepKind, KindMeta> = {
    Click:    { Icon: MousePointerClick, Label: "Click",  Tone: "text-primary" },
    Type:     { Icon: TypeIcon,          Label: "Type",   Tone: "text-blue-400" },
    Select:   { Icon: SquareCheck,       Label: "Select", Tone: "text-emerald-400" },
    Submit:   { Icon: Send,              Label: "Submit", Tone: "text-purple-400" },
    Wait:     { Icon: Clock,             Label: "Wait",   Tone: "text-amber-400" },
    JsInline: { Icon: FileCode2,         Label: "JS",     Tone: "text-pink-400" },
};

const HIGHLIGHT_PULSE_MS = 1200;

export interface LiveRecordedActionsTreeProps {
    readonly className?: string;
    readonly onStepClick?: (step: RecordedStep) => void;
    /**
     * Controlled selection. When provided, the tree treats this StepId as the
     * active selection (Options page passes the StepId currently shown in the
     * detail panel). Internal click selection is still honored when this is
     * `null` or `undefined`.
     */
    readonly selectedStepId?: string | null;
}

export function LiveRecordedActionsTree(props: LiveRecordedActionsTreeProps): JSX.Element {
    const { className, onStepClick, selectedStepId: controlledStepId } = props;

    // Subscribe directly to the shared backend transport so this tree
    // stays in lockstep with the active session even if no parent
    // (Options page, Floating Controller) is currently mounted.
    const [session, setSession] = useState<RecordingSession | null>(null);
    const [transport, setTransport] = useState<RecorderSyncTransport>(() => detectTransport());
    useEffect(() => {
        setTransport(detectTransport());
        return subscribeRecorderSession(setSession);
    }, []);

    const steps = session?.Steps ?? [];
    const [internalStepId, setInternalStepId] = useState<string | null>(null);

    // Controlled selection wins over internal clicks so the Options page can
    // drive which row is highlighted without extra plumbing.
    const activeStepId = useMemo<string | null>(() => {
        if (controlledStepId !== undefined && controlledStepId !== null) { return controlledStepId; }
        return internalStepId;
    }, [controlledStepId, internalStepId]);

    // ─────────────────────────────────────────────────────────────────────
    // Refs: one per row so we can scroll the matching row into view.
    // The map is rebuilt each render via the callback ref pattern; rows that
    // unmount remove themselves automatically.
    // ─────────────────────────────────────────────────────────────────────
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
    const setRowRef = (stepId: string) => (node: HTMLLIElement | null): void => {
        if (node === null) { rowRefs.current.delete(stepId); return; }
        rowRefs.current.set(stepId, node);
    };

    // Auto-scroll to the latest step when a new one arrives so the user
    // always sees the most recent action without manual scrolling. Only fires
    // when the user has not pinned a specific selection; otherwise the
    // selection-scroll effect below takes precedence.
    const lastCountRef = useRef<number>(0);
    useEffect(() => {
        if (activeStepId === null && steps.length > lastCountRef.current) {
            const node = scrollRef.current;
            if (node !== null) { node.scrollTop = node.scrollHeight; }
        }
        lastCountRef.current = steps.length;
    }, [steps.length, activeStepId]);

    // Selection scroll + highlight pulse. Runs whenever the active selection
    // changes (internal click OR controlled prop change) so the matching row
    // is always visible regardless of how it was selected. Also re-runs when
    // the underlying step list grows so a controlled selection set *before*
    // the session loaded still gets scrolled/pulsed once its row mounts.
    const [pulseStepId, setPulseStepId] = useState<string | null>(null);
    useEffect(() => {
        if (activeStepId === null) { return; }
        const node = rowRefs.current.get(activeStepId);
        if (node === undefined) { return; }
        // `block: "nearest"` keeps the row visible without jumping if it's
        // already in view, which avoids jitter when the user clicks a visible row.
        node.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setPulseStepId(activeStepId);
        const timer = window.setTimeout(() => { setPulseStepId(null); }, HIGHLIGHT_PULSE_MS);
        return () => { window.clearTimeout(timer); };
    }, [activeStepId, steps.length]);

    const isRecording = session?.Phase === "Recording";
    const isPaused = session?.Phase === "Paused";


    return (
        <div
            className={cn(
                "rounded-md border border-border/60 bg-background/40 p-2 space-y-1.5",
                className,
            )}
            data-testid="live-recorded-actions-tree"
        >
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                <div className="flex items-center gap-1.5">
                    <span
                        className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            isRecording ? "bg-destructive animate-pulse" :
                            isPaused ? "bg-amber-400" : "bg-muted",
                        )}
                        aria-hidden
                    />
                    <span>Live actions</span>
                </div>
                <div className="flex items-center gap-1">
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[9px] px-1 py-0 font-mono",
                            transport === "chrome.storage" && "border-emerald-400/40 text-emerald-400",
                            transport === "memory" && "border-amber-400/40 text-amber-400",
                        )}
                        title={`Live transport: ${transport}`}
                        data-testid="live-actions-transport"
                    >
                        {transport === "chrome.storage" ? "ext" : transport === "localStorage" ? "preview" : "mem"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {steps.length}
                    </Badge>
                </div>
            </div>

            <ScrollArea className="h-[180px]">
                <div ref={scrollRef} className="pr-2">
                    {steps.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-6 italic">
                            {session === null
                                ? "No active session — press Play to start recording."
                                : "Waiting for the first action…"}
                        </p>
                    ) : (
                        <ul className="space-y-1" role="tree" aria-label="Recorded actions">
                            {steps.map((step) => (
                                <ActionRow
                                    key={step.StepId}
                                    rowRef={setRowRef(step.StepId)}
                                    step={step}
                                    selected={activeStepId === step.StepId}
                                    pulsing={pulseStepId === step.StepId}
                                    onClick={() => {
                                        setInternalStepId(step.StepId);
                                        onStepClick?.(step);
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

interface ActionRowProps {
    readonly step: RecordedStep;
    readonly selected: boolean;
    readonly pulsing: boolean;
    readonly onClick: () => void;
    readonly rowRef: (node: HTMLLIElement | null) => void;
}

function ActionRow(props: ActionRowProps): JSX.Element {
    const { step, selected, pulsing, onClick, rowRef } = props;
    const meta = KIND_META[step.Kind];
    const Icon = meta.Icon;
    const selectorPreview = step.Selector?.XPathRelative ?? step.Selector?.XPathFull ?? "";

    return (
        <li
            ref={rowRef}
            role="treeitem"
            aria-selected={selected}
            data-step-id={step.StepId}
            data-pulsing={pulsing ? "true" : undefined}
        >
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "w-full text-left flex items-start gap-2 rounded px-1.5 py-1 text-[11px]",
                    "hover:bg-primary/10 transition-colors",
                    selected && "bg-primary/15 ring-1 ring-primary/40",
                    pulsing && "ring-2 ring-primary animate-pulse",
                )}
                data-testid={`live-action-${step.StepId}`}
                title={selectorPreview}
            >
                <Badge variant="outline" className="text-[9px] w-5 justify-center shrink-0 mt-0.5">
                    {step.Index + 1}
                </Badge>
                <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", meta.Tone)} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="font-medium">{meta.Label}</span>
                        {step.VariableName ? (
                            <code className="text-[10px] text-muted-foreground font-mono truncate">
                                ${step.VariableName}
                            </code>
                        ) : null}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                        {step.Label || selectorPreview || "—"}
                    </div>
                </div>
            </button>
        </li>
    );
}
