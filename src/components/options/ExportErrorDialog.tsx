/**
 * Marco Extension — Export Error Dialog
 *
 * Renders a structured, user-friendly explanation when
 * `runStepGroupExport` (or its dry-run preview) returns an
 * `ExportFailure`. Replaces the prior fleeting toast — bundle/selection
 * problems deserve a dialog the user can read, copy from, and act on.
 *
 * Text content comes entirely from `explainExportFailure`; this file
 * is a thin shadcn shell that mirrors `ImportErrorDialog` so the two
 * sides of the bundle UI feel identical.
 */

import { AlertCircle, AlertTriangle, FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

import type {
    ExportErrorExplanation,
    ExportErrorSeverity,
} from "@/background/recorder/step-library/export-error-explainer";

interface ExportErrorDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly explanation: ExportErrorExplanation | null;
}

const SEVERITY_LABEL: Record<ExportErrorSeverity, string> = {
    Selection: "Selection problem",
    Bundle:    "Bundle would be invalid",
    Internal:  "Unexpected error",
};

const SEVERITY_STYLE: Record<ExportErrorSeverity, string> = {
    Selection: "text-amber-600 dark:text-amber-400",
    Bundle:    "text-destructive",
    Internal:  "text-destructive",
};

function SeverityIcon({ severity }: { severity: ExportErrorSeverity }) {
    const cls = `h-5 w-5 ${SEVERITY_STYLE[severity]}`;
    if (severity === "Selection") return <AlertTriangle className={cls} />;
    if (severity === "Bundle") return <FileWarning className={cls} />;
    return <AlertCircle className={cls} />;
}

export default function ExportErrorDialog(props: ExportErrorDialogProps) {
    const { open, onOpenChange, explanation } = props;
    if (explanation === null) return null;
    const failure = explanation.Failure;
    const ids = failure.OffendingIds;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <SeverityIcon severity={explanation.Severity} />
                        <DialogTitle>{explanation.Title}</DialogTitle>
                    </div>
                    <DialogDescription>
                        <span className={`text-xs font-medium ${SEVERITY_STYLE[explanation.Severity]}`}>
                            {SEVERITY_LABEL[explanation.Severity]}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-sm leading-relaxed">{explanation.Summary}</p>
                    <div className="rounded-md border-l-4 border-primary/60 bg-muted/40 px-3 py-2 text-sm">
                        <p className="font-medium">What to try</p>
                        <p className="mt-1 text-muted-foreground">{explanation.Suggestion}</p>
                    </div>

                    {ids.length > 0 && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                                Offending IDs ({ids.length})
                            </p>
                            <p className="mt-1 break-words font-mono text-xs text-destructive/90">
                                {ids.join(", ")}
                            </p>
                        </div>
                    )}

                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="tech" className="border-0">
                            <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                                Technical detail
                            </AccordionTrigger>
                            <AccordionContent>
                                <dl className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
                                    <DetailRow label="Reason" value={failure.Reason} mono />
                                    <DetailRow label="Detail" value={failure.Detail} />
                                    {ids.length > 0 && (
                                        <DetailRow
                                            label="IDs"
                                            value={ids.join(", ")}
                                            mono
                                        />
                                    )}
                                </dl>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className={`break-words ${mono === true ? "font-mono" : ""}`}>{value}</dd>
        </div>
    );
}
