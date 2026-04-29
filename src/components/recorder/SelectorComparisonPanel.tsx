/**
 * Marco Extension — Selector Comparison Panel
 *
 * Visualises the per-selector outcome of a replay attempt so the user can
 * see at a glance which selector failed and which DOM element (if any) was
 * found. Designed to live next to or inside the failure post-mortem flow.
 *
 * Pure presentation — the comparison itself is computed by
 * `compareSelectorAttempts` (background module). This component only renders
 * the result.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, AlertTriangle, Crosshair, FileDown, History, Star } from "lucide-react";
import { toast } from "sonner";
import type { SelectorComparison, SelectorAttemptComparison } from "@/background/recorder/selector-comparison";
import type { DomContext, FailureReport } from "@/background/recorder/failure-logger";
import {
    findHistoryForSelector,
    type SelectorHistoryBucket,
} from "@/background/recorder/selector-history";
import {
    buildSelectorComparisonBundle,
    buildSelectorComparisonFilename,
    serializeSelectorComparisonBundle,
} from "./selector-comparison-export";
import { FailureDetailsPanel } from "./FailureDetailsPanel";

/**
 * Promote-to-primary callback. Host owns persistence (DB write). Returning
 * a rejected promise (or throwing) surfaces an error toast in the panel.
 */
export type PromoteToPrimaryHandler = (selectorId: number) => void | Promise<void>;

interface SelectorComparisonPanelProps {
    readonly comparison: SelectorComparison;
    /** Optional StepId stamped into the export filename + bundle metadata. */
    readonly stepId?: number;
    /** Optional page URL stamped into the export bundle metadata. */
    readonly url?: string;
    /** Per-selector replay history. When supplied the toggle is enabled. */
    readonly history?: ReadonlyArray<SelectorHistoryBucket>;
    /**
     * When supplied, each matching non-primary attempt renders a
     * "Promote to primary" action. The handler is responsible for
     * persisting the change (DB UPDATE) and refreshing the parent state.
     */
    readonly onPromoteToPrimary?: PromoteToPrimaryHandler;
    /**
     * Structured failure report associated with this comparison. When
     * supplied, the full diagnostic surface (Reason, ResolvedXPath, every
     * SelectorAttempt with its FailureReason+Detail, and VariableContext)
     * is rendered inline so the user can see *why* the selector failed
     * without leaving the comparison view.
     */
    readonly failureReport?: FailureReport;
    /** Test seam: override the default download side effect. */
    readonly onDownload?: (filename: string, contents: string) => void;
}

function defaultDownload(filename: string, contents: string): void {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function elementSummary(el: DomContext | null): string {
    if (el === null) return "no match";
    const attrs: string[] = [];
    if (el.Id !== null)        attrs.push(`#${el.Id}`);
    if (el.ClassName !== null) attrs.push(`.${el.ClassName.split(/\s+/).filter(Boolean).join(".")}`);
    const head = `<${el.TagName}${attrs.length > 0 ? ` ${attrs.join("")}` : ""}>`;
    if (el.TextSnippet.length === 0) return head;
    return `${head} "${el.TextSnippet}"`;
}

const STATUS_TONE: Record<SelectorHistoryBucket["Status"], string> = {
    healthy:           "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    regressed:         "border-amber-500/40   text-amber-700   dark:text-amber-300",
    "always-failing":  "border-destructive/40 text-destructive",
    unknown:           "border-border         text-muted-foreground",
};

function HistoryBlock({ bucket }: { bucket: SelectorHistoryBucket }) {
    const last10 = bucket.Outcomes.slice(-10);
    return (
        <div className={`mt-2 ml-5 rounded-md border ${STATUS_TONE[bucket.Status]} bg-card/50 p-2 text-[11px] space-y-1`}>
            <div className="flex items-center gap-2">
                <History className="h-3 w-3" aria-hidden />
                <span className="uppercase tracking-wide font-semibold">{bucket.Status}</span>
                <span className="text-muted-foreground">
                    · {bucket.TotalRuns} run{bucket.TotalRuns === 1 ? "" : "s"}
                    , {bucket.TotalFailures} failure{bucket.TotalFailures === 1 ? "" : "s"}
                </span>
            </div>
            {bucket.LastSuccessAt !== null && (
                <div className="text-muted-foreground">
                    Last success: <code>{bucket.LastSuccessAt}</code>
                </div>
            )}
            {bucket.FirstFailureAfterLastSuccessAt !== null && (
                <div className="text-muted-foreground">
                    Started failing: <code>{bucket.FirstFailureAfterLastSuccessAt}</code>
                    {bucket.ConsecutiveFailures > 0 && (
                        <span> · {bucket.ConsecutiveFailures} in a row</span>
                    )}
                </div>
            )}
            <div className="flex items-end gap-0.5 h-4 pt-1" aria-label="Recent run outcomes">
                {last10.map((o) => (
                    <span
                        key={o.RunId}
                        title={`${o.At} — ${o.IsOk ? "ok" : (o.Error ?? "fail")}`}
                        className={`w-2 h-3 rounded-sm ${o.IsOk ? "bg-emerald-500" : "bg-destructive"}`}
                    />
                ))}
            </div>
        </div>
    );
}

interface AttemptRowProps {
    readonly attempt: SelectorAttemptComparison;
    readonly history: SelectorHistoryBucket | null;
    readonly showHistory: boolean;
    readonly onPromote: ((selectorId: number) => void) | null;
    readonly isPromoting: boolean;
}

function AttemptRow({ attempt, history, showHistory, onPromote, isPromoting }: AttemptRowProps) {
    const matched = attempt.Matched;
    const Icon = matched ? CheckCircle2 : XCircle;
    const tone = matched ? "text-emerald-500" : "text-destructive";
    const border = attempt.IsPrimary
        ? matched ? "border-emerald-500/40" : "border-destructive/40"
        : "border-border";

    const canPromote = onPromote !== null && matched && !attempt.IsPrimary;

    return (
        <li className={`rounded-md border ${border} bg-card p-2.5 text-xs space-y-1`}>
            <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden />
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{attempt.Kind}</Badge>
                {attempt.IsPrimary && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">PRIMARY</Badge>
                )}
                <code className="text-muted-foreground truncate" title={attempt.Expression}>
                    {attempt.Expression}
                </code>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {attempt.MatchCount} match{attempt.MatchCount === 1 ? "" : "es"}
                </Badge>
                {canPromote && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => onPromote!(attempt.SelectorId)}
                        disabled={isPromoting}
                        aria-label={`Promote selector ${attempt.SelectorId} to primary`}
                        title="Promote this fallback to primary for this step"
                    >
                        <Star className="h-3 w-3 mr-1" />
                        {isPromoting ? "Promoting…" : "Promote to primary"}
                    </Button>
                )}
            </div>

            {attempt.ResolvedExpression !== attempt.Expression && (
                <div className="text-[11px] text-muted-foreground pl-5">
                    Resolved: <code>{attempt.ResolvedExpression}</code>
                </div>
            )}

            <div className="flex items-start gap-2 pl-5">
                <Crosshair className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
                <code className={`${matched ? "text-foreground" : "text-muted-foreground italic"} break-all`}>
                    {elementSummary(attempt.Element)}
                </code>
            </div>

            {attempt.Error !== null && (
                <div className="pl-5 text-destructive text-[11px]">Error: {attempt.Error}</div>
            )}

            {showHistory && history !== null && <HistoryBlock bucket={history} />}
            {showHistory && history === null && (
                <div className="ml-5 mt-1 text-[11px] text-muted-foreground italic">
                    No prior replay history for this selector.
                </div>
            )}
        </li>
    );
}

