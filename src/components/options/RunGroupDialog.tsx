/**
 * Marco Extension — Run Group Dialog
 *
 * Single-group execution surface invoked from the library panel's
 * "Run group" button. Wraps the pure `runGroup()` runner with the
 * shared preview-mode `executeLeafStep` (every leaf reports success;
 * the dialog still exercises the full descent / RunGroup expansion /
 * cycle-detection pipeline) and renders three artefacts when the run
 * finishes:
 *
 *   1. **Failure card** — only when `!Result.Ok`. Shows the structured
 *      `Reason` enum, the runner's `ReasonDetail` sentence, the
 *      offending `FailedStepId` / `FailedGroupId`, and the call-stack
 *      that was active when the failure fired. If the leaf executor
 *      surfaced a `FailureReport`, its `Reason` is shown too.
 *   2. **Summary panel** — same `RunResultsSummaryPanel` the batch
 *      dialog uses, fed a single synthetic batch report so the four
 *      counters (Groups run / entered / Steps executed / skipped)
 *      stay consistent across both surfaces.
 *   3. **Trace viewer** — the full `RunStepTraceEntry[]` rendered by
 *      the shared `RunTraceViewer`, opened by default for single-group
 *      runs (in batches the viewer is collapsed because traces can be
 *      huge — for one group the trace is the whole point of the dialog).
 *
 * Pre-run state shows a one-line "Press Run to execute" prompt so the
 * dialog can be opened to inspect the target before committing.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Play } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";

import {
    runGroup,
    type LeafStepExecutor,
    type RunGroupResult,
} from "@/background/recorder/step-library/run-group-runner";
import type { StepGroupRow, StepLibraryDb } from "@/background/recorder/step-library/db";
import type { BatchGroupReport } from "@/background/recorder/step-library/run-batch";
import { createLiveReplayExecutor } from "@/background/recorder/step-library/replay-bridge";

import RunResultsSummaryPanel from "./RunResultsSummaryPanel";
import RunTraceViewer from "./RunTraceViewer";

interface RunGroupDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly db: StepLibraryDb | null;
    readonly projectId: number | null;
    readonly group: StepGroupRow | null;
    readonly groupName?: (id: number) => string;
}

/**
 * Preview-mode leaf executor — every leaf reports success so the user
 * can dry-run the descent / RunGroup expansion / cycle-detection
 * pipeline without touching the DOM. Switch to live mode via the
 * dialog toggle to drive `executeReplay()` end-to-end.
 */
const previewExecutor: LeafStepExecutor = () => null;

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

