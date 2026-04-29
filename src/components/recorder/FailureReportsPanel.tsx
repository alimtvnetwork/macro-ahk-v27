/**
 * Marco Extension — Failure Reports Panel
 *
 * Renders a list of structured {@link FailureReport}s with per-row
 * checkboxes and a single "Export selected" button that downloads the
 * selection as a JSON bundle suitable for sharing with an AI assistant.
 *
 * Pure presentation — the parent passes the report list. Bundle building
 * and filename formatting live in `./failure-export.ts` so they can be
 * tested without jsdom.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileDown, AlertTriangle, ChevronDown, ChevronRight, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import type { FailureReport } from "@/background/recorder/failure-logger";
import {
    buildFailureBundle,
    serializeFailureBundle,
    serializeJson,
    buildFailureBundleFilename,
    pickLastFailureReport,
    buildLastFailureFilename,
    listStepFailureOptions,
    pickFailureReportByStepId,
    DEFAULT_EXPORT_FORMAT,
    type ExportFormat,
} from "./failure-export";
import { validateFailureReportPayload } from "./failure-report-validator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FailureDetailsPanel } from "./FailureDetailsPanel";
import { SelectorReplayTracePanel } from "./SelectorReplayTracePanel";

interface FailureReportsPanelProps {
    readonly reports: ReadonlyArray<FailureReport>;
    /** Test seam: override the `download` side effect. */
    readonly onDownload?: (filename: string, contents: string) => void;
    /**
     * Test seam: override the clipboard side effect. Defaults to
     * `navigator.clipboard.writeText`. Returning a rejected promise
     * triggers the failure toast.
     */
    readonly onCopy?: (contents: string) => Promise<void>;
}

function defaultCopy(contents: string): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
        return Promise.reject(new Error("Clipboard API unavailable in this context"));
    }
    return navigator.clipboard.writeText(contents);
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

function rowKey(r: FailureReport, idx: number): string {
    return `${r.Timestamp}#${r.StepId ?? "noid"}#${idx}`;
}

const STEP_OPTION_NULL = "__null_step__";

