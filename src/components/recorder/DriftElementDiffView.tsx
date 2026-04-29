/**
 * Marco Extension — Drift Element Diff View
 *
 * Side-by-side comparison of the **primary** (recorded / expected) element
 * versus the **fallback** element that actually matched during replay, with
 * per-attribute changes highlighted. Rendered when
 * `SelectorComparison.DriftDetected === true` so the user can immediately
 * see *how* the page diverged from the recording.
 *
 * Pure presentation — diff data is computed by `diffDriftElements`.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, CheckCircle2, GitCompare, Clock } from "lucide-react";
import type { DomContext } from "@/background/recorder/failure-logger";
import {
    diffDriftElements,
    type DriftChangeKind,
    type DriftElementDiff,
    type DriftFieldDiff,
    type DriftVerdict,
} from "@/background/recorder/drift-element-diff";
import type { SelectorHistoryBucket } from "@/background/recorder/selector-history";
import {
    buildDriftTimeline,
    formatDuration,
    type DriftTimeline,
} from "@/background/recorder/drift-timeline";

interface DriftElementDiffViewProps {
    /** Recorded / expected element snapshot (or null when never captured). */
    readonly primary: DomContext | null;
    /** Element the fallback selector actually matched (or null when none). */
    readonly fallback: DomContext | null;
    /** Optional precomputed diff — if omitted the component computes it. */
    readonly diff?: DriftElementDiff;
    /**
     * Per-selector replay history bucket for the *primary* selector. When
     * supplied a compact "last ok ↔ first drift" timeline is rendered.
     */
    readonly history?: SelectorHistoryBucket | null;
    /** Test seam: override "now" for relative-time formatting. */
    readonly now?: Date;
}

const VERDICT_META: Readonly<Record<DriftVerdict, { label: string; tone: "warn" | "info" | "ok" | "error" }>> = {
    Identical: { label: "Identical", tone: "ok" },
    AttributeDrift: { label: "Attribute drift", tone: "warn" },
    RenamedIdentity: { label: "Renamed identity", tone: "warn" },
    DifferentElement: { label: "Different element", tone: "error" },
    PrimaryMissing: { label: "No recorded snapshot", tone: "info" },
    FallbackMissing: { label: "No fallback matched", tone: "error" },
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
    TagName: "Tag",
    Id: "id",
    ClassName: "class",
    AriaLabel: "aria-label",
    Name: "name",
    Type: "type",
    TextSnippet: "Text",
    OuterHtmlSnippet: "Outer HTML",
};

