/**
 * Marco Extension — Batch Delete Dialog
 *
 * Destructive confirmation surface for deleting every currently
 * selected step group in one shot. The dialog spells out exactly
 * what will be lost — counts of nested groups + steps that will
 * cascade — so the user has a real chance to back out.
 *
 * **No undo.** Cascading deletes wipe nested groups, every step
 * inside them, plus per-step wait configs and per-group input bags
 * stored in localStorage siblings. Restoring those from a snapshot
 * would re-allocate IDs, breaking any RunGroup step still pointing
 * at them. The honest UX is to make this dialog hard to dismiss
 * accidentally — a confirmation phrase + an explicit destructive
 * action button — rather than promise a recovery we can't deliver.
 */

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { StepGroupRow } from "@/background/recorder/step-library/db";

export interface BatchDeleteRow {
    readonly Group: StepGroupRow;
    /** Total descendants (excluding the group itself). */
    readonly DescendantCount: number;
    /** Total steps inside this group + every descendant. */
    readonly StepCount: number;
}

export interface BatchDeleteDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly rows: ReadonlyArray<BatchDeleteRow>;
    /** Fired with the ordered list of root ids to delete. */
    readonly onConfirm: (ids: ReadonlyArray<number>) => void;
}

const CONFIRM_PHRASE = "delete";

export default function BatchDeleteDialog({
    open,
    onOpenChange,
    rows,
    onConfirm,
}: BatchDeleteDialogProps) {
    const [phrase, setPhrase] = useState("");

    const totalGroups = rows.reduce((n, r) => n + 1 + r.DescendantCount, 0);
    const totalSteps = rows.reduce((n, r) => n + r.StepCount, 0);
    const canConfirm = rows.length > 0 && phrase.trim().toLowerCase() === CONFIRM_PHRASE;

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm(rows.map((r) => r.Group.StepGroupId));
        setPhrase("");
        onOpenChange(false);
    };

    return (
        <AlertDialog
            open={open}
            onOpenChange={(o) => {
                if (!o) setPhrase("");
                onOpenChange(o);
            }}
        >
            <AlertDialogContent className="max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Delete {rows.length} group{rows.length === 1 ? "" : "s"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>
                                This permanently removes <strong className="text-foreground">{totalGroups}</strong> group
                                {totalGroups === 1 ? "" : "s"} and{" "}
                                <strong className="text-foreground">{totalSteps}</strong> step
                                {totalSteps === 1 ? "" : "s"} (including every nested
                                child group). <strong className="text-destructive">This cannot be undone.</strong>
                            </p>
                            <p className="text-xs">
                                Tip: export the selection as a ZIP first if you might need it back.
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <ScrollArea className="max-h-48 rounded border">
                    <ul className="divide-y text-sm">
                        {rows.map((r) => (
                            <li key={r.Group.StepGroupId} className="flex items-center gap-2 px-3 py-2">
                                <Trash2 className="h-3.5 w-3.5 shrink-0 text-destructive/70" />
                                <span className="min-w-0 flex-1 truncate font-medium">
                                    {r.Group.Name}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {r.DescendantCount > 0 && (
                                        <>+{r.DescendantCount} nested · </>
                                    )}
                                    {r.StepCount} step{r.StepCount === 1 ? "" : "s"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </ScrollArea>

                <div className="space-y-1.5">
                    <Label htmlFor="batch-delete-confirm" className="text-xs">
                        Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
                    </Label>
                    <Input
                        id="batch-delete-confirm"
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        placeholder={CONFIRM_PHRASE}
                        autoComplete="off"
                    />
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction asChild>
                        <Button
                            variant="destructive"
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                        >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete {rows.length} group{rows.length === 1 ? "" : "s"}
                        </Button>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