export default function RunGroupDialog(props: RunGroupDialogProps) {
    const { open, onOpenChange, db, projectId, group, groupName } = props;
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<RunGroupResult | null>(null);
    const [durationMs, setDurationMs] = useState<number>(0);
    /**
     * Live mode swaps the always-success `previewExecutor` for the
     * `createLiveReplayExecutor` bridge so each leaf step actually
     * dispatches `click` / `input` / `change` events into the Options
     * page document via `executeReplay()`. This is the entry point
     * that lets imported groups exercise the real replay pipeline
     * (selectors, variable substitution, structured FailureReports)
     * end-to-end. Defaults to OFF so opening the dialog never
     * mutates the page accidentally.
     */
    const [liveMode, setLiveMode] = useState(false);

    // Reset whenever the dialog re-opens or the target group changes
    // so a stale prior run can't bleed into a new invocation.
    useEffect(() => {
        if (open) {
            setRunning(false);
            setResult(null);
            setDurationMs(0);
            setLiveMode(false);
        }
    }, [open, group?.StepGroupId]);

    const handleRun = async () => {
        if (db === null || projectId === null || group === null) {
            toast.error("Library not ready");
            return;
        }
        setRunning(true);
        const executor: LeafStepExecutor = liveMode
            ? createLiveReplayExecutor({ Doc: document })
            : previewExecutor;
        const startedAt = performance.now();
        const r = await runGroup({
            db,
            projectId,
            rootGroupId: group.StepGroupId,
            executeLeafStep: executor,
        });
        const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
        setResult(r);
        setDurationMs(elapsed);
        setRunning(false);
        if (r.Ok) {
            toast.success(`Ran "${group.Name}" — ${r.StepsExecuted} step(s) in ${formatDuration(elapsed)}`);
        } else {
            toast.error(`Run failed: ${r.Reason}`);
        }
    };

    /**
     * Wrap the single result in a synthetic `BatchGroupReport[]` so we
     * can re-use the existing summary panel without forking a second
     * aggregator. Status mirrors `Result.Ok`.
     */
    const summaryReports = useMemo<ReadonlyArray<BatchGroupReport>>(() => {
        if (result === null || group === null) return [];
        return [{
            StepGroupId: group.StepGroupId,
            Status: result.Ok ? "Succeeded" : "Failed",
            StartedAt: null,
            EndedAt: null,
            DurationMs: durationMs,
            Result: result,
        }];
    }, [result, group, durationMs]);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!running) onOpenChange(o); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        Run group{group !== null ? ` — ${group.Name}` : ""}
                    </DialogTitle>
                    <DialogDescription>
                        Executes this group. Disabled steps are skipped; nested RunGroup steps are expanded recursively up to the runner's depth limit.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <div className="min-w-0">
                        <div className="font-medium text-foreground">Live execution</div>
                        <div className="text-xs text-muted-foreground">
                            {liveMode
                                ? "Each leaf step dispatches real DOM events into this page via the replay bridge."
                                : "Preview mode — every leaf reports success without touching the DOM."}
                        </div>
                    </div>
                    <Switch
                        checked={liveMode}
                        onCheckedChange={setLiveMode}
                        disabled={running}
                        aria-label="Toggle live execution"
                    />
                </div>

                {result === null && !running && (
                    <div className="rounded-md border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                        Press <strong className="text-foreground">Run</strong> to execute the group and capture its trace.
                    </div>
                )}

                {running && (
                    <div className="flex items-center justify-center gap-2 rounded-md border bg-muted/30 px-3 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running…
                    </div>
                )}

                {result !== null && !result.Ok && (
                    <FailureCard
                        result={result}
                        groupName={groupName}
                    />
                )}

                {result !== null && summaryReports.length > 0 && (
                    <RunResultsSummaryPanel
                        reports={summaryReports}
                        totalDurationMs={durationMs}
                        groupName={groupName}
                    />
                )}

                {result !== null && result.Trace.length > 0 && (
                    <RunTraceViewer trace={result.Trace} maxHeightClass="max-h-[40vh]" />
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        disabled={running}
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <Button
                        disabled={running || group === null || db === null || projectId === null}
                        onClick={handleRun}
                    >
                        {running ? (
                            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Running…</>
                        ) : (
                            <><Play className="mr-1 h-4 w-4" /> {result === null ? "Run" : "Run again"}</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface FailureCardProps {
    readonly result: RunGroupResult & { Ok: false };
    readonly groupName?: (id: number) => string;
}

/**
 * Surfaces the structured failure details. Layout mirrors the row
 * style used by the summary panel's failure list so the user sees
 * the same visual idiom across single-group + batch surfaces.
 */
function FailureCard({ result, groupName }: FailureCardProps) {
    const failedGroupName = result.FailedGroupId !== null
        ? (groupName?.(result.FailedGroupId) ?? `Group #${result.FailedGroupId}`)
        : null;

    return (
        <section
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
            aria-label="Run failure details"
        >
            <header className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold text-destructive">Run failed</h3>
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                    {result.Reason}
                </span>
            </header>

            <p className="mb-2 text-xs text-foreground">{result.ReasonDetail}</p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {result.FailedStepId !== null && (
                    <>
                        <dt className="text-muted-foreground">Failed step</dt>
                        <dd className="font-mono">#{result.FailedStepId}</dd>
                    </>
                )}
                {failedGroupName !== null && (
                    <>
                        <dt className="text-muted-foreground">Failed group</dt>
                        <dd className="truncate" title={failedGroupName}>{failedGroupName}</dd>
                    </>
                )}
                {result.CallStack.length > 0 && (
                    <>
                        <dt className="text-muted-foreground">Call stack</dt>
                        <dd
                            className="truncate font-mono"
                            title={result.CallStack.join(" › ")}
                        >
                            {result.CallStack.join(" › ")}
                        </dd>
                    </>
                )}
                {result.FailureReport !== null && (
                    <>
                        <dt className="text-muted-foreground">Leaf failure</dt>
                        <dd className="truncate" title={result.FailureReport.Reason}>
                            {result.FailureReport.Reason}
                        </dd>
                    </>
                )}
            </dl>
        </section>
    );
}
