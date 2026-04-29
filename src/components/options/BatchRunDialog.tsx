/**
 * Marco Extension — Batch Run Dialog
 *
 * Runs a user-selected list of StepGroups one after another in the
 * order chosen, and shows a live per-group status row.
 *
 * The row order is FIRST seeded from the caller-provided
 * `initialOrder` (which is the order in which the user ticked the
 * checkboxes in the library tree). Inside the dialog the user can
 * still re-arrange via ▲ / ▼ before pressing Run.
 *
 * Execution itself is delegated to the pure `runBatch` helper so the
 * same code paths the unit tests cover are what the user clicks.
 *
 * @see src/background/recorder/step-library/run-batch.ts
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

import {
    runBatch,
    type BatchFailurePolicy,
    type BatchGroupReport,
    type BatchGroupStatus,
} from "@/background/recorder/step-library/run-batch";
import type { StepGroupRow, StepLibraryDb } from "@/background/recorder/step-library/db";
import type { LeafStepExecutor, RunStepTraceEntry } from "@/background/recorder/step-library/run-group-runner";
import { createLiveReplayExecutor } from "@/background/recorder/step-library/replay-bridge";
import {
    buildBatchCompletePayload,
    buildGroupRunPayload,
    dispatchWebhook,
} from "@/background/recorder/step-library/result-webhook";
import {
    mergeInputBags,
    resolveBatchInputSnapshot,
} from "@/background/recorder/step-library/input-source";
import type { GroupInputBag } from "@/background/recorder/step-library/group-inputs";

import RunResultsSummaryPanel from "./RunResultsSummaryPanel";
import RunTraceViewer from "./RunTraceViewer";

interface BatchRunDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly db: StepLibraryDb | null;
    readonly projectId: number | null;
    readonly initialOrder: ReadonlyArray<number>;
    readonly groupsById: ReadonlyMap<number, StepGroupRow>;
    /** Locally-saved input bag per group, used as the merge baseline. */
    readonly groupInputs: ReadonlyMap<number, GroupInputBag>;
    /** Persists the merged bag back so the rest of the app sees it. */
    readonly onApplyMergedInput: (groupId: number, bag: GroupInputBag) => void;
}

