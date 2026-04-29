/**
 * Marco Extension — Export Preview Dialog
 *
 * Shown after the user clicks any "Download .zip" / "Export selected"
 * trigger but **before** the bundle is actually built. Surfaces a
 * dry-run summary computed by `previewStepGroupExport`:
 *
 *   - Effective StepGroup count (after descendant expansion)
 *   - Step count
 *   - RunGroup invocation count + dangling-target warnings
 *
 * If `DanglingRunGroupRefs` is non-empty the real export would fail
 * with `RunGroupTargetMissing`, so the confirm button is disabled and
 * the user is told exactly which steps to fix or include.
 *
 * Pure presentational — receives the preview payload + callbacks; no
 * sql.js, no JSZip, no toasts. The parent panel owns the actual
 * download flow.
 */

import { AlertTriangle, Download, FileArchive, Layers, ListOrdered, Workflow } from "lucide-react";

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
import type {
    DanglingRunGroupRef,
    StepGroupExportPreview,
} from "@/background/recorder/step-library/export-bundle";

export interface ExportPreviewDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    /**
     * `null` while the parent has not yet computed a preview (e.g. the
     * dialog was just opened). When non-null, drives every counter and
     * the warning list below.
     */
    readonly preview: StepGroupExportPreview | null;
    readonly includeDescendants: boolean;
    readonly onConfirm: () => void;
}

function StatTile(props: {
    readonly icon: React.ReactNode;
    readonly label: string;
    readonly value: number;
    readonly tone?: "default" | "warn";
}) {
    const toneClass =
        props.tone === "warn"
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-border bg-muted/30 text-foreground";
    return (
        <div className={`flex flex-col gap-1 rounded-md border p-3 ${toneClass}`}>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                {props.icon}
                {props.label}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{props.value}</div>
        </div>
    );
}

function WarningRow(props: { readonly warning: DanglingRunGroupRef }) {
    const { warning } = props;
    const target =
        warning.TargetStepGroupId === null
            ? "no target set"
            : `target #${warning.TargetStepGroupId} is outside the selection`;
    const label = warning.StepLabel ?? `Step #${warning.StepId}`;
    return (
        <li className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
            <div className="font-medium text-destructive">
                “{label}” in “{warning.OwnerStepGroupName}”
            </div>
            <div className="mt-0.5 text-destructive/80">
                RunGroup step #{warning.StepId} — {target}
            </div>
        </li>
    );
}

export default function ExportPreviewDialog(props: ExportPreviewDialogProps) {
    const { open, onOpenChange, preview, includeDescendants, onConfirm } = props;

    const warnings = preview?.DanglingRunGroupRefs ?? [];
    const hasWarnings = warnings.length > 0;
    const ready = preview !== null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileArchive className="h-5 w-5 text-primary" />
                        Export preview
                    </DialogTitle>
                    <DialogDescription>
                        Review what will be packaged before the .zip is generated.
                        {includeDescendants
                            ? " Descendants are included."
                            : " Descendants are skipped — only ticked groups ship."}
                    </DialogDescription>
                </DialogHeader>

                {!ready ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        Computing preview…
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-3 gap-2">
                            <StatTile
                                icon={<Layers className="h-3.5 w-3.5" />}
                                label="Step groups"
                                value={preview.Counts.StepGroups}
                            />
                            <StatTile
                                icon={<ListOrdered className="h-3.5 w-3.5" />}
                                label="Steps"
                                value={preview.Counts.Steps}
                            />
                            <StatTile
                                icon={<Workflow className="h-3.5 w-3.5" />}
                                label="RunGroup refs"
                                value={preview.Counts.RunGroupRefs}
                                tone={hasWarnings ? "warn" : "default"}
                            />
                        </div>

                        {hasWarnings ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    {warnings.length} RunGroup reference
                                    {warnings.length === 1 ? "" : "s"} would break on import
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    These steps invoke a StepGroup that is not part of the
                                    current selection. Tick the missing groups (or enable
                                    “Include descendants”) before exporting.
                                </p>
                                <ScrollArea className="max-h-48 rounded border">
                                    <ul className="flex flex-col gap-1 p-2">
                                        {warnings.map((w) => (
                                            <WarningRow key={w.StepId} warning={w} />
                                        ))}
                                    </ul>
                                </ScrollArea>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                All RunGroup references resolve inside the selection — the bundle
                                is safe to import elsewhere.
                            </p>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!ready || hasWarnings}
                        onClick={onConfirm}
                        title={
                            hasWarnings
                                ? "Resolve the RunGroup warnings above before downloading"
                                : undefined
                        }
                    >
                        <Download className="mr-1 h-4 w-4" />
                        Download .zip
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
