/**
 * Marco Extension — Import Summary Dialog
 *
 * Post-success dialog that recaps what `runStepGroupImport()` actually
 * merged into the project. The companion to `ImportErrorDialog`: that
 * one fires for `Reason !== "Ok"`, this one fires for the happy path
 * but still surfaces non-fatal outcomes the user should know about —
 * primarily **name conflicts** that were auto-resolved by renaming
 * incoming root groups (the only conflict mode our default policy
 * "Rename" produces).
 *
 * The dialog never blocks; it's purely informative. The user can close
 * it and the imported groups remain. We list:
 *
 *   - Headline counts: groups, steps, run-group cross-refs preserved.
 *   - Source-bundle name + filename for traceability.
 *   - Conflict-rename pairs ("Old → New") so the user can find the
 *     freshly-imported copy if the name they expected was already taken.
 *   - Failures: this dialog never shows fatal failures (those route
 *     to `ImportErrorDialog`). The "Failures" line is rendered as
 *     "0 — see error dialog if any" to match the user-requested
 *     three-section summary (imported / conflicts / failures).
 */

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, CheckCircle2, FileWarning, Layers } from "lucide-react";

import type { ImportSummary } from "@/background/recorder/step-library/import-bundle";

interface ImportSummaryDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly summary: ImportSummary | null;
    /** ZIP filename the user uploaded — shown for traceability. */
    readonly fileName: string | null;
}

export default function ImportSummaryDialog(props: ImportSummaryDialogProps) {
    const { open, onOpenChange, summary, fileName } = props;
    if (summary === null) {
        // Render nothing meaningful until a summary is bound; Dialog
        // is still controlled by `open` so closing animations work.
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent />
            </Dialog>
        );
    }

    const renames = summary.RenamedRoots;
    const counts = summary.Counts;
    const bundleName = summary.Manifest.BundleName;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        Import complete
                    </DialogTitle>
                    <DialogDescription>
                        Bundle <span className="font-medium">{bundleName}</span>
                        {fileName !== null && (
                            <>
                                {" "}· <span className="font-mono text-xs">{fileName}</span>
                            </>
                        )}
                        {" "}was merged into the current project.
                    </DialogDescription>
                </DialogHeader>

                {/* ---------- Imported groups ---------- */}
                <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Layers className="h-4 w-4 text-primary" />
                        Imported
                    </h3>
                    <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/20 p-3 text-center text-sm">
                        <CountStat label="Groups" value={counts.StepGroups} />
                        <CountStat label="Steps" value={counts.Steps} />
                        <CountStat
                            label="Run-group refs"
                            value={counts.RunGroupRefs}
                            hint="Cross-group jumps preserved"
                        />
                    </div>
                </section>

                <Separator />

                {/* ---------- Conflicts ---------- */}
                <section className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <FileWarning className="h-4 w-4 text-amber-500" />
                        Conflicts ({renames.length})
                    </h3>
                    {renames.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No name clashes — every imported root kept its original name.
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-muted-foreground">
                                Roots whose names were already taken were renamed to keep
                                both copies side by side.
                            </p>
                            <ScrollArea className="max-h-48 rounded-md border">
                                <ul className="divide-y text-sm">
                                    {renames.map((r, idx) => (
                                        <li
                                            key={`${r.OldName}-${idx}`}
                                            className="flex items-center gap-2 px-3 py-1.5"
                                        >
                                            <span className="truncate font-mono text-xs text-muted-foreground line-through">
                                                {r.OldName}
                                            </span>
                                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                            <span className="truncate font-mono text-xs font-medium">
                                                {r.NewName}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </ScrollArea>
                        </>
                    )}
                </section>

                <Separator />

                {/* ---------- Failures ---------- */}
                <section className="space-y-1">
                    <h3 className="text-sm font-semibold">Failures</h3>
                    <p className="text-sm text-muted-foreground">
                        0 — fatal failures route to a separate error dialog and
                        roll the import back automatically.
                    </p>
                </section>

                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CountStat(props: { label: string; value: number; hint?: string }) {
    return (
        <div className="flex flex-col items-center gap-0.5">
            <span className="text-2xl font-semibold tabular-nums">{props.value}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {props.label}
            </span>
            {props.hint !== undefined && (
                <span className="text-[10px] text-muted-foreground/80">{props.hint}</span>
            )}
        </div>
    );
}
