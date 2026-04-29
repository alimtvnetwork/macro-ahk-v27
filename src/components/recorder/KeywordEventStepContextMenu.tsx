/**
 * Marco Extension — Keyword Event Step Context Menu
 *
 * Right-click menu wrapping a single step row inside a KeywordEventCard.
 * Operates on the active multi-selection so the menu can act in bulk:
 *
 *   • Enable / Disable selected steps (sets `Enabled` on each step;
 *     playback skips steps with `Enabled === false`).
 *   • Remove selected steps (single bulk-delete, no per-step confirms).
 *   • Rename in sequence — relabels selected steps "Login 01", "Login 02"
 *     (or any `Base + {n}` template), writing to the optional `Label` field
 *     so the underlying Combo / Wait values are never destroyed.
 *
 * If the right-clicked step is NOT part of the current selection, the menu
 * silently treats *that single step* as the operand, matching how every
 * file manager handles right-click on an unselected row.
 *
 * Kept separate from `KeywordEventBulkContextMenu.tsx` because the event-level
 * menu owns Tags/Categories/Export/Delete-event semantics that don't apply
 * to steps; mixing them would dilute both surfaces.
 */

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    DEFAULT_SEQUENCE_RENAME,
    renderSequenceName,
    type SequenceRenameInput,
} from "@/lib/keyword-event-bulk-actions";
import type { KeywordEvent, KeywordEventStep } from "@/hooks/use-keyword-events";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface KeywordEventStepContextMenuProps {
    readonly children: React.ReactNode;
    /** The step row this menu wraps. Used as the operand when the user
     *  right-clicks an unselected row. */
    readonly step: KeywordEventStep;
    /** Parent event — needed for the event id passed to the bulk APIs and
     *  to resolve which Steps are currently selected. */
    readonly event: KeywordEvent;
    /** Currently selected step ids inside this event. */
    readonly selectedStepIds: ReadonlySet<string>;
    /** Bulk actions wired to `useKeywordEvents`. */
    readonly onSetEnabled: (eventId: string, stepIds: readonly string[], enabled: boolean) => void;
    readonly onRemove: (eventId: string, stepIds: readonly string[]) => void;
    readonly onRelabel: (eventId: string, stepIds: readonly string[], labels: readonly string[]) => void;
    /** Called after a destructive bulk action (Remove) so the parent can
     *  drop the now-stale selection. Optional. */
    readonly onAfterRemove?: () => void;
    /** Fired when the menu opens on a row that is NOT in the current
     *  selection — parent should replace the selection with just this row
     *  so the visible state matches the menu's operand list. */
    readonly onContextOpenForUnselected?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const SEQUENCE_STORAGE_KEY = "marco.bulkRename.stepSequence.v1";

function loadPersistedSequence(): SequenceRenameInput {
    try {
        const raw = typeof localStorage !== "undefined"
            ? localStorage.getItem(SEQUENCE_STORAGE_KEY)
            : null;
        if (!raw) return { ...DEFAULT_SEQUENCE_RENAME, Base: "Step {n}" };
        const parsed = JSON.parse(raw) as Partial<SequenceRenameInput>;
        return {
            Base: typeof parsed.Base === "string" ? parsed.Base : "Step {n}",
            Start: typeof parsed.Start === "number" && Number.isFinite(parsed.Start)
                ? Math.max(0, Math.floor(parsed.Start))
                : 1,
            Padding: typeof parsed.Padding === "number" && Number.isFinite(parsed.Padding)
                ? Math.max(1, Math.min(6, Math.floor(parsed.Padding)))
                : 2,
            Separator: typeof parsed.Separator === "string" ? parsed.Separator : " ",
        };
    } catch {
        return { ...DEFAULT_SEQUENCE_RENAME, Base: "Step {n}" };
    }
}

function persistSequence(input: SequenceRenameInput): void {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(SEQUENCE_STORAGE_KEY, JSON.stringify(input));
    } catch { /* quota / private mode — silently ignore */ }
}