export function SelectorComparisonPanel({ comparison, stepId, url, history, onPromoteToPrimary, failureReport, onDownload }: SelectorComparisonPanelProps) {
    const { Attempts, PrimaryMatched, AnyFallbackMatched, DriftDetected } = comparison;
    const hasHistory = history !== undefined;
    const [showHistory, setShowHistory] = useState(false);
    const [promotingId, setPromotingId] = useState<number | null>(null);

    const handleExport = () => {
        const bundle = buildSelectorComparisonBundle(comparison, { StepId: stepId, Url: url });
        const filename = buildSelectorComparisonFilename(stepId ?? null);
        const contents = serializeSelectorComparisonBundle(bundle);
        (onDownload ?? defaultDownload)(filename, contents);
        toast.success(`Exported selector comparison (${Attempts.length} attempt${Attempts.length === 1 ? "" : "s"})`);
    };

    const handlePromote = onPromoteToPrimary
        ? async (selectorId: number) => {
            setPromotingId(selectorId);
            try {
                await onPromoteToPrimary(selectorId);
                toast.success(`Promoted selector #${selectorId} to primary`);
            } catch (err) {
                toast.error(
                    `Failed to promote selector: ${err instanceof Error ? err.message : String(err)}`,
                );
            } finally {
                setPromotingId(null);
            }
        }
        : null;

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-primary" />
                    Selector Comparison
                    <Badge
                        variant={PrimaryMatched ? "secondary" : "destructive"}
                        className="ml-1 text-[10px]"
                    >
                        {PrimaryMatched ? "Primary OK" : "Primary failed"}
                    </Badge>
                    {AnyFallbackMatched && (
                        <Badge variant="outline" className="text-[10px]">Fallback found</Badge>
                    )}
                </CardTitle>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Switch
                            id="show-history"
                            checked={showHistory && hasHistory}
                            onCheckedChange={(v) => setShowHistory(Boolean(v))}
                            disabled={!hasHistory}
                            aria-label="Show prior replay outcomes per selector"
                        />
                        <Label
                            htmlFor="show-history"
                            className={`text-[11px] flex items-center gap-1 ${hasHistory ? "" : "text-muted-foreground"}`}
                        >
                            <History className="h-3 w-3" aria-hidden />
                            History
                        </Label>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExport}
                        disabled={Attempts.length === 0}
                        aria-label="Export selector comparison as JSON"
                    >
                        <FileDown className="h-3.5 w-3.5 mr-1.5" />
                        Export selector comparison
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {DriftDetected && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                            <strong>Selector drift:</strong> the primary selector no longer matches,
                            but a fallback resolved. Consider promoting the fallback or repairing the primary.
                        </span>
                    </div>
                )}
                {failureReport !== undefined && (
                    <FailureDetailsPanel report={failureReport} embedded />
                )}
                {Attempts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">
                        No selectors recorded for this step.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {Attempts.map((a) => (
                            <AttemptRow
                                key={a.SelectorId}
                                attempt={a}
                                history={hasHistory ? findHistoryForSelector(history, a.ResolvedExpression) : null}
                                showHistory={showHistory && hasHistory}
                                onPromote={handlePromote}
                                isPromoting={promotingId === a.SelectorId}
                            />
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
