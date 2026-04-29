/**
 * Marco Extension — Selector Replay Trace Panel
 *
 * Step-by-step view of the resolver's evaluation order for one
 * {@link FailureReport}. Renders the primary attempt first, then each
 * fallback in declared order, with status icons that mirror the live
 * replay loop:
 *
 *   ✓ matched  — resolved, replay stopped here.
 *   ✗ missed   — evaluated, 0 matches, advanced.
 *   ⚠ errored  — evaluated but threw (syntax / unresolved anchor / JS).
 *   ○ pending  — never run because an earlier step matched.
 *
 * Pure presentational. All ordering & classification lives in
 * `./selector-replay-trace.ts` so it can be unit-tested headlessly.
 *
 * Conformance: mem://standards/verbose-logging-and-failure-diagnostics.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Circle,
    ListOrdered,
    ArrowRight,
} from "lucide-react";
import type { FailureReport } from "@/background/recorder/failure-logger";
import {
    buildReplayTrace,
    type TraceStep,
    type TraceStepStatus,
} from "./selector-replay-trace";
import { FormSnapshotBadge } from "./FormSnapshotTable";

interface SelectorReplayTracePanelProps {
    readonly report: FailureReport;
    /** Hide the outer Card chrome — useful when embedding inside another card. */
    readonly embedded?: boolean;
}

const STATUS_TONE: Readonly<Record<TraceStepStatus, string>> = {
    matched: "border-emerald-500/40 bg-emerald-500/5",
    missed:  "border-destructive/40 bg-destructive/5",
    errored: "border-rose-500/40 bg-rose-500/5",
    pending: "border-border bg-muted/20 opacity-70",
};

const STATUS_ICON_TONE: Readonly<Record<TraceStepStatus, string>> = {
    matched: "text-emerald-500",
    missed:  "text-destructive",
    errored: "text-rose-500",
    pending: "text-muted-foreground",
};

const STATUS_LABEL: Readonly<Record<TraceStepStatus, string>> = {
    matched: "MATCHED",
    missed:  "MISSED",
    errored: "ERROR",
    pending: "SKIPPED",
};

function StatusIcon({ status }: { readonly status: TraceStepStatus }) {
    const cls = `h-3.5 w-3.5 shrink-0 ${STATUS_ICON_TONE[status]}`;
    switch (status) {
        case "matched": return <CheckCircle2 className={cls} aria-hidden />;
        case "missed":  return <XCircle className={cls} aria-hidden />;
        case "errored": return <AlertTriangle className={cls} aria-hidden />;
        case "pending": return <Circle className={cls} aria-hidden />;
    }
}

export function SelectorReplayTracePanel({ report, embedded }: SelectorReplayTracePanelProps) {
    const trace = buildReplayTrace(report.Selectors);

    const body = (
        <div className="space-y-2.5" data-testid="selector-replay-trace">
            <SummaryBar
                total={trace.Summary.Total}
                evaluated={trace.Summary.Evaluated}
                skipped={trace.Summary.Skipped}
                stoppedAt={trace.Summary.StoppedAt}
                outcome={trace.Summary.Outcome}
                snapshot={report.FormSnapshot}
            />
            {trace.Steps.length === 0 ? (
                <p
                    data-testid="trace-empty"
                    className="text-xs italic text-muted-foreground py-3 text-center"
                >
                    No selector attempts were recorded for this failure.
                </p>
            ) : (
                <ScrollArea className="max-h-72 pr-2">
                    <ol className="space-y-1.5">
                        {trace.Steps.map((s) => (
                            <TraceStepRow key={s.Order} step={s} />
                        ))}
                    </ol>
                </ScrollArea>
            )}
        </div>
    );

    if (embedded === true) {
        return (
            <section
                aria-label="Selector replay trace"
                data-testid="selector-replay-trace-panel"
                className="rounded-md border border-border bg-card/40 p-3"
            >
                <header className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                    <ListOrdered className="h-3 w-3" aria-hidden />
                    Replay trace
                </header>
                {body}
            </section>
        );
    }

    return (
        <Card data-testid="selector-replay-trace-panel">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ListOrdered className="h-4 w-4 text-primary" />
                    Selector replay trace
                </CardTitle>
            </CardHeader>
            <CardContent>{body}</CardContent>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryBar({
    total,
    evaluated,
    skipped,
    stoppedAt,
    outcome,
    snapshot,
}: {
    readonly total: number;
    readonly evaluated: number;
    readonly skipped: number;
    readonly stoppedAt: number | null;
    readonly outcome: "matched" | "exhausted" | "empty";
    readonly snapshot: FailureReport["FormSnapshot"];
}) {
    const tone =
        outcome === "matched"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : outcome === "exhausted"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/30 text-muted-foreground";

    const headline =
        outcome === "matched"
            ? `Stopped at step ${stoppedAt} — replay matched.`
            : outcome === "exhausted"
                ? "All candidates exhausted — no match."
                : "Nothing to replay.";

    return (
        <div
            role="status"
            data-testid="trace-summary"
            data-outcome={outcome}
            className={`rounded-md border px-3 py-2 text-xs ${tone}`}
        >
            <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{headline}</span>
                <Badge variant="outline" className="text-[10px] ml-auto">
                    {evaluated}/{total} evaluated
                </Badge>
                {skipped > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                        {skipped} skipped
                    </Badge>
                )}
                {snapshot !== null && <FormSnapshotBadge snapshot={snapshot} />}
            </div>
        </div>
    );
}

function TraceStepRow({ step }: { readonly step: TraceStep }) {
    const showResolvedDistinct =
        step.ResolvedExpression !== step.Expression && step.Expression.length > 0;

    return (
        <li
            data-testid="trace-step-row"
            data-order={step.Order}
            data-status={step.Status}
            data-role={step.Role}
            className={`relative rounded-md border ${STATUS_TONE[step.Status]} p-2 text-xs space-y-1`}
        >
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                    #{step.Order}
                </Badge>
                <StatusIcon status={step.Status} />
                <Badge
                    variant={step.Status === "matched" ? "default" : "outline"}
                    className="text-[10px] px-1.5 py-0"
                >
                    {STATUS_LABEL[step.Status]}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {step.Role}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {step.Strategy}
                </Badge>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                    {step.MatchCount} match{step.MatchCount === 1 ? "" : "es"}
                </Badge>
            </div>

            <div className="pl-5">
                <code
                    className="block break-all font-mono text-foreground"
                    title={step.ResolvedExpression}
                >
                    {step.ResolvedExpression}
                </code>
                {showResolvedDistinct && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        Stored: <code className="break-all">{step.Expression}</code>
                    </div>
                )}
            </div>

            <div className="pl-5 flex items-start gap-1 text-[11px] text-muted-foreground">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                <span>
                    {step.Note}
                    {(step.Status === "missed" || step.Status === "errored") && (
                        <>
                            {" "}
                            <span className="font-mono text-destructive">
                                ({step.FailureReason})
                            </span>
                        </>
                    )}
                </span>
            </div>
        </li>
    );
}
