/**
 * Marco Extension — Import Error Dialog
 *
 * Renders a structured, user-friendly explanation when
 * `runStepGroupImport` returns an `ImportFailure`. Replaces the prior
 * fleeting toast — bundle/schema problems deserve a dialog the user
 * can read, copy from, and act on.
 *
 * The text content comes entirely from `explainImportFailure`; this
 * file is a thin shadcn shell.
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
    ImportErrorExplanation,
    ImportErrorSeverity,
} from "@/background/recorder/step-library/import-error-explainer";

interface ImportErrorDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly explanation: ImportErrorExplanation | null;
    readonly fileName: string | null;
}

const SEVERITY_LABEL: Record<ImportErrorSeverity, string> = {
    Bundle:   "Bundle problem",
    Conflict: "Library conflict",
    Internal: "Unexpected error",
};

const SEVERITY_STYLE: Record<ImportErrorSeverity, string> = {
    Bundle:   "text-destructive",
    Conflict: "text-amber-600 dark:text-amber-400",
    Internal: "text-destructive",
};

function SeverityIcon({ severity }: { severity: ImportErrorSeverity }) {
    const cls = `h-5 w-5 ${SEVERITY_STYLE[severity]}`;
    if (severity === "Conflict") return <AlertTriangle className={cls} />;
    if (severity === "Bundle") return <FileWarning className={cls} />;
    return <AlertCircle className={cls} />;
}

export default function ImportErrorDialog(props: ImportErrorDialogProps) {
    const { open, onOpenChange, explanation, fileName } = props;
    if (explanation === null) return null;
    const failure = explanation.Failure;

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
                        {fileName !== null && (
                            <span className="ml-2 text-xs text-muted-foreground">
                                · <span className="font-mono">{fileName}</span>
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-sm leading-relaxed">{explanation.Summary}</p>
                    <div className="rounded-md border-l-4 border-primary/60 bg-muted/40 px-3 py-2 text-sm">
                        <p className="font-medium">What to try</p>
                        <p className="mt-1 text-muted-foreground">{explanation.Suggestion}</p>
                    </div>

                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="tech" className="border-0">
                            <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                                Technical detail
                            </AccordionTrigger>
                            <AccordionContent>
                                <dl className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
                                    <DetailRow label="Reason" value={failure.Reason} mono />
                                    <DetailRow label="Detail" value={failure.Detail} />
                                    {failure.OffendingNames !== undefined && failure.OffendingNames.length > 0 && (
                                        <DetailRow
                                            label="Names"
                                            value={failure.OffendingNames.join(", ")}
                                            mono
                                        />
                                    )}
                                    {failure.OffendingIds !== undefined && failure.OffendingIds.length > 0 && (
                                        <DetailRow
                                            label="IDs"
                                            value={failure.OffendingIds.join(", ")}
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
