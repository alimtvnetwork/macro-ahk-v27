/**
 * Marco Extension — Run Trace Viewer
 *
 * Renders the linear `RunStepTraceEntry[]` list emitted by the runner
 * (`runOne` in `run-group-runner.ts`) into a readable, indented log
 * with per-row outcome badges and the full call-stack path.
 *
 * What it shows, in trace order:
 *   - **EnteredGroup / ExitedGroup** — synthetic markers the runner
 *     pushes around every group descent. Indentation follows
 *     `GroupPath.length` so nested `RunGroup` invocations naturally
 *     stair-step in/out. The marker label is the runner's own
 *     "→ enter" / "← exit" string with the group name baked in.
 *   - **Executed** — successful leaf step. Shows step kind + label.
 *   - **Skipped** — step had `IsDisabled=1`. Rendered muted with
 *     strike-through so it's visually obvious the runner short-
 *     circuited it (matches the inline disable toggle's row style).
 *   - **Failed** — leaf step the executor reported as failed. Always
 *     the LAST entry in a failed run's trace by construction.
 *
 * The call-stack path for every row is the same `GroupPath` array the
 * runner attaches — root first, current group last. We render it as
 * a Group / Sub-group / Leaf breadcrumb under each row so a deep
 * failure can be located without scrolling back up to the most recent
 * EnteredGroup marker.
 *
 * Pure presentational: no state, no side effects. Safe to mount /
 * unmount on a toggle, idempotent re-renders.
 */

import { ChevronRight, CircleDot, FastForward, FolderOpen, FolderClosed, XCircle } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { RunStepTraceEntry } from "@/background/recorder/step-library/run-group-runner";
import { stepKindLabel } from "@/hooks/use-step-library";

interface RunTraceViewerProps {
    /** Trace entries in their emit order. May span multiple top-level groups. */
    readonly trace: ReadonlyArray<RunStepTraceEntry>;
    /**
     * Optional max height; the inner list scrolls when exceeded. The
     * default keeps the viewer compact inside dialogs without taking
     * over the whole modal height.
     */
    readonly maxHeightClass?: string;
}

const OUTCOME_STYLE: Record<RunStepTraceEntry["Outcome"], string> = {
    Executed:     "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Skipped:      "bg-muted text-muted-foreground",
    EnteredGroup: "bg-primary/15 text-primary",
    ExitedGroup:  "bg-primary/10 text-primary/80",
    Failed:       "bg-destructive/15 text-destructive",
};

function OutcomeIcon({ outcome }: { outcome: RunStepTraceEntry["Outcome"] }) {
    const cls = "h-3.5 w-3.5 shrink-0";
    switch (outcome) {
        case "Executed":     return <CircleDot className={`${cls} text-emerald-600 dark:text-emerald-400`} />;
        case "Skipped":      return <FastForward className={`${cls} text-muted-foreground`} />;
        case "EnteredGroup": return <FolderOpen className={`${cls} text-primary`} />;
        case "ExitedGroup":  return <FolderClosed className={`${cls} text-primary/70`} />;
        case "Failed":       return <XCircle className={`${cls} text-destructive`} />;
    }
}

export default function RunTraceViewer(props: RunTraceViewerProps) {
    const { trace, maxHeightClass = "max-h-[40vh]" } = props;

    if (trace.length === 0) {
        return (
            <div className="rounded-md border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                No trace entries — the run produced no observable steps.
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card">
            <header className="flex items-center justify-between border-b px-3 py-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Execution trace
                </h4>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                    {trace.length} {trace.length === 1 ? "entry" : "entries"}
                </span>
            </header>
            <ScrollArea className={maxHeightClass}>
                <ol className="divide-y text-xs">
                    {trace.map((entry, idx) => (
                        <TraceRow key={`${entry.StartedAt}-${idx}`} entry={entry} />
                    ))}
                </ol>
            </ScrollArea>
        </div>
    );
}

function TraceRow({ entry }: { entry: RunStepTraceEntry }) {
    /**
     * Indent by depth. Depth = `GroupPath.length - 1` so the root
     * group sits flush against the gutter and each nested RunGroup
     * shifts one level. We cap the indent at 8 levels — that matches
     * the runner's `MAX_RUN_GROUP_CALL_DEPTH` ÷ 2 and prevents pathological
     * traces from pushing the outcome badge off-screen on narrow viewports.
     */
    const depth = Math.min(Math.max(entry.GroupPath.length - 1, 0), 8);
    const indentPx = depth * 12;

    const isMarker = entry.Outcome === "EnteredGroup" || entry.Outcome === "ExitedGroup";
    const labelText = entry.Label ?? (isMarker ? "" : "(no label)");
    const muted = entry.Outcome === "Skipped";

    return (
        <li className="flex items-start gap-2 px-3 py-1.5" style={{ paddingLeft: 12 + indentPx }}>
            <OutcomeIcon outcome={entry.Outcome} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    {!isMarker && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {stepKindLabel(entry.StepKindId)}
                        </span>
                    )}
                    <span
                        className={[
                            "truncate text-xs",
                            isMarker ? "font-semibold" : "font-medium",
                            muted ? "line-through text-muted-foreground" : "",
                        ].join(" ")}
                    >
                        {labelText}
                    </span>
                    <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${OUTCOME_STYLE[entry.Outcome]}`}
                    >
                        {entry.Outcome}
                    </span>
                    {entry.OrderIndex >= 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                            #{entry.OrderIndex}
                        </span>
                    )}
                </div>
                {entry.GroupPath.length > 0 && (
                    <CallStackPath path={entry.GroupPath} />
                )}
            </div>
        </li>
    );
}

function CallStackPath({ path }: { path: ReadonlyArray<string> }) {
    return (
        <p
            className="mt-0.5 flex flex-wrap items-center gap-0.5 text-[10px] text-muted-foreground"
            title={path.join(" › ")}
        >
            {path.map((name, i) => (
                <span key={`${i}-${name}`} className="flex items-center gap-0.5">
                    <span className="truncate">{name}</span>
                    {i < path.length - 1 && (
                        <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                    )}
                </span>
            ))}
        </p>
    );
}
