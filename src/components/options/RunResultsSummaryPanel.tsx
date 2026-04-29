/**
 * Marco Extension — Run Results Summary Panel
 *
 * Aggregate report shown after a batch finishes (success **or** failure).
 *
 * Inputs are the per-group `BatchGroupReport[]` produced by `runBatch` —
 * we walk each group's `Result.Trace` to derive the four counters the
 * spec calls out:
 *
 *   - **Groups run** — every group whose status is `Succeeded` or `Failed`
 *     (i.e. the runner actually entered it). `Pending` and `Skipped`
 *     batch entries are NOT counted as "run" — they were either never
 *     reached because of a stop-on-failure abort, or skipped explicitly.
 *   - **Executed steps** — leaf steps that produced an `Executed`
 *     outcome in the trace. Mirrors `RunGroupSuccess.StepsExecuted`
 *     for successful runs; computed from the partial trace for
 *     failed runs so the panel still shows progress up to the point
 *     of failure.
 *   - **Skipped steps** — `IsDisabled` steps the runner short-circuited
 *     past. Same source of truth as `RunGroupSuccess.StepsSkipped`.
 *   - **Groups entered** — every `RunGroup` invocation including the
 *     root + recursive children. Pulled from the `EnteredGroup`
 *     outcomes in the trace, so a deep run that visits the same group
 *     multiple times via separate `RunGroup` steps is counted each
 *     time (matches `RunGroupSuccess.GroupsEntered`).
 *
 * Failures are also surfaced as a separate counter + a per-group list
 * with the structured failure reason, so the user can see WHY the run
 * stopped at a glance without scrolling the per-group rows above.
 *
 * Pure presentational. No state, no side effects — safe to mount and
 * unmount freely, idempotent re-renders.
 */

import { CheckCircle2, FastForward, FolderTree, ListChecks, Timer, XCircle } from "lucide-react";

import type { BatchGroupReport } from "@/background/recorder/step-library/run-batch";
import type { RunStepTraceEntry } from "@/background/recorder/step-library/run-group-runner";

interface RunResultsSummaryPanelProps {
    /** Per-group reports from the just-completed batch. */
    readonly reports: ReadonlyArray<BatchGroupReport>;
    /** Total wall-clock duration of the batch (ms). */
    readonly totalDurationMs: number;
    /** Lookup so failed-group entries can render the human-readable name. */
    readonly groupName?: (id: number) => string;
}

interface AggregateCounts {
    readonly GroupsRun: number;
    readonly StepsExecuted: number;
    readonly StepsSkipped: number;
    readonly GroupsEntered: number;
    readonly Failures: number;
}

function aggregate(reports: ReadonlyArray<BatchGroupReport>): AggregateCounts {
    let groupsRun = 0;
    let executed = 0;
    let skipped = 0;
    let entered = 0;
    let failures = 0;

    for (const r of reports) {
        if (r.Status === "Succeeded" || r.Status === "Failed") groupsRun++;
        if (r.Status === "Failed") failures++;

        const result = r.Result;
        if (result === null) continue;

        // Successful runs ship the canonical counters directly. We
        // still walk the trace for failed runs because RunGroupFailure
        // only carries the partial trace, not pre-computed counts.
        if (result.Ok) {
            executed += result.StepsExecuted;
            skipped += result.StepsSkipped;
            entered += result.GroupsEntered;
        } else {
            const partial = countsFromTrace(result.Trace);
            executed += partial.Executed;
            skipped += partial.Skipped;
            entered += partial.Entered;
        }
    }

    return {
        GroupsRun: groupsRun,
        StepsExecuted: executed,
        StepsSkipped: skipped,
        GroupsEntered: entered,
        Failures: failures,
    };
}

function countsFromTrace(trace: ReadonlyArray<RunStepTraceEntry>): {
    Executed: number; Skipped: number; Entered: number;
} {
    let exec = 0, skip = 0, ent = 0;
    for (const t of trace) {
        if (t.Outcome === "Executed") exec++;
        else if (t.Outcome === "Skipped") skip++;
        else if (t.Outcome === "EnteredGroup") ent++;
    }
    return { Executed: exec, Skipped: skip, Entered: ent };
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

export default function RunResultsSummaryPanel(props: RunResultsSummaryPanelProps) {
    const { reports, totalDurationMs, groupName } = props;
    const counts = aggregate(reports);
    const failedReports = reports.filter((r) => r.Status === "Failed");
    const overallOk = counts.Failures === 0 && counts.GroupsRun > 0;

    return (
        <section
            className="rounded-md border bg-card"
            aria-label="Run results summary"
        >
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex items-center gap-2">
                    {overallOk ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <h3 className="text-sm font-semibold">
                        {overallOk ? "Run complete" : "Run finished with failures"}
                    </h3>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Timer className="h-3.5 w-3.5" />
                    {formatDuration(totalDurationMs)}
                </div>
            </header>

            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                <Stat
                    icon={<FolderTree className="h-4 w-4" />}
                    label="Groups run"
                    value={counts.GroupsRun}
                />
                <Stat
                    icon={<FolderTree className="h-4 w-4" />}
                    label="Groups entered"
                    value={counts.GroupsEntered}
                    hint="Includes root + nested RunGroup invocations"
                />
                <Stat
                    icon={<ListChecks className="h-4 w-4" />}
                    label="Steps executed"
                    value={counts.StepsExecuted}
                    tone="success"
                />
                <Stat
                    icon={<FastForward className="h-4 w-4" />}
                    label="Steps skipped"
                    value={counts.StepsSkipped}
                    hint="Disabled steps short-circuited by the runner"
                    tone={counts.StepsSkipped > 0 ? "muted" : "default"}
                />
            </div>

            {failedReports.length > 0 && (
                <div className="border-t px-3 py-2">
                    <p className="mb-1 text-xs font-medium text-destructive">
                        {failedReports.length} group{failedReports.length === 1 ? "" : "s"} failed
                    </p>
                    <ul className="space-y-1 text-xs">
                        {failedReports.map((r) => {
                            const result = r.Result;
                            const reason = result !== null && !result.Ok ? result.Reason : "Unknown";
                            const detail = result !== null && !result.Ok ? result.ReasonDetail : "";
                            const name = groupName?.(r.StepGroupId) ?? `Group #${r.StepGroupId}`;
                            return (
                                <li
                                    key={r.StepGroupId}
                                    className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5"
                                >
                                    <div className="flex items-center gap-2">
                                        <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                                        <span className="truncate font-medium">{name}</span>
                                        <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                                            {reason}
                                        </span>
                                    </div>
                                    {detail !== "" && (
                                        <p className="mt-0.5 text-muted-foreground line-clamp-2">
                                            {detail}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </section>
    );
}

interface StatProps {
    readonly icon: React.ReactNode;
    readonly label: string;
    readonly value: number;
    readonly hint?: string;
    readonly tone?: "default" | "success" | "muted";
}

function Stat({ icon, label, value, hint, tone = "default" }: StatProps) {
    const valueClass =
        tone === "success" ? "text-emerald-600 dark:text-emerald-400"
        : tone === "muted" ? "text-muted-foreground"
        : "text-foreground";
    return (
        <div className="rounded-md border bg-muted/30 px-3 py-2" title={hint}>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>
                {value}
            </div>
        </div>
    );
}

/** Exposed for unit tests so we can assert on the aggregator independently. */
export const __testing = { aggregate, countsFromTrace };