export function DriftElementDiffView({ primary, fallback, diff, history, now }: DriftElementDiffViewProps) {
    const computed = diff ?? diffDriftElements(primary, fallback);
    const verdict = VERDICT_META[computed.Verdict];
    const timeline = history !== undefined
        ? buildDriftTimeline(history, { Now: now })
        : null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                        <GitCompare className="h-4 w-4" />
                        Drift element diff
                    </span>
                    <VerdictBadge verdict={computed.Verdict} label={verdict.label} />
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                {timeline !== null && timeline.State !== "no-history" && (
                    <DriftTimelineStrip timeline={timeline} />
                )}

                {!computed.HasChanges && computed.Verdict === "Identical" ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Primary and fallback elements are identical — no drift to highlight.
                    </p>
                ) : (
                    <>
                        <ColumnHeader />
                        <div className="divide-y rounded-md border">
                            {computed.Fields.map((field) => (
                                <FieldRow key={field.Field} field={field} />
                            ))}
                        </div>

                        {(computed.ClassList.Added.length > 0 || computed.ClassList.Removed.length > 0) && (
                            <ClassListDiff
                                added={computed.ClassList.Added}
                                removed={computed.ClassList.Removed}
                                shared={computed.ClassList.Shared}
                            />
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function DriftTimelineStrip({ timeline }: { timeline: DriftTimeline }) {
    const { State, LastSuccess, FirstDrift, HealthyDurationMs, FailuresSinceDrift } = timeline;

    if (State === "healthy" && LastSuccess !== null) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs">
                <Clock className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-hidden />
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    No drift on record
                </span>
                <span className="text-muted-foreground">
                    last ok {LastSuccess.RelativeLabel}
                </span>
                <code className="ml-auto text-[10px] text-muted-foreground" title={LastSuccess.At}>
                    run #{LastSuccess.RunId}
                </code>
            </div>
        );
    }

    if (State === "always-failing" && FirstDrift !== null) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                <Clock className="h-3.5 w-3.5 text-destructive shrink-0" aria-hidden />
                <span className="font-medium text-destructive">Never matched</span>
                <span className="text-muted-foreground">
                    first failure {FirstDrift.RelativeLabel}
                    {FailuresSinceDrift > 1 && ` · ${FailuresSinceDrift} failures total`}
                </span>
                <code className="ml-auto text-[10px] text-muted-foreground" title={FirstDrift.At}>
                    run #{FirstDrift.RunId}
                </code>
            </div>
        );
    }

    if (State === "drifted" && LastSuccess !== null && FirstDrift !== null) {
        return (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Drift timeline
                    {HealthyDurationMs !== null && (
                        <Badge variant="outline" className="ml-1 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                            healthy for {formatDuration(HealthyDurationMs)}
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-2 font-mono">
                    <span
                        className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
                        title={LastSuccess.At}
                    >
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        ok · {LastSuccess.RelativeLabel}
                        <span className="text-[10px] text-muted-foreground">
                            #{LastSuccess.RunId}
                        </span>
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                    <span
                        className="flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive"
                        title={FirstDrift.At}
                    >
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        drift · {FirstDrift.RelativeLabel}
                        <span className="text-[10px] text-muted-foreground">
                            #{FirstDrift.RunId}
                        </span>
                    </span>
                    {FailuresSinceDrift > 1 && (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                            +{FailuresSinceDrift - 1} more failure{FailuresSinceDrift === 2 ? "" : "s"}
                        </span>
                    )}
                </div>
                {FirstDrift.Error !== null && (
                    <div className="text-[11px] text-muted-foreground italic break-words">
                        First error: {FirstDrift.Error}
                    </div>
                )}
            </div>
        );
    }

    return null;
}

function VerdictBadge({ verdict, label }: { verdict: DriftVerdict; label: string }) {
    const tone = VERDICT_META[verdict].tone;
    if (tone === "ok") {
        return (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {label}
            </Badge>
        );
    }
    if (tone === "error") {
        return (
            <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {label}
            </Badge>
        );
    }
    if (tone === "warn") {
        return (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {label}
            </Badge>
        );
    }
    return <Badge variant="secondary">{label}</Badge>;
}

function ColumnHeader() {
    return (
        <div className="grid grid-cols-[110px_1fr_24px_1fr] items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span>Field</span>
            <span>Primary (recorded)</span>
            <span aria-hidden />
            <span>Fallback (matched)</span>
        </div>
    );
}

function FieldRow({ field }: { field: DriftFieldDiff }) {
    const label = FIELD_LABELS[field.Field] ?? field.Field;
    return (
        <div className="grid grid-cols-[110px_1fr_24px_1fr] items-start gap-2 px-2 py-2 text-sm">
            <span className="pt-0.5 font-mono text-xs text-muted-foreground">{label}</span>
            <ValueCell value={field.Primary} change={field.Change} side="primary" />
            <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden />
            <ValueCell value={field.Fallback} change={field.Change} side="fallback" />
        </div>
    );
}

function ValueCell({
    value,
    change,
    side,
}: {
    readonly value: string | null;
    readonly change: DriftChangeKind;
    readonly side: "primary" | "fallback";
}) {
    const empty = value === null || value === "";
    const highlight = changeClass(change, side);
    return (
        <code
            className={`block whitespace-pre-wrap break-words rounded px-1.5 py-1 font-mono text-xs ${highlight}`}
            data-change={change}
            data-side={side}
        >
            {empty ? <span className="italic text-muted-foreground">∅</span> : value}
        </code>
    );
}

function changeClass(change: DriftChangeKind, side: "primary" | "fallback"): string {
    if (change === "Unchanged") return "bg-muted/40 text-foreground";
    if (change === "Modified") {
        return side === "primary"
            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (change === "Added") {
        return side === "fallback"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-muted/40 text-muted-foreground";
    }
    // Removed
    return side === "primary"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through"
        : "bg-muted/40 text-muted-foreground";
}

function ClassListDiff({
    added,
    removed,
    shared,
}: {
    readonly added: ReadonlyArray<string>;
    readonly removed: ReadonlyArray<string>;
    readonly shared: ReadonlyArray<string>;
}) {
    return (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                class list changes
            </p>
            <div className="flex flex-wrap gap-1.5">
                {removed.map((c) => (
                    <Badge
                        key={`r-${c}`}
                        variant="outline"
                        className="border-rose-500/40 font-mono text-xs text-rose-600 line-through dark:text-rose-400"
                    >
                        −{c}
                    </Badge>
                ))}
                {added.map((c) => (
                    <Badge
                        key={`a-${c}`}
                        variant="outline"
                        className="border-emerald-500/40 font-mono text-xs text-emerald-600 dark:text-emerald-400"
                    >
                        +{c}
                    </Badge>
                ))}
                {shared.map((c) => (
                    <Badge key={`s-${c}`} variant="secondary" className="font-mono text-xs">
                        {c}
                    </Badge>
                ))}
            </div>
        </div>
    );
}
