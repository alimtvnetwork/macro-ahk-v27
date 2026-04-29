/**
 * Marco Extension — Keyword Events Panel
 *
 * UI for managing custom keyword events that fire scripted key presses and
 * wait periods during recorder playback. Backed by {@link useKeywordEvents}
 * (localStorage-persisted). Pure presentational; mounted from the recorder
 * surface via a Dialog trigger.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Circle, Clock, Crosshair, GripVertical, Keyboard, Link2, ListOrdered, Play, Plus, Search, Square, Target, Trash2, X, XCircle } from "lucide-react";
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    modifiersFromMouseEvent,
    useShiftClickSelection,
} from "@/hooks/use-shift-click-selection";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DEFAULT_KEYWORD_EVENT_TARGET,
    useKeywordEvents,
    type KeywordEventTarget,
} from "@/hooks/use-keyword-events";
import { useKeywordEventPlayback } from "@/hooks/use-keyword-event-playback";
import { useRecordingSession } from "@/hooks/use-recording-session";
import { useAutoRunChainAfterRecording } from "@/hooks/use-auto-run-chain-after-recording";
import { filterKeywordEvents } from "@/lib/keyword-event-search";
import { KeywordEventStepContextMenu } from "./KeywordEventStepContextMenu";
import {
    DEFAULT_CHAIN_SETTINGS,
    loadChainSettings,
    runKeywordEventChain,
    saveChainSettings,
    type KeywordEventChainSettings,
} from "@/lib/keyword-event-chain";
import {
    isEventRunnable,
    validateCombo,
    validateEventSteps,
    validateWait,
} from "@/lib/keyword-event-validation";
import {
    buildDispatchPreview,
    previewToString,
    type DispatchPreview,
} from "@/lib/keyword-event-dispatch-preview";
import {
    EMPTY_TIMELINE,
    recordChainEnd,
    recordEventEnd,
    recordEventStart,
    recordStep,
    startTimeline,
    type TimelineEntry,
    type TimelineState,
} from "@/lib/keyword-event-chain-timeline";
import {
    describeRunShortcut,
    describeStopShortcut,
    matchChainShortcut,
} from "@/lib/keyword-event-chain-shortcuts";
import { cn } from "@/lib/utils";
import { KeywordEventBulkContextMenu } from "./KeywordEventBulkContextMenu";

export interface KeywordEventsPanelProps {
    readonly trigger?: React.ReactNode;
    readonly className?: string;
}

export function KeywordEventsPanel(props: KeywordEventsPanelProps): JSX.Element {
    const { trigger, className } = props;
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-8 px-3", className)}
                        data-testid="keyword-events-open"
                    >
                        <Keyboard className="h-3.5 w-3.5 mr-1" />
                        Keyword Events
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Custom Keyword Events</DialogTitle>
                    <DialogDescription>
                        Attach keywords that trigger scripted key presses and wait periods during playback.
                    </DialogDescription>
                </DialogHeader>
                <KeywordEventsEditor />
            </DialogContent>
        </Dialog>
    );
}

function KeywordEventsEditor(): JSX.Element {
    const api = useKeywordEvents();
    const playback = useKeywordEventPlayback();
    const [newKeyword, setNewKeyword] = useState("");
    const [search, setSearch] = useState("");

    // Filter the event list by keyword/description/tags (case-insensitive
    // substring). Selection is keyed by Id, so events that drop out of the
    // visible list stay selected — the toolbar count reflects the full
    // selection, not just what's on screen. Drag-reorder is disabled while
    // a filter is active because reordering a sparse subset would corrupt
    // the persisted order of hidden rows.
    const visibleEvents = useMemo(
        () => filterKeywordEvents(api.events, search),
        [api.events, search],
    );
    const isFiltering = search.trim().length > 0;

    // Chain settings — persisted in localStorage so the recorder can read
    // them without prop drilling. We keep a local mirror so the form stays
    // responsive, and write through to storage on every change.
    const [chain, setChain] = useState<KeywordEventChainSettings>(() => loadChainSettings());
    useEffect(() => { saveChainSettings(chain); }, [chain]);

    // Live chain runner state — separate from the per-event playback hook
    // because the chain owns its own AbortController.
    const chainCtrlRef = useRef<AbortController | null>(null);
    const [chainRunning, setChainRunning] = useState(false);
    const [chainProgress, setChainProgress] = useState<{ current: number; total: number } | null>(null);
    // Live timeline log — rebuilt from scratch on every chain run so users
    // see only the current execution. Kept in component state so React
    // re-renders as entries stream in via the chain runner's callbacks.
    const [timeline, setTimeline] = useState<TimelineState>(EMPTY_TIMELINE);

    useEffect(() => () => chainCtrlRef.current?.abort(), []);

    // Auto-run on recorder stop. The hook keeps its own internal "previous
    // session" ref, so it only fires on the actual stop transition. We
    // surface a flag (`autoRunActive`) so the run-chain UI can show a
    // muted indicator while the auto-run is in flight.
    const { session: recordingSession } = useRecordingSession();
    const [autoRunActive, setAutoRunActive] = useState<boolean>(false);
    useAutoRunChainAfterRecording({
        settings: chain,
        events: api.events,
        session: recordingSession,
        onAutoRunStart: () => { setAutoRunActive(true); },
        onAutoRunEnd: () => { setAutoRunActive(false); },
    });

    const enabledCount = api.events.filter((e) => isEventRunnable(e)).length;

    // Gmail-style multi-select for the events list. Plain click selects one,
    // Shift-click extends from anchor, Ctrl/Cmd-click toggles. Anchor pool is
    // the *visible* list so Shift-click extends along what the user sees,
    // not across hidden rows. Selection set itself is preserved across
    // filter changes (see useShiftClickSelection — it prunes only on actual
    // id removal, not on pool changes).
    // Pass the FULL id list (not just visible) so selection persists across
    // search filtering — typing in the search box must not silently drop a
    // selected event that scrolled out of view.
    const eventIds = api.events.map(e => e.Id);
    const eventSelection = useShiftClickSelection(eventIds);
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
    const handleEventRowClick = (id: string, ev: React.MouseEvent): void => {
        // Don't hijack clicks that land on inputs/buttons inside the card.
        const tag = (ev.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "button" || tag === "textarea" || tag === "select" || tag === "label") return;
        if ((ev.target as HTMLElement | null)?.closest("button,input,textarea,select,label,[role=switch],[role=combobox]")) return;
        eventSelection.handleClick(id, modifiersFromMouseEvent(ev.nativeEvent, isMac));
    };

    const handleAdd = () => {
        const k = newKeyword.trim();
        if (!k) return;
        api.addEvent(k);
        setNewKeyword("");
    };

    const handleRunChain = async (): Promise<void> => {
        chainCtrlRef.current?.abort();
        const ctrl = new AbortController();
        chainCtrlRef.current = ctrl;
        // Only chain events that are both enabled and free of validation
        // issues — invalid events would silently no-op or throw mid-chain.
        const runnable = api.events.filter((e) => isEventRunnable(e));
        setChainProgress({ current: 0, total: runnable.length });
        setChainRunning(true);
        // Reset and start a fresh timeline. We capture the start time once
        // here so every offset is anchored to the run, not to React's batch.
        setTimeline(startTimeline());
        const total = runnable.length;
        try {
            const result = await runKeywordEventChain(runnable, {
                pauseMs: chain.PauseMs,
                signal: ctrl.signal,
                onEventStart: (ev, i) => {
                    setChainProgress((p) => p === null ? p : { ...p, current: i + 1 });
                    setTimeline((t) => recordEventStart(t, ev, i, total));
                },
                onStep: (step, stepIndex, ev) => {
                    setTimeline((t) => recordStep(t, ev, step, stepIndex));
                },
                onEventEnd: (ev, _i, res) => {
                    setTimeline((t) => recordEventEnd(t, ev, res));
                },
            });
            setTimeline((t) => recordChainEnd(t, {
                Completed: result.EventsCompleted,
                Attempted: result.EventsAttempted,
                Aborted: result.Aborted,
            }));
        } finally {
            if (chainCtrlRef.current === ctrl) { chainCtrlRef.current = null; }
            setChainRunning(false);
            setChainProgress(null);
        }
    };

    const handleCancelChain = (): void => {
        chainCtrlRef.current?.abort();
        chainCtrlRef.current = null;
    };

    // Drag-and-drop sensors. Pointer needs an 8px activation distance so
    // ordinary clicks on the card body (Run, Stop, inputs) don't initiate a
    // drag. Keyboard sensor enables ↑/↓/Space reordering for accessibility.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (e: DragEndEvent): void => {
        const { active, over } = e;
        if (!over || active.id === over.id) { return; }
        api.reorderEvents(String(active.id), String(over.id));
    };

    // Panel-scoped keyboard shortcuts:
    //   • Ctrl/Cmd+Enter → run the chain (when idle and at least one
    //     runnable event is enabled, and focus isn't in a text field).
    //   • Escape         → stop the chain (only while running, and only
    //     when focus isn't in a text field — see matcher for rationale).
    // Bound to the editor root so it works from anywhere inside the
    // dialog without leaking to the rest of the app.
    const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        const action = matchChainShortcut(
            {
                key: e.key,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                target: e.target,
            },
            { chainRunning, enabledCount },
        );
        if (action === null) { return; }
        e.preventDefault();
        e.stopPropagation();
        if (action === "run") { void handleRunChain(); }
        else { handleCancelChain(); }
    };

    const runShortcutLabel = describeRunShortcut();
    const stopShortcutLabel = describeStopShortcut();

    return (
        <div
            className="space-y-3"
            data-testid="keyword-events-panel"
            onKeyDown={handlePanelKeyDown}
        >
            <div className="flex items-center gap-2">
                <Input
                    value={newKeyword}
                    onChange={e => setNewKeyword(e.target.value)}
                    placeholder="New keyword (e.g. submit-form)"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    className="h-9"
                    data-testid="keyword-events-new-input"
                />
                <Button onClick={handleAdd} disabled={!newKeyword.trim()} size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
            </div>

            <div className="relative" data-testid="keyword-events-search-row">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by keyword, description, or tag…"
                    aria-label="Search keyword events"
                    className="h-8 pl-7 pr-7 text-xs"
                    data-testid="keyword-events-search-input"
                />
                {isFiltering && (
                    <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        data-testid="keyword-events-search-clear"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>

            <ChainSettingsRow
                settings={chain}
                onChange={setChain}
                enabledCount={enabledCount}
                running={chainRunning}
                progress={chainProgress}
                autoRunActive={autoRunActive}
                runShortcutLabel={runShortcutLabel}
                stopShortcutLabel={stopShortcutLabel}
                onRun={() => { void handleRunChain(); }}
                onCancel={handleCancelChain}
            />

            <ChainTimelineLog timeline={timeline} running={chainRunning} />

            <Separator />

            {eventSelection.selected.size > 0 && (
                <div
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs"
                    data-testid="keyword-events-selection-toolbar"
                >
                    <span className="font-medium" data-testid="keyword-events-selection-count">
                        {eventSelection.selected.size} selected
                    </span>
                    <span className="text-muted-foreground">
                        Shift-click to extend · Ctrl/Cmd-click to toggle
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-xs"
                        onClick={eventSelection.clear}
                        data-testid="keyword-events-selection-clear"
                    >
                        Clear
                    </Button>
                </div>
            )}

            <ScrollArea className="h-[380px] pr-3">
                {api.events.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                        No keyword events yet. Add one above to script key presses and waits.
                    </p>
                ) : visibleEvents.length === 0 ? (
                    <p
                        className="text-sm text-muted-foreground text-center py-12"
                        data-testid="keyword-events-search-empty"
                    >
                        No events match “{search.trim()}”.
                    </p>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={isFiltering ? () => { /* drag-reorder disabled while filtering */ } : handleDragEnd}
                    >
                        <SortableContext
                            items={visibleEvents.map(e => e.Id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-3" data-testid="keyword-events-sortable-list">
                                {visibleEvents.map(ev => {
                                    const isSelected = eventSelection.isSelected(ev.Id);
                                    // Right-click on a non-selected row should
                                    // act on that single row — promote it to
                                    // the selection so the bulk menu has data.
                                    const selectedForMenu = isSelected
                                        ? api.events.filter(e => eventSelection.isSelected(e.Id))
                                        : [ev];
                                    return (
                                        <KeywordEventBulkContextMenu
                                            key={ev.Id}
                                            isRowSelected={isSelected}
                                            selectedEvents={selectedForMenu}
                                            allEvents={api.events}
                                            onContextOpenForUnselected={() => {
                                                eventSelection.handleClick(ev.Id, { shiftKey: false, toggleKey: false });
                                            }}
                                            onUpdateEvent={(id, patch) => api.updateEvent(id, patch)}
                                            onRemoveEvent={(id) => api.removeEvent(id)}
                                            onClearSelection={eventSelection.clear}
                                        >
                                            <div>
                                                <SortableKeywordEventCard
                                                    event={ev}
                                                    isRunning={playback.isRunning(ev.Id)}
                                                    currentStepIndex={playback.isRunning(ev.Id) ? playback.currentStepIndex : null}
                                                    selected={isSelected}
                                                    onRowClick={(e) => handleEventRowClick(ev.Id, e)}
                                                    onToggleSelect={(checked, e) => {
                                                        // Checkbox toggles selection; Shift held while clicking
                                                        // the checkbox extends from anchor like a row click.
                                                        if (e && e.shiftKey) {
                                                            eventSelection.handleClick(ev.Id, { shiftKey: true, toggleKey: false });
                                                        } else {
                                                            eventSelection.handleClick(ev.Id, { shiftKey: false, toggleKey: true });
                                                        }
                                                        void checked;
                                                    }}
                                                    onPlay={() => { void playback.play(ev); }}
                                                    onCancel={playback.cancel}
                                                    onRemove={() => api.removeEvent(ev.Id)}
                                                    onUpdate={patch => api.updateEvent(ev.Id, patch)}
                                                    onAddStep={step => api.addStep(ev.Id, step)}
                                                    onRemoveStep={sid => api.removeStep(ev.Id, sid)}
                                                    onMoveStep={(sid, dir) => api.moveStep(ev.Id, sid, dir)}
                                                    onRemoveSteps={(eid, sids) => api.removeSteps(eid, sids)}
                                                    onSetStepsEnabled={(eid, sids, en) => api.setStepsEnabled(eid, sids, en)}
                                                    onRelabelSteps={(eid, sids, labels) => api.relabelSteps(eid, sids, labels)}
                                                />
                                            </div>
                                        </KeywordEventBulkContextMenu>
                                    );
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </ScrollArea>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Chain settings row                                                 */
/* ------------------------------------------------------------------ */

interface ChainSettingsRowProps {
    readonly settings: KeywordEventChainSettings;
    readonly onChange: (next: KeywordEventChainSettings) => void;
    readonly enabledCount: number;
    readonly running: boolean;
    readonly progress: { current: number; total: number } | null;
    /** True while the auto-run-after-recording chain is in flight. */
    readonly autoRunActive?: boolean;
    /** Human-readable Run shortcut (e.g. "Ctrl+Enter") for the button tooltip. */
    readonly runShortcutLabel?: string;
    /** Human-readable Stop shortcut (e.g. "Esc") for the button tooltip. */
    readonly stopShortcutLabel?: string;
    readonly onRun: () => void;
    readonly onCancel: () => void;
}

function ChainSettingsRow(props: ChainSettingsRowProps): JSX.Element {
    const {
        settings, onChange, enabledCount, running, progress, autoRunActive,
        runShortcutLabel, stopShortcutLabel, onRun, onCancel,
    } = props;
    const pauseDraft = String(settings.PauseMs);
    return (
        <div
            className={cn(
                "rounded-md border border-border bg-muted/30 p-3 space-y-2",
                settings.Enabled && "border-primary/50",
            )}
            data-testid="keyword-event-chain-row"
        >
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    <Label htmlFor="kev-chain-toggle" className="text-sm font-medium cursor-pointer">
                        Auto-chain into recorder playback
                    </Label>
                </div>
                <Switch
                    id="kev-chain-toggle"
                    checked={settings.Enabled}
                    onCheckedChange={(v) => onChange({ ...settings, Enabled: v })}
                    aria-label="Auto-chain keyword events into recorder playback"
                    data-testid="keyword-event-chain-toggle"
                />
                <div className="ml-auto flex items-center gap-2">
                    {autoRunActive && (
                        <Badge
                            variant="outline"
                            className="text-[10px] border-primary/60 text-primary animate-pulse"
                            data-testid="keyword-event-chain-auto-running"
                        >
                            Auto-running
                        </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                        {enabledCount} enabled
                    </Badge>
                    {running ? (
                        <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={onCancel}
                            data-testid="keyword-event-chain-cancel"
                            title={stopShortcutLabel ? `Stop the chain (${stopShortcutLabel})` : "Stop the chain"}
                        >
                            <Square className="h-3.5 w-3.5 mr-1" />
                            Stop
                            {progress !== null ? ` (${progress.current}/${progress.total})` : ""}
                            {stopShortcutLabel && (
                                <kbd
                                    className="ml-2 hidden sm:inline-flex items-center rounded border border-destructive-foreground/30 px-1 text-[9px] font-mono opacity-80"
                                    data-testid="keyword-event-chain-stop-shortcut"
                                >
                                    {stopShortcutLabel}
                                </kbd>
                            )}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8"
                            onClick={onRun}
                            disabled={enabledCount === 0}
                            data-testid="keyword-event-chain-run"
                            title={
                                runShortcutLabel
                                    ? `Run all enabled keyword events sequentially (${runShortcutLabel})`
                                    : "Run all enabled keyword events sequentially"
                            }
                        >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Run chain
                            {runShortcutLabel && (
                                <kbd
                                    className="ml-2 hidden sm:inline-flex items-center rounded border border-border px-1 text-[9px] font-mono opacity-80"
                                    data-testid="keyword-event-chain-run-shortcut"
                                >
                                    {runShortcutLabel}
                                </kbd>
                            )}
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3">
                <Label htmlFor="kev-chain-pause" className="text-xs text-muted-foreground shrink-0">
                    Pause between events
                </Label>
                <Input
                    id="kev-chain-pause"
                    type="number"
                    min={0}
                    max={60_000}
                    step={50}
                    value={pauseDraft}
                    onChange={(e) => {
                        const parsed = Number(e.target.value);
                        const next = Number.isFinite(parsed) ? parsed : DEFAULT_CHAIN_SETTINGS.PauseMs;
                        onChange({ ...settings, PauseMs: next });
                    }}
                    className="h-8 w-24 text-xs"
                    aria-label="Pause between chained events in milliseconds"
                    data-testid="keyword-event-chain-pause"
                    disabled={running}
                />
                <span className="text-[10px] text-muted-foreground">ms</span>
                <p className="text-[10px] text-muted-foreground ml-auto max-w-md text-right">
                    {settings.Enabled
                        ? "Recorder playback will run every enabled event in order with this pause between them."
                        : "Off — keyword events only fire when run manually."}
                </p>
            </div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <Square className="h-3.5 w-3.5 text-primary" />
                    <Label
                        htmlFor="kev-chain-after-recording"
                        className="text-xs font-medium cursor-pointer"
                    >
                        Run chain after recording stops
                    </Label>
                </div>
                <Switch
                    id="kev-chain-after-recording"
                    checked={settings.RunAfterRecording}
                    onCheckedChange={(v) => onChange({ ...settings, RunAfterRecording: v })}
                    aria-label="Automatically run the chain when the recorder finishes a session"
                    data-testid="keyword-event-chain-after-recording"
                />
                <p className="text-[10px] text-muted-foreground ml-auto max-w-md text-right">
                    {settings.RunAfterRecording
                        ? "Chain will fire automatically the moment a recording session is stopped."
                        : "Off — stopping a recording does nothing."}
                </p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Live chain timeline log                                            */
/* ------------------------------------------------------------------ */

interface ChainTimelineLogProps {
    readonly timeline: TimelineState;
    readonly running: boolean;
}

/**
 * Live progress log rendered between the chain controls and the editor
 * list. Hidden when no chain has ever run so the panel stays compact.
 * Auto-scrolls to the newest entry while a chain is running so users see
 * the active step without manual scrolling.
 */
function ChainTimelineLog(props: ChainTimelineLogProps): JSX.Element | null {
    const { timeline, running } = props;
    const scrollerRef = useRef<HTMLDivElement | null>(null);

    // Auto-scroll to the bottom whenever the entry count changes — but
    // only while the chain is live, so users can scroll back through a
    // finished log without being yanked to the end.
    useEffect(() => {
        if (!running) { return; }
        const el = scrollerRef.current;
        if (el === null) { return; }
        el.scrollTop = el.scrollHeight;
    }, [running, timeline.Entries.length]);

    if (timeline.StartedAtMs === null && timeline.Entries.length === 0) {
        return null;
    }

    return (
        <div
            className="rounded-md border border-border bg-muted/20 p-2 space-y-1.5"
            data-testid="keyword-event-chain-timeline"
        >
            <div className="flex items-center gap-2 px-1">
                <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                    Chain timeline
                </span>
                {running && (
                    <Badge
                        variant="outline"
                        className="text-[9px] border-primary/60 text-primary animate-pulse ml-1"
                    >
                        Live
                    </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {timeline.Entries.length} {timeline.Entries.length === 1 ? "entry" : "entries"}
                </span>
            </div>
            <div
                ref={scrollerRef}
                className="max-h-32 overflow-y-auto rounded bg-background/50 px-2 py-1.5 font-mono text-[11px] leading-5"
                data-testid="keyword-event-chain-timeline-scroll"
            >
                {timeline.Entries.map((e) => (
                    <TimelineRow key={e.Id} entry={e} />
                ))}
            </div>
        </div>
    );
}

function formatOffset(ms: number): string {
    const total = Math.max(0, Math.floor(ms));
    const seconds = Math.floor(total / 1000);
    const remainder = total % 1000;
    const padded = remainder.toString().padStart(3, "0");
    return `${seconds.toString().padStart(2, "0")}.${padded}s`;
}

interface TimelineRowProps {
    readonly entry: TimelineEntry;
}

function TimelineRow(props: TimelineRowProps): JSX.Element {
    const { entry } = props;
    const offset = formatOffset(entry.AtMs);

    if (entry.Kind === "EventStart") {
        return (
            <div className="flex items-start gap-2 text-foreground" data-testid="timeline-event-start">
                <span className="text-muted-foreground tabular-nums">{offset}</span>
                <Play className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span className="truncate">
                    <span className="text-muted-foreground">[{entry.Index + 1}/{entry.Total}]</span>{" "}
                    <span className="font-semibold">{entry.Keyword}</span>
                </span>
            </div>
        );
    }
    if (entry.Kind === "Step") {
        return (
            <div className="flex items-start gap-2 text-muted-foreground pl-3" data-testid="timeline-step">
                <span className="tabular-nums">{offset}</span>
                <Circle className="h-2.5 w-2.5 mt-1 text-muted-foreground/70 shrink-0" />
                <span className="truncate">
                    <span className="opacity-70">#{entry.StepIndex + 1}</span>{" "}
                    {entry.Label}
                </span>
            </div>
        );
    }
    if (entry.Kind === "EventEnd") {
        const Icon = entry.Aborted ? XCircle : entry.Completed ? CheckCircle2 : XCircle;
        const tone = entry.Aborted
            ? "text-destructive"
            : entry.Completed ? "text-emerald-500" : "text-destructive";
        const label = entry.Aborted ? "aborted" : entry.Completed ? "done" : "failed";
        return (
            <div className="flex items-start gap-2" data-testid="timeline-event-end">
                <span className="text-muted-foreground tabular-nums">{offset}</span>
                <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", tone)} />
                <span className={cn("truncate", tone)}>
                    <span className="font-semibold">{entry.Keyword}</span> {label}
                </span>
            </div>
        );
    }
    // ChainEnd
    const tone = entry.Aborted ? "text-destructive" : "text-emerald-500";
    return (
        <div className="flex items-start gap-2 mt-1" data-testid="timeline-chain-end">
            <span className="text-muted-foreground tabular-nums">{offset}</span>
            <Square className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <span className={cn("truncate font-semibold", tone)}>
                Chain {entry.Aborted ? "aborted" : "complete"} — {entry.Completed}/{entry.Attempted}
            </span>
        </div>
    );
}

interface KeywordEventCardProps {
    readonly event: import("@/hooks/use-keyword-events").KeywordEvent;
    readonly isRunning: boolean;
    readonly currentStepIndex: number | null;
    readonly onPlay: () => void;
    readonly onCancel: () => void;
    readonly onRemove: () => void;
    readonly onUpdate: (patch: Partial<Omit<import("@/hooks/use-keyword-events").KeywordEvent, "Id">>) => void;
    readonly onAddStep: (step: Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">) => void;
    readonly onRemoveStep: (stepId: string) => void;
    readonly onMoveStep: (stepId: string, dir: "up" | "down") => void;
    /** Bulk step actions invoked by the per-step right-click context menu. */
    readonly onRemoveSteps: (eventId: string, stepIds: readonly string[]) => void;
    readonly onSetStepsEnabled: (eventId: string, stepIds: readonly string[], enabled: boolean) => void;
    readonly onRelabelSteps: (eventId: string, stepIds: readonly string[], labels: readonly string[]) => void;
    /**
     * Optional drag-handle element rendered at the start of the card header.
     * The sortable wrapper supplies a `<button>` bound to dnd-kit listeners;
     * leaving it `undefined` makes the card non-draggable (used by tests).
     */
    readonly dragHandle?: React.ReactNode;
    /** Whether this event is part of the current multi-selection. */
    readonly selected?: boolean;
    /** Click on the card chrome (not on inputs/buttons). Carries modifiers. */
    readonly onRowClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    /** Toggle this event's checkbox. Receives the source mouse event so the
     *  parent can honour Shift to extend a range from the anchor. */
    readonly onToggleSelect?: (checked: boolean, mouseEvent?: React.MouseEvent<HTMLButtonElement>) => void;
}

function KeywordEventCard(props: KeywordEventCardProps): JSX.Element {
    const {
        event, isRunning, currentStepIndex,
        onPlay, onCancel, onRemove, onUpdate, onAddStep, onRemoveStep, onMoveStep,
        onRemoveSteps, onSetStepsEnabled, onRelabelSteps,
        dragHandle, selected, onRowClick, onToggleSelect,
    } = props;
    const [keyCombo, setKeyCombo] = useState("");
    const [waitMs, setWaitMs] = useState("500");

    // Per-event step multi-selection. Scoped to this card so each event
    // tracks its own anchor — selecting a step in one event must not
    // change the selection in another.
    const stepIds = event.Steps.map(s => s.Id);
    const stepSelection = useShiftClickSelection(stepIds);
    const isMacRow = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
    const handleStepRowClick = (sid: string, ev: React.MouseEvent): void => {
        if ((ev.target as HTMLElement | null)?.closest("button,input,textarea,select,label")) return;
        stepSelection.handleClick(sid, modifiersFromMouseEvent(ev.nativeEvent, isMacRow));
    };

    // Live validation drives both inline messages and the disabled state of
    // the Run button + the per-step Add buttons.
    const comboValidation = validateCombo(keyCombo);
    const waitValidation = validateWait(waitMs);
    const stepIssues = validateEventSteps(event);
    const issuesByIndex = new Map(stepIssues.map(i => [i.Index, i] as const));
    const runnable = isEventRunnable(event);
    const runDisabledReason: string | null = !event.Enabled
        ? "Event is disabled"
        : event.Steps.length === 0
            ? "Add at least one step"
            : stepIssues.length > 0
                ? `${stepIssues.length} step${stepIssues.length === 1 ? "" : "s"} need${stepIssues.length === 1 ? "s" : ""} fixing`
                : null;

    return (
        <div
            className={cn(
                "rounded-md border border-border bg-card/60 p-3 space-y-3 transition-shadow",
                isRunning && "ring-2 ring-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]",
                stepIssues.length > 0 && !isRunning && "border-destructive/50",
                selected && "ring-2 ring-primary/60 bg-primary/5",
            )}
            data-testid={`keyword-event-${event.Id}`}
            data-selected={selected ? "true" : undefined}
            onClick={onRowClick}
        >
            <div className="flex items-center gap-2">
                {dragHandle}
                {onToggleSelect && (
                    <Checkbox
                        checked={!!selected}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelect(!selected, e as React.MouseEvent<HTMLButtonElement>);
                        }}
                        aria-label={`Select ${event.Keyword}`}
                        data-testid={`keyword-event-select-${event.Id}`}
                    />
                )}
                <Input
                    value={event.Keyword}
                    onChange={e => onUpdate({ Keyword: e.target.value })}
                    className="h-8 font-medium"
                    aria-label="Keyword"
                />
                <div className="flex items-center gap-1.5">
                    <Switch
                        checked={event.Enabled}
                        onCheckedChange={v => onUpdate({ Enabled: v })}
                        aria-label="Enabled"
                    />
                    <Label className="text-xs text-muted-foreground">{event.Enabled ? "On" : "Off"}</Label>
                </div>
                {isRunning ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        className="h-8"
                        onClick={onCancel}
                        data-testid={`keyword-event-stop-${event.Id}`}
                        aria-label="Stop keyword event playback"
                    >
                        <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8"
                        onClick={onPlay}
                        disabled={!runnable}
                        data-testid={`keyword-event-play-${event.Id}`}
                        aria-label="Run keyword event"
                        title={runDisabledReason ?? "Run this keyword event"}
                    >
                        <Play className="h-3.5 w-3.5 mr-1" /> Run
                    </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label="Remove keyword event">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {isRunning && currentStepIndex !== null && currentStepIndex >= 0 && currentStepIndex < event.Steps.length && (
                <LiveDispatchPreview
                    eventId={event.Id}
                    step={event.Steps[currentStepIndex]}
                    stepIndex={currentStepIndex}
                    totalSteps={event.Steps.length}
                />
            )}

            <Input
                value={event.Description}
                onChange={e => onUpdate({ Description: e.target.value })}
                placeholder="Optional description"
                className="h-8 text-xs"
            />

            <TargetPickerRow
                eventId={event.Id}
                value={event.Target ?? DEFAULT_KEYWORD_EVENT_TARGET}
                onChange={(next) => onUpdate({ Target: next })}
            />

            <PauseAfterRow
                eventId={event.Id}
                value={event.PauseAfterMs}
                onChange={(next) => onUpdate({ PauseAfterMs: next })}
            />

            {stepIssues.length > 0 && (
                <p
                    className="text-[10px] text-destructive"
                    role="status"
                    data-testid={`keyword-event-issues-${event.Id}`}
                >
                    {stepIssues.length} step{stepIssues.length === 1 ? "" : "s"} need{stepIssues.length === 1 ? "s" : ""} fixing — Run is disabled until resolved.
                </p>
            )}

            <div className="space-y-1.5">
                {event.Steps.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No steps yet — add a key press or wait below.</p>
                )}
                {stepSelection.selected.size > 0 && (
                    <div
                        className="flex items-center gap-2 rounded border border-border/60 bg-muted/30 px-2 py-1 text-[10px]"
                        data-testid={`keyword-event-step-selection-toolbar-${event.Id}`}
                    >
                        <span className="font-medium" data-testid={`keyword-event-step-selection-count-${event.Id}`}>
                            {stepSelection.selected.size} step{stepSelection.selected.size === 1 ? "" : "s"} selected
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-5 px-1.5 text-[10px]"
                            onClick={(e) => { e.stopPropagation(); stepSelection.clear(); }}
                            data-testid={`keyword-event-step-selection-clear-${event.Id}`}
                        >
                            Clear
                        </Button>
                    </div>
                )}
                {/* eslint-disable-next-line max-lines-per-function -- step row + context-menu wrapper kept inline for selection scope */}
                {event.Steps.map((s, i) => {
                    const issue = issuesByIndex.get(i);
                    const stepSelected = stepSelection.isSelected(s.Id);
                    const stepDisabled = s.Enabled === false;
                    return (
                        <KeywordEventStepContextMenu
                            key={s.Id}
                            step={s}
                            event={event}
                            selectedStepIds={stepSelection.selected}
                            onSetEnabled={onSetStepsEnabled}
                            onRemove={onRemoveSteps}
                            onRelabel={onRelabelSteps}
                            onAfterRemove={() => stepSelection.clear()}
                            onContextOpenForUnselected={() => {
                                stepSelection.handleClick(s.Id, { shiftKey: false, toggleKey: false });
                            }}
                        >
                        <div
                            className={cn(
                                "flex flex-col gap-0.5 rounded bg-muted/40 px-2 py-1.5 text-xs transition-colors cursor-pointer",
                                currentStepIndex === i && "bg-primary/15 ring-1 ring-primary/40",
                                issue && "bg-destructive/10 ring-1 ring-destructive/40",
                                stepSelected && "bg-primary/20 ring-1 ring-primary/60",
                                stepDisabled && "opacity-60",
                            )}
                            data-testid={`keyword-event-step-${event.Id}-${i}`}
                            data-invalid={issue ? "true" : undefined}
                            data-selected={stepSelected ? "true" : undefined}
                            data-step-disabled={stepDisabled ? "true" : undefined}
                            onClick={(e) => { e.stopPropagation(); handleStepRowClick(s.Id, e); }}
                        >
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={stepSelected}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const me = e as React.MouseEvent<HTMLButtonElement>;
                                        if (me.shiftKey) {
                                            stepSelection.handleClick(s.Id, { shiftKey: true, toggleKey: false });
                                        } else {
                                            stepSelection.handleClick(s.Id, { shiftKey: false, toggleKey: true });
                                        }
                                    }}
                                    aria-label={`Select step ${i + 1}`}
                                    data-testid={`keyword-event-step-select-${event.Id}-${i}`}
                                    className="h-3.5 w-3.5"
                                />
                                <Badge variant="outline" className="text-[10px] w-6 justify-center">{i + 1}</Badge>
                                {s.Label && (
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5"
                                        data-testid={`keyword-event-step-label-${event.Id}-${i}`}
                                    >
                                        {s.Label}
                                    </Badge>
                                )}
                                {s.Kind === "Key" ? (
                                    <>
                                        <Keyboard className={cn("h-3.5 w-3.5", issue ? "text-destructive" : "text-primary")} />
                                        <code className="font-mono">{s.Combo || <span className="italic opacity-70">(empty)</span>}</code>
                                    </>
                                ) : (
                                    <>
                                        <Clock className={cn("h-3.5 w-3.5", issue ? "text-destructive" : "text-primary")} />
                                        <span>Wait <strong>{String(s.DurationMs)}</strong> ms</span>
                                    </>
                                )}
                                <div className="ml-auto flex items-center gap-0.5">
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onMoveStep(s.Id, "up"); }} disabled={i === 0} aria-label="Move step up">
                                        <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); onMoveStep(s.Id, "down"); }} disabled={i === event.Steps.length - 1} aria-label="Move step down">
                                        <ArrowDown className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); onRemoveStep(s.Id); }} aria-label="Remove step">
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                            {issue && (
                                <p className="text-[10px] text-destructive pl-8">{issue.Message}</p>
                            )}
                        </div>
                        </KeywordEventStepContextMenu>
                    );
                })}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={keyCombo}
                            onChange={e => setKeyCombo(e.target.value)}
                            placeholder="Enter / Ctrl+Tab"
                            className={cn(
                                "h-8 text-xs",
                                keyCombo.length > 0 && !comboValidation.Valid && "border-destructive focus-visible:ring-destructive",
                            )}
                            aria-label="Key combo"
                            aria-invalid={keyCombo.length > 0 && !comboValidation.Valid ? true : undefined}
                            data-testid={`keyword-event-key-input-${event.Id}`}
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 shrink-0"
                            disabled={!comboValidation.Valid}
                            onClick={() => {
                                if (!comboValidation.Valid) { return; }
                                onAddStep({ Kind: "Key", Combo: keyCombo.trim() } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">);
                                setKeyCombo("");
                            }}
                            data-testid={`keyword-event-key-add-${event.Id}`}
                            title={comboValidation.Valid ? "Add key step" : comboValidation.Message}
                        >
                            <Plus className="h-3 w-3 mr-1" /> Key
                        </Button>
                    </div>
                    {keyCombo.length > 0 && !comboValidation.Valid && (
                        <p
                            className="text-[10px] text-destructive"
                            data-testid={`keyword-event-key-error-${event.Id}`}
                        >
                            {comboValidation.Message}
                        </p>
                    )}
                </div>
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="number"
                            min={0}
                            value={waitMs}
                            onChange={e => setWaitMs(e.target.value)}
                            placeholder="ms"
                            className={cn(
                                "h-8 text-xs",
                                !waitValidation.Valid && "border-destructive focus-visible:ring-destructive",
                            )}
                            aria-label="Wait duration in milliseconds"
                            aria-invalid={!waitValidation.Valid ? true : undefined}
                            data-testid={`keyword-event-wait-input-${event.Id}`}
                        />
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 shrink-0"
                            disabled={!waitValidation.Valid}
                            onClick={() => {
                                if (!waitValidation.Valid) { return; }
                                onAddStep({ Kind: "Wait", DurationMs: waitValidation.Ms } as Omit<import("@/hooks/use-keyword-events").KeywordEventStep, "Id">);
                            }}
                            data-testid={`keyword-event-wait-add-${event.Id}`}
                            title={waitValidation.Valid ? "Add wait step" : waitValidation.Message}
                        >
                            <Plus className="h-3 w-3 mr-1" /> Wait
                        </Button>
                    </div>
                    {!waitValidation.Valid && (
                        <p
                            className="text-[10px] text-destructive"
                            data-testid={`keyword-event-wait-error-${event.Id}`}
                        >
                            {waitValidation.Message}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Per-event target picker                                            */
/* ------------------------------------------------------------------ */

interface TargetPickerRowProps {
    readonly eventId: string;
    readonly value: KeywordEventTarget;
    readonly onChange: (next: KeywordEventTarget) => void;
}

/**
 * Three-mode target picker. When `Selector` is chosen we render a CSS
 * selector input below the picker and live-validate it via
 * `document.querySelector` so users see an inline error before they hit
 * Run. The check is wrapped in try/catch because invalid CSS throws.
 */
function TargetPickerRow(props: TargetPickerRowProps): JSX.Element {
    const { eventId, value, onChange } = props;
    const isSelector = value.Kind === "Selector";
    const selectorText = isSelector ? value.Selector : "";

    const handleKindChange = (raw: string): void => {
        if (raw === "ActiveElement" || raw === "Body") {
            onChange({ Kind: raw });
            return;
        }
        if (raw === "Selector") {
            onChange({ Kind: "Selector", Selector: selectorText });
        }
    };

    // Live selector check — distinguishes "syntactically invalid" (red) from
    // "valid but matches nothing" (amber) from "matches" (green).
    const selectorStatus: "empty" | "invalid" | "no-match" | "match" = (() => {
        if (!isSelector) { return "empty"; }
        const trimmed = selectorText.trim();
        if (trimmed === "") { return "empty"; }
        if (typeof document === "undefined") { return "no-match"; }
        try {
            const node = document.querySelector(trimmed);
            return node === null ? "no-match" : "match";
        } catch {
            return "invalid";
        }
    })();

    return (
        <div
            className="rounded border border-border/60 bg-muted/20 p-2 space-y-1.5"
            data-testid={`keyword-event-target-${eventId}`}
        >
            <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Dispatch target</Label>
                <Select value={value.Kind} onValueChange={handleKindChange}>
                    <SelectTrigger
                        className="h-7 w-44 text-xs ml-auto"
                        data-testid={`keyword-event-target-kind-${eventId}`}
                        aria-label="Dispatch target"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ActiveElement">
                            <span className="inline-flex items-center gap-2">
                                <Crosshair className="h-3 w-3" /> Active element
                            </span>
                        </SelectItem>
                        <SelectItem value="Body">
                            <span className="inline-flex items-center gap-2">
                                <Target className="h-3 w-3" /> document.body
                            </span>
                        </SelectItem>
                        <SelectItem value="Selector">
                            <span className="inline-flex items-center gap-2">
                                <Keyboard className="h-3 w-3" /> CSS selector…
                            </span>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {isSelector ? (
                <div className="space-y-1">
                    <Input
                        value={selectorText}
                        onChange={(e) => onChange({ Kind: "Selector", Selector: e.target.value })}
                        placeholder="#chat-input, textarea[name='msg'], …"
                        className={cn(
                            "h-7 text-xs font-mono",
                            selectorStatus === "invalid" && "border-destructive focus-visible:ring-destructive",
                            selectorStatus === "no-match" && "border-amber-500/60",
                            selectorStatus === "match" && "border-emerald-500/60",
                        )}
                        aria-label="CSS selector for dispatch target"
                        aria-invalid={selectorStatus === "invalid" ? true : undefined}
                        data-testid={`keyword-event-target-selector-${eventId}`}
                        data-status={selectorStatus}
                    />
                    {selectorStatus === "invalid" ? (
                        <p className="text-[10px] text-destructive">Invalid CSS selector — playback will fall back to document.body.</p>
                    ) : selectorStatus === "no-match" ? (
                        <p className="text-[10px] text-amber-500">No element matches yet — playback will fall back to document.body if still unmatched.</p>
                    ) : selectorStatus === "match" ? (
                        <p className="text-[10px] text-emerald-500">Matches an element on the current page.</p>
                    ) : (
                        <p className="text-[10px] text-muted-foreground">Enter a CSS selector for the dispatch target.</p>
                    )}
                </div>
            ) : (
                <p className="text-[10px] text-muted-foreground">
                    {value.Kind === "ActiveElement"
                        ? "Dispatches on whichever element has focus when playback runs."
                        : "Dispatches directly on document.body — useful for global hotkey listeners."}
                </p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Live dispatch preview                                              */
/* ------------------------------------------------------------------ */

interface LiveDispatchPreviewProps {
    readonly eventId: string;
    readonly step: import("@/hooks/use-keyword-events").KeywordEventStep;
    readonly stepIndex: number;
    readonly totalSteps: number;
}

/**
 * Pill rendered beneath the card header while playback is running. Shows
 * the modifiers + key currently being dispatched (or the wait duration when
 * the active step is a Wait), plus a step counter so the user can correlate
 * with the step list below.
 */
function LiveDispatchPreview(props: LiveDispatchPreviewProps): JSX.Element {
    const { eventId, step, stepIndex, totalSteps } = props;
    const preview: DispatchPreview = buildDispatchPreview(step);
    const ariaLabel = `Now dispatching: ${previewToString(preview)}`;

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10",
                "px-2.5 py-1.5 text-xs animate-in fade-in slide-in-from-top-1",
            )}
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
            data-testid={`keyword-event-live-preview-${eventId}`}
            data-step-index={stepIndex}
            data-step-kind={preview.Kind}
        >
            <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                Dispatching
            </span>
            {preview.Kind === "Key" ? (
                <div
                    className="flex items-center gap-1 flex-wrap"
                    data-testid={`keyword-event-live-preview-keys-${eventId}`}
                >
                    {preview.Modifiers.map((mod) => (
                        <kbd
                            key={mod}
                            className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] shadow-sm"
                            data-testid={`keyword-event-live-preview-mod-${eventId}-${mod}`}
                        >
                            {mod}
                        </kbd>
                    ))}
                    {preview.Modifiers.length > 0 && preview.HasKey && (
                        <span className="text-muted-foreground text-[10px]">+</span>
                    )}
                    {preview.HasKey ? (
                        <kbd
                            className="px-1.5 py-0.5 rounded bg-primary/20 border border-primary/50 font-mono text-[10px] text-primary-foreground shadow-sm"
                            data-testid={`keyword-event-live-preview-key-${eventId}`}
                        >
                            {preview.Key}
                        </kbd>
                    ) : (
                        <span
                            className="text-[10px] italic text-destructive"
                            data-testid={`keyword-event-live-preview-empty-${eventId}`}
                        >
                            (no key)
                        </span>
                    )}
                </div>
            ) : (
                <div
                    className="flex items-center gap-1.5"
                    data-testid={`keyword-event-live-preview-wait-${eventId}`}
                >
                    <Clock className="h-3 w-3 text-primary" />
                    <span className="font-mono text-[11px]">
                        Wait <strong>{preview.DurationMs}</strong> ms
                    </span>
                </div>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                Step {stepIndex + 1} / {totalSteps}
            </span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Sortable wrapper                                                   */
/* ------------------------------------------------------------------ */

/**
 * Wraps {@link KeywordEventCard} with `useSortable` so the parent list
 * can render it inside a `SortableContext`. Supplies a `<button>` drag
 * handle (rendered inside the card header) bound to dnd-kit listeners —
 * the rest of the card body stays interactive (Run, inputs, switches).
 */
function SortableKeywordEventCard(props: KeywordEventCardProps): JSX.Element {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props.event.Id,
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
    };

    const handle = (
        <button
            type="button"
            className={cn(
                "shrink-0 inline-flex items-center justify-center h-8 w-6 rounded",
                "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                "cursor-grab active:cursor-grabbing touch-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
            aria-label={`Drag to reorder ${props.event.Keyword}`}
            data-testid={`keyword-event-drag-handle-${props.event.Id}`}
            {...attributes}
            {...listeners}
        >
            <GripVertical className="h-4 w-4" />
        </button>
    );

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-testid={`keyword-event-sortable-${props.event.Id}`}
            data-dragging={isDragging ? "true" : undefined}
        >
            <KeywordEventCard {...props} dragHandle={handle} />
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Per-event pause override                                           */
/* ------------------------------------------------------------------ */

interface PauseAfterRowProps {
    readonly eventId: string;
    readonly value: number | undefined;
    readonly onChange: (next: number | undefined) => void;
}

const PAUSE_OVERRIDE_MIN = 0;
const PAUSE_OVERRIDE_MAX = 60_000;

/**
 * Compact row that lets the user opt into a per-event pause override that
 * replaces the chain's global `PauseMs` for the gap *after* this event
 * finishes. When the toggle is off we strip the field (`onChange(undefined)`)
 * so the chain runner falls back to the global value. The numeric input is
 * clamped to the same `[0, 60_000]` ms range as the global setting and
 * exposes both red/amber inline validation and a `data-status` marker for
 * tests.
 */
function PauseAfterRow(props: PauseAfterRowProps): JSX.Element {
    const { eventId, value, onChange } = props;
    const enabled = typeof value === "number" && Number.isFinite(value) && value >= 0;
    const draftRef = useRef<string>(enabled ? String(value) : String(DEFAULT_CHAIN_SETTINGS.PauseMs));
    const [draft, setDraft] = useState<string>(draftRef.current);

    // Keep the draft in sync when the persisted value is changed externally
    // (e.g. another tab updates localStorage and the hook rehydrates).
    useEffect(() => {
        if (enabled && String(value) !== draftRef.current) {
            draftRef.current = String(value);
            setDraft(draftRef.current);
        }
    }, [enabled, value]);

    const parsed = Number(draft);
    const draftValid = draft.trim() !== ""
        && !Number.isNaN(parsed)
        && Number.isFinite(parsed)
        && parsed >= PAUSE_OVERRIDE_MIN
        && parsed <= PAUSE_OVERRIDE_MAX;

    const handleToggle = (checked: boolean): void => {
        if (!checked) {
            onChange(undefined);
            return;
        }
        // Re-enabling restores the last good draft (or the global default).
        const restore = draftValid ? Math.floor(parsed) : DEFAULT_CHAIN_SETTINGS.PauseMs;
        draftRef.current = String(restore);
        setDraft(draftRef.current);
        onChange(restore);
    };

    const handleDraftChange = (raw: string): void => {
        setDraft(raw);
        if (!enabled) { return; }
        const n = Number(raw);
        if (raw.trim() === "" || Number.isNaN(n) || !Number.isFinite(n)) { return; }
        const clamped = Math.max(PAUSE_OVERRIDE_MIN, Math.min(PAUSE_OVERRIDE_MAX, Math.floor(n)));
        draftRef.current = String(clamped);
        onChange(clamped);
    };

    return (
        <div
            className={cn(
                "rounded border border-border/60 bg-muted/20 p-2 space-y-1.5",
                enabled && "border-primary/40",
            )}
            data-testid={`keyword-event-pause-after-${eventId}`}
            data-enabled={enabled ? "true" : "false"}
        >
            <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <Label
                    htmlFor={`kev-pause-toggle-${eventId}`}
                    className="text-xs font-medium cursor-pointer"
                >
                    Override chain pause after this event
                </Label>
                <Switch
                    id={`kev-pause-toggle-${eventId}`}
                    checked={enabled}
                    onCheckedChange={handleToggle}
                    aria-label="Override chain pause after this event"
                    data-testid={`keyword-event-pause-after-toggle-${eventId}`}
                    className="ml-auto"
                />
            </div>
            {enabled ? (
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        min={PAUSE_OVERRIDE_MIN}
                        max={PAUSE_OVERRIDE_MAX}
                        step={50}
                        value={draft}
                        onChange={(e) => handleDraftChange(e.target.value)}
                        className={cn(
                            "h-7 w-24 text-xs",
                            !draftValid && "border-destructive focus-visible:ring-destructive",
                        )}
                        aria-label="Pause after this event in milliseconds"
                        aria-invalid={!draftValid ? true : undefined}
                        data-testid={`keyword-event-pause-after-input-${eventId}`}
                    />
                    <span className="text-[10px] text-muted-foreground">ms</span>
                    <p className="text-[10px] text-muted-foreground ml-auto max-w-xs text-right">
                        {draftValid
                            ? "Replaces the chain's global pause for the gap after this event."
                            : `Enter a number between ${PAUSE_OVERRIDE_MIN} and ${PAUSE_OVERRIDE_MAX}.`}
                    </p>
                </div>
            ) : (
                <p className="text-[10px] text-muted-foreground">
                    Off — uses the chain's global pause setting.
                </p>
            )}
        </div>
    );
}