export function FailureReportsPanel({ reports, onDownload, onCopy }: FailureReportsPanelProps) {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const [pickedStep, setPickedStep] = useState<string | null>(null);
    const [exportFormat, setExportFormat] = useState<ExportFormat>(DEFAULT_EXPORT_FORMAT);

    const stepOptions = useMemo(() => listStepFailureOptions(reports), [reports]);

    // Reset / auto-clear the picker when the option list shrinks below the current pick.
    const validPickedStep = useMemo(() => {
        if (pickedStep === null) return null;
        const exists = stepOptions.some(
            (o) => (o.StepId === null ? STEP_OPTION_NULL : String(o.StepId)) === pickedStep,
        );
        return exists ? pickedStep : null;
    }, [pickedStep, stepOptions]);

    const allKeys = useMemo(() => reports.map((r, i) => rowKey(r, i)), [reports]);
    const allSelected = selected.size > 0 && selected.size === reports.length;
    const noneSelected = selected.size === 0;

    const toggle = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); }
            return next;
        });
    };

    const toggleExpanded = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) { next.delete(key); } else { next.add(key); }
            return next;
        });
    };

    const toggleAll = () => {
        setSelected(allSelected ? new Set() : new Set(allKeys));
    };

    const handleExport = () => {
        const picked = reports.filter((_, i) => selected.has(rowKey(reports[i], i)));
        if (picked.length === 0) {
            toast.error("Select at least one failure to export");
            return;
        }
        const bundle = buildFailureBundle(picked);
        const filename = buildFailureBundleFilename();
        const contents = serializeFailureBundle(bundle, exportFormat);
        (onDownload ?? defaultDownload)(filename, contents);
        const validation = validateFailureReportPayload(contents);
        if (!validation.Valid) {
            toast.warning(`Exported ${filename} — schema warning`, {
                description: validation.Summary,
            });
        } else {
            toast.success(`Exported ${picked.length} failure report${picked.length === 1 ? "" : "s"}`);
        }
    };

    const handleExportLast = () => {
        const last = pickLastFailureReport(reports);
        if (last === null) {
            toast.error("No failures recorded yet");
            return;
        }
        const filename = buildLastFailureFilename(last);
        const contents = serializeJson(last, exportFormat);
        (onDownload ?? defaultDownload)(filename, contents);
        const stepLabel = last.StepId !== null ? ` (Step #${last.StepId})` : "";
        const validation = validateFailureReportPayload(contents);
        if (!validation.Valid) {
            toast.warning(`Downloaded ${filename} — schema warning`, {
                description: validation.Summary,
            });
        } else {
            toast.success(`Downloaded ${filename}`, {
                description: `Last failure${stepLabel} saved as JSON`,
            });
        }
    };

    const handleCopyLast = async () => {
        const last = pickLastFailureReport(reports);
        if (last === null) {
            toast.error("No failures recorded yet");
            return;
        }
        const contents = serializeJson(last, exportFormat);
        const stepLabel = last.StepId !== null ? ` (Step #${last.StepId})` : "";
        try {
            await (onCopy ?? defaultCopy)(contents);
        } catch (e) {
            toast.error("Copy failed — clipboard unavailable", {
                description: (e as Error).message,
            });
            return;
        }
        const validation = validateFailureReportPayload(contents);
        if (!validation.Valid) {
            toast.warning(`Copied last failure${stepLabel} — schema warning`, {
                description: validation.Summary,
            });
        } else {
            toast.success(`Copied last failure${stepLabel} to clipboard`, {
                description: `${contents.length.toLocaleString()} chars — paste into your ticket or chat`,
            });
        }
    };

    const handleExportByStep = () => {
        if (validPickedStep === null) {
            toast.error("Pick a Step first");
            return;
        }
        const stepId = validPickedStep === STEP_OPTION_NULL ? null : Number(validPickedStep);
        const report = pickFailureReportByStepId(reports, stepId);
        if (report === null) {
            toast.error(
                stepId === null
                    ? "No failures without a Step ID"
                    : `No failures recorded for Step #${stepId}`,
            );
            return;
        }
        const filename = buildLastFailureFilename(report);
        const contents = serializeJson(report, exportFormat);
        (onDownload ?? defaultDownload)(filename, contents);
        const stepLabel = stepId === null ? " (no Step ID)" : ` (Step #${stepId})`;
        const validation = validateFailureReportPayload(contents);
        if (!validation.Valid) {
            toast.warning(`Downloaded ${filename} — schema warning`, {
                description: validation.Summary,
            });
        } else {
            toast.success(`Downloaded ${filename}`, {
                description: `Latest failure for${stepLabel} saved as JSON`,
            });
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Failure Reports
                    <Badge variant="secondary" className="ml-1">{reports.length}</Badge>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleAll}
                        disabled={reports.length === 0}
                    >
                        {allSelected ? "Clear" : "Select all"}
                    </Button>
                    <Select
                        value={exportFormat}
                        onValueChange={(v) => setExportFormat(v as ExportFormat)}
                    >
                        <SelectTrigger
                            className="h-8 w-[140px] text-xs"
                            aria-label="JSON output format for exported failure reports"
                            title="Choose Pretty (2-space indent, easier to read in tickets) or Minified (single line, smaller files)"
                        >
                            <SelectValue placeholder="Format…" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pretty">Pretty JSON</SelectItem>
                            <SelectItem value="minified">Minified JSON</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyLast}
                        disabled={reports.length === 0}
                        aria-label="Copy last failure report JSON to clipboard"
                        title="Copy the most recent failure report JSON to the clipboard for pasting into a ticket or chat"
                    >
                        <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
                        Copy last failure JSON
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportLast}
                        disabled={reports.length === 0}
                        aria-label="Export last failure report as JSON"
                        title="Download the most recent failure report (selectors, EvaluatedAttempts, variables) as JSON"
                    >
                        <FileDown className="h-3.5 w-3.5 mr-1.5" />
                        Export last failure
                    </Button>
                    <div className="flex items-center gap-1.5">
                        <Select
                            value={validPickedStep ?? ""}
                            onValueChange={(v) => setPickedStep(v === "" ? null : v)}
                            disabled={stepOptions.length === 0}
                        >
                            <SelectTrigger
                                className="h-8 w-[180px] text-xs"
                                aria-label="Choose a Step ID to export its latest failure"
                            >
                                <SelectValue placeholder="Pick step…" />
                            </SelectTrigger>
                            <SelectContent>
                                {stepOptions.map((o) => {
                                    const value = o.StepId === null ? STEP_OPTION_NULL : String(o.StepId);
                                    const label = o.StepId === null
                                        ? "(no Step ID)"
                                        : `Step #${o.StepId}`;
                                    const kind = o.StepKind ? ` · ${o.StepKind}` : "";
                                    const count = o.Count > 1 ? ` ×${o.Count}` : "";
                                    return (
                                        <SelectItem key={value} value={value}>
                                            {label}{kind}{count}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportByStep}
                            disabled={validPickedStep === null}
                            aria-label="Export the latest failure report for the picked Step ID"
                            title="Download the most recent failure report for the picked Step ID as JSON"
                        >
                            <FileDown className="h-3.5 w-3.5 mr-1.5" />
                            Export step
                        </Button>
                    </div>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleExport}
                        disabled={noneSelected}
                        aria-label="Export selected failure reports"
                    >
                        <FileDown className="h-3.5 w-3.5 mr-1.5" />
                        Export failure reports
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {reports.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-4 text-center">
                        No failures recorded.
                    </p>
                ) : (
                    <ScrollArea className="h-64 pr-2">
                        <ul className="space-y-1.5">
                            {reports.map((r, i) => {
                                const key = rowKey(r, i);
                                const checked = selected.has(key);
                                const isExpanded = expanded.has(key);
                                const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
                                return (
                                    <li
                                        key={key}
                                        className="rounded-md border border-border bg-card px-2.5 py-2 space-y-2"
                                    >
                                        <div className="flex items-start gap-2">
                                            <Checkbox
                                                id={`fr-${key}`}
                                                checked={checked}
                                                onCheckedChange={() => toggle(key)}
                                                aria-label={`Select failure report ${i + 1}`}
                                            />
                                            <label
                                                htmlFor={`fr-${key}`}
                                                className="flex-1 cursor-pointer text-xs space-y-0.5"
                                            >
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Badge
                                                        variant={r.Phase === "Replay" ? "destructive" : "outline"}
                                                        className="text-[10px] px-1.5 py-0"
                                                    >
                                                        {r.Phase}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                                                        {r.Reason}
                                                    </Badge>
                                                    {r.StepKind !== null && (
                                                        <span className="text-muted-foreground">{r.StepKind}</span>
                                                    )}
                                                    {r.StepId !== null && (
                                                        <span className="text-muted-foreground">· Step #{r.StepId}</span>
                                                    )}
                                                    <span className="text-muted-foreground ml-auto">
                                                        {r.Timestamp}
                                                    </span>
                                                </div>
                                                <p className="text-foreground line-clamp-2">{r.Message}</p>
                                            </label>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-1.5 -mt-0.5"
                                                onClick={() => toggleExpanded(key)}
                                                aria-label={isExpanded ? `Hide details for failure ${i + 1}` : `Show details for failure ${i + 1}`}
                                                aria-expanded={isExpanded}
                                            >
                                                <ChevronIcon className="h-3.5 w-3.5" />
                                                <span className="ml-1 text-[10px]">{isExpanded ? "Hide" : "Details"}</span>
                                            </Button>
                                        </div>
                                        {isExpanded && (
                                            <div className="space-y-2">
                                                <FailureDetailsPanel report={r} embedded />
                                                <SelectorReplayTracePanel report={r} embedded />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}