// eslint-disable-next-line max-lines-per-function -- single component owns menu + dialog
export function KeywordEventStepContextMenu(
    props: KeywordEventStepContextMenuProps,
): JSX.Element {
    const {
        children, step, event, selectedStepIds,
        onSetEnabled, onRemove, onRelabel, onAfterRemove,
        onContextOpenForUnselected,
    } = props;

    const isRowSelected = selectedStepIds.has(step.Id);
    const handleOpenChange = (open: boolean): void => {
        if (open && !isRowSelected) onContextOpenForUnselected?.();
    };

    // Resolve the operand list once per render. If the right-clicked row is
    // NOT in the current selection, we operate on just that row — matches
    // file-manager UX and avoids surprising the user.
    const operandIds = useMemo<readonly string[]>(() => {
        if (selectedStepIds.has(step.Id) && selectedStepIds.size > 0) {
            // Preserve the ORDER from event.Steps, not insertion order of the Set,
            // so Sequence rename numbers steps top-to-bottom as displayed.
            return event.Steps
                .filter(s => selectedStepIds.has(s.Id))
                .map(s => s.Id);
        }
        return [step.Id];
    }, [step.Id, selectedStepIds, event.Steps]);

    const operandCount = operandIds.length;
    const allDisabled = useMemo(() => {
        const set = new Set(operandIds);
        return event.Steps.filter(s => set.has(s.Id)).every(s => s.Enabled === false);
    }, [operandIds, event.Steps]);

    const [renameOpen, setRenameOpen] = useState(false);

    return (
        <>
            <ContextMenu onOpenChange={handleOpenChange}>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent
                    className="w-56"
                    data-testid={`keyword-event-step-context-menu-${event.Id}`}
                >
                    <ContextMenuLabel className="text-[11px]">
                        {operandCount} step{operandCount === 1 ? "" : "s"}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    {allDisabled ? (
                        <ContextMenuItem
                            onSelect={() => onSetEnabled(event.Id, operandIds, true)}
                            data-testid={`keyword-event-step-menu-enable-${event.Id}`}
                        >
                            <Eye className="mr-2 h-3.5 w-3.5" /> Enable
                        </ContextMenuItem>
                    ) : (
                        <ContextMenuItem
                            onSelect={() => onSetEnabled(event.Id, operandIds, false)}
                            data-testid={`keyword-event-step-menu-disable-${event.Id}`}
                        >
                            <EyeOff className="mr-2 h-3.5 w-3.5" /> Disable
                        </ContextMenuItem>
                    )}
                    <ContextMenuItem
                        onSelect={() => setRenameOpen(true)}
                        data-testid={`keyword-event-step-menu-rename-${event.Id}`}
                    >
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Rename in sequence…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                            onRemove(event.Id, operandIds);
                            onAfterRemove?.();
                        }}
                        data-testid={`keyword-event-step-menu-remove-${event.Id}`}
                    >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <StepSequenceRenameDialog
                open={renameOpen}
                onOpenChange={setRenameOpen}
                stepIds={operandIds}
                onApply={(labels) => {
                    onRelabel(event.Id, operandIds, labels);
                    setRenameOpen(false);
                }}
            />
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Sequence rename dialog (steps)                                     */
/* ------------------------------------------------------------------ */

interface StepSequenceRenameDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly stepIds: readonly string[];
    readonly onApply: (labels: readonly string[]) => void;
}

// eslint-disable-next-line max-lines-per-function -- form + preview + footer kept together for clarity
function StepSequenceRenameDialog(props: StepSequenceRenameDialogProps): JSX.Element {
    const { open, onOpenChange, stepIds, onApply } = props;
    const [input, setInput] = useState<SequenceRenameInput>(loadPersistedSequence);

    useEffect(() => {
        if (open) setInput(loadPersistedSequence());
    }, [open]);

    const labels = useMemo(
        () => stepIds.map((_, i) => renderSequenceName(input, i)),
        [stepIds, input],
    );
    const previewRows = labels.slice(0, 6);
    const isValid = labels.every(l => l.trim().length > 0);

    const handleApply = (): void => {
        if (!isValid) return;
        persistSequence(input);
        onApply(labels);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-md"
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleApply();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>Rename steps in sequence</DialogTitle>
                    <DialogDescription>
                        Writes a Label like “Step 01”, “Step 02” to each selected
                        step. Use <code className="font-mono">{"{n}"}</code> to
                        insert the number anywhere; otherwise the Separator is
                        placed between Base and the number.
                    </DialogDescription>
                </DialogHeader>

                <form
                    className="space-y-3"
                    onSubmit={(e) => { e.preventDefault(); handleApply(); }}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="step-rename-base" className="text-xs">Base</Label>
                            <Input
                                id="step-rename-base"
                                autoFocus
                                tabIndex={1}
                                value={input.Base}
                                onChange={(e) => setInput(p => ({ ...p, Base: e.target.value }))}
                                data-testid="keyword-event-step-rename-base"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="step-rename-start" className="text-xs">Start at</Label>
                            <Input
                                id="step-rename-start"
                                tabIndex={2}
                                type="number"
                                min={0}
                                value={input.Start}
                                onChange={(e) => setInput(p => ({
                                    ...p,
                                    Start: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="step-rename-padding" className="text-xs">Padding</Label>
                            <Input
                                id="step-rename-padding"
                                tabIndex={3}
                                type="number"
                                min={1}
                                max={6}
                                value={input.Padding}
                                onChange={(e) => setInput(p => ({
                                    ...p,
                                    Padding: Math.max(1, Math.min(6, Math.floor(Number(e.target.value) || 1))),
                                }))}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="step-rename-sep" className="text-xs">Separator</Label>
                            <Input
                                id="step-rename-sep"
                                tabIndex={4}
                                value={input.Separator}
                                onChange={(e) => setInput(p => ({ ...p, Separator: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="rounded border border-border/60 bg-muted/30 p-2 text-xs">
                        <div className="mb-1 font-medium text-muted-foreground">Preview</div>
                        <ul className="space-y-0.5 font-mono">
                            {previewRows.map((l, i) => (
                                <li key={i} data-testid={`keyword-event-step-rename-preview-${i}`}>
                                    {l}
                                </li>
                            ))}
                            {labels.length > previewRows.length && (
                                <li className="italic text-muted-foreground">
                                    … and {labels.length - previewRows.length} more
                                </li>
                            )}
                        </ul>
                    </div>
                </form>

                <DialogFooter>
                    <Button variant="ghost" tabIndex={6} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        tabIndex={5}
                        disabled={!isValid}
                        onClick={handleApply}
                        data-testid="keyword-event-step-rename-apply"
                    >
                        Rename {stepIds.length} step{stepIds.length === 1 ? "" : "s"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