const STATUS_STYLE: Record<BatchGroupStatus, string> = {
    Pending:   "bg-muted text-muted-foreground",
    Running:   "bg-primary/15 text-primary",
    Succeeded: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Failed:    "bg-destructive/15 text-destructive",
    Skipped:   "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function move<T>(arr: ReadonlyArray<T>, from: number, to: number): T[] {
    if (to < 0 || to >= arr.length) return arr.slice();
    const next = arr.slice();
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

export default function BatchRunDialog(props: BatchRunDialogProps) {
    const {
        open, onOpenChange, db, projectId, initialOrder, groupsById,
        groupInputs, onApplyMergedInput,
    } = props;
    const [order, setOrder] = useState<ReadonlyArray<number>>(initialOrder);
    const [reports, setReports] = useState<ReadonlyArray<BatchGroupReport>>([]);
    const [running, setRunning] = useState(false);
    const [continueOnFailure, setContinueOnFailure] = useState(false);
    /**
     * Live mode swaps the always-success `previewExecutor` for the
     * `createLiveReplayExecutor` bridge so each leaf step actually
     * dispatches DOM events into the Options-page document via
     * `executeReplay()`. Defaults OFF — opening the dialog must
     * never mutate the page accidentally.
     */
    const [liveMode, setLiveMode] = useState(false);
    /**
     * Total wall-clock duration of the just-completed run. `null` until
     * the first run finishes; cleared back to `null` whenever the user
     * re-opens the dialog so a stale duration can't bleed into the
     * next batch's summary panel.
     */
    const [lastRunDurationMs, setLastRunDurationMs] = useState<number | null>(null);
    /**
     * Trace viewer is collapsed by default — long batches can produce
     * hundreds of trace entries and we don't want to bloat the dialog
     * height before the user opts in.
     */
    const [traceOpen, setTraceOpen] = useState(false);

    // Reset per-open: seed order, clear prior status rows + summary.
    useEffect(() => {
        if (open) {
            setOrder(initialOrder);
            setReports(initialOrder.map((id) => emptyReport(id)));
            setRunning(false);
            setLastRunDurationMs(null);
            setTraceOpen(false);
            setLiveMode(false);
        }
    }, [open, initialOrder]);

    const policy: BatchFailurePolicy = continueOnFailure ? "ContinueOnFailure" : "StopOnFailure";

    const handleRun = async () => {
        if (db === null || projectId === null) {
            toast.error("Library not ready");
            return;
        }
        if (order.length === 0) return;
        setRunning(true);

        // Resolve the run-time input source ONCE per batch and merge
        // it into each selected group's persisted bag before any group
        // executes. Honour the abort/continue policy stored on the
        // input-source config.
        const snapshot = await resolveBatchInputSnapshot();
        if (!snapshot.Result.Ok) {
            const continueAnyway = snapshot.Result.Continue;
            if (!continueAnyway) {
                setRunning(false);
                toast.error(`Input source failed: ${snapshot.Result.Error}. Run aborted.`);
                return;
            }
            toast.warning(`Input source failed: ${snapshot.Result.Error}. Continuing with local inputs.`);
        } else if (!snapshot.Result.Skipped && snapshot.Bag !== null) {
            const incoming = snapshot.Bag;
            for (const id of order) {
                const merged = mergeInputBags(groupInputs.get(id) ?? null, incoming);
                onApplyMergedInput(id, merged);
            }
            const keyCount = Object.keys(incoming).length;
            toast.success(`Input source: merged ${keyCount} key(s) into ${order.length} group(s)`);
        }

        setReports(order.map((id) => emptyReport(id)));
        const live: BatchGroupReport[] = order.map((id) => emptyReport(id));
        const executor: LeafStepExecutor = liveMode
            ? createLiveReplayExecutor({ Doc: document })
            : previewExecutor;
        const result = await runBatch({
            db,
            projectId,
            orderedGroupIds: order,
            executeLeafStep: executor,
            failurePolicy: policy,
            onGroupStatus: (report, idx) => {
                live[idx] = report;
                setReports(live.slice());
                // Fire per-group webhook on terminal statuses (fire-and-forget).
                if (report.Status === "Succeeded" || report.Status === "Failed") {
                    const groupRow = groupsById.get(report.StepGroupId);
                    const runResult = report.Result;
                    const failureReason = runResult !== null && !runResult.Ok
                        ? runResult.Reason
                        : undefined;
                    const failedStepId = runResult !== null && !runResult.Ok && runResult.FailedStepId !== null
                        ? runResult.FailedStepId
                        : undefined;
                    void dispatchWebhook(
                        report.Status === "Succeeded" ? "GroupRunSucceeded" : "GroupRunFailed",
                        buildGroupRunPayload({
                            ProjectId: projectId,
                            GroupId: report.StepGroupId,
                            GroupName: groupRow?.Name ?? `#${report.StepGroupId}`,
                            DurationMs: report.DurationMs,
                            StepsExecuted: runResult?.Trace.length ?? 0,
                            Outcome: report.Status,
                            FailureReason: failureReason,
                            FailedStepId: failedStepId,
                        }),
                    );
                }
            },
        });
        setRunning(false);
        setLastRunDurationMs(result.DurationMs);
        // Always emit a final BatchComplete event.
        void dispatchWebhook(
            "BatchComplete",
            buildBatchCompletePayload({
                ProjectId: projectId,
                TotalGroups: order.length,
                Succeeded: result.Succeeded,
                Failed: result.Failed,
                Skipped: result.Skipped,
                DurationMs: result.DurationMs,
                Ok: result.Ok,
            }),
        );
        if (result.Ok) {
            toast.success(`Batch complete — ${result.Succeeded} group(s) ran in ${formatDuration(result.DurationMs)}`);
        } else {
            toast.error(`Batch finished with ${result.Failed} failure(s), ${result.Skipped} skipped`);
        }
    };

    const summary = useMemo(() => {
        const counts = { Succeeded: 0, Failed: 0, Skipped: 0, Running: 0, Pending: 0 };
        for (const r of reports) counts[r.Status]++;
        return counts;
    }, [reports]);

    /**
     * Flatten every report's `Result.Trace` into a single ordered
     * stream for the trace viewer. Reports run sequentially in
     * `runBatch`, so concatenating in batch order preserves real
     * wall-clock order. Reports without a Result (Pending / Skipped
     * batch entries) contribute nothing.
     */
    const flatTrace = useMemo<ReadonlyArray<RunStepTraceEntry>>(() => {
        const out: RunStepTraceEntry[] = [];
        for (const r of reports) {
            const trace = r.Result?.Trace;
            if (trace !== undefined) out.push(...trace);
        }
        return out;
    }, [reports]);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Run groups in batch</DialogTitle>
                    <DialogDescription>
                        Groups run sequentially in the order shown. Drag with the arrows to reorder before pressing Run.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{order.length} group(s)</span>
                        {(summary.Succeeded + summary.Failed + summary.Skipped) > 0 && (
                            <span>
                                · {summary.Succeeded} ok · {summary.Failed} failed · {summary.Skipped} skipped
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex cursor-pointer items-center gap-2">
                            <Switch
                                checked={liveMode}
                                onCheckedChange={setLiveMode}
                                disabled={running}
                                aria-label="Live execution"
                            />
                            <span title="When on, each leaf step dispatches real DOM events into this page via the replay bridge.">Live execution</span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                            <Switch
                                checked={continueOnFailure}
                                onCheckedChange={setContinueOnFailure}
                                disabled={running}
                                aria-label="Continue on failure"
                            />
                            <span>Continue on failure</span>
                        </label>
                    </div>
                </div>

                {lastRunDurationMs !== null && !running && (
                    <RunResultsSummaryPanel
                        reports={reports}
                        totalDurationMs={lastRunDurationMs}
                        groupName={(id) => groupsById.get(id)?.Name ?? `Group #${id}`}
                    />
                )}

                {lastRunDurationMs !== null && !running && flatTrace.length > 0 && (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setTraceOpen((v) => !v)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                            aria-expanded={traceOpen}
                            aria-controls="run-trace-viewer"
                        >
                            {traceOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {traceOpen ? "Hide" : "Show"} execution trace ({flatTrace.length} entries)
                        </button>
                        {traceOpen && (
                            <div id="run-trace-viewer">
                                <RunTraceViewer trace={flatTrace} />
                            </div>
                        )}
                    </div>
                )}

                <ScrollArea className="max-h-[55vh] rounded-md border">
                    <ol className="divide-y">
                        {order.map((gid, idx) => {
                            const group = groupsById.get(gid);
                            const report = reports[idx] ?? emptyReport(gid);
                            return (
                                <li key={gid} className="flex items-center gap-3 px-3 py-2">
                                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                        {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-medium">
                                                {group?.Name ?? `Group #${gid}`}
                                            </span>
                                            <StatusBadge status={report.Status} />
                                        </div>
                                        {report.Status === "Failed" && report.Result !== null && !report.Result.Ok && (
                                            <p className="mt-0.5 truncate text-xs text-destructive">
                                                {report.Result.Reason}: {report.Result.ReasonDetail}
                                            </p>
                                        )}
                                        {report.DurationMs > 0 && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {formatDuration(report.DurationMs)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={running || idx === 0}
                                            onClick={() => setOrder((o) => move(o, idx, idx - 1))}
                                            aria-label="Move up"
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={running || idx === order.length - 1}
                                            onClick={() => setOrder((o) => move(o, idx, idx + 1))}
                                            aria-label="Move down"
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={running}
                                            onClick={() => setOrder((o) => o.filter((_, i) => i !== idx))}
                                            aria-label="Remove from batch"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button disabled={running || order.length === 0} onClick={handleRun}>
                        {running ? (
                            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Running…</>
                        ) : (
                            <><Play className="mr-1 h-4 w-4" /> Run {order.length} group(s)</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StatusBadge({ status }: { status: BatchGroupStatus }) {
    return (
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[status]}`}>
            {status}
        </span>
    );
}

function emptyReport(id: number): BatchGroupReport {
    return { StepGroupId: id, Status: "Pending", StartedAt: null, EndedAt: null, DurationMs: 0, Result: null };
}

/**
 * Preview-mode leaf executor: the Options page can't actually click
 * DOM in a target tab, so every leaf step is reported as a
 * synthetic success. This still exercises the full runner pipeline
 * (group descent, RunGroup expansion, cycle detection) which is what
 * the batch UX is here to demonstrate. In production the recorder
 * background worker injects its own real executor.
 */
const previewExecutor: LeafStepExecutor = () => null;
