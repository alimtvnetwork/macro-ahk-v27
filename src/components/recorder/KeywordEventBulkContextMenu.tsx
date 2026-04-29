/**
 * Marco Extension — Keyword Event Bulk Context Menu
 *
 * Right-click menu for the keyword events list. Shown on selected rows;
 * exposes bulk Run-state toggles, Add/Remove tags, Rename in sequence,
 * Export selected as ZIP, and Delete.
 *
 * Why a dedicated component:
 *   • Keeps `KeywordEventsPanel.tsx` focused on layout/selection plumbing.
 *   • Centralises the dialog state for the three multi-step actions
 *     (tags, rename, export) so reuse by other surfaces (Steps, Sessions,
 *     Scripts/Projects) is a matter of swapping the data source.
 *
 * The Export action ships JSON-in-ZIP today; the SQLite-in-ZIP pipeline is
 * a separate roadmap item tracked in plan.md.
 */

import { useEffect, useMemo, useState } from "react";
import {
    Download,
    Eye,
    EyeOff,
    FolderTree,
    HelpCircle,
    Pencil,
    Tag,
    TagsIcon,
    Trash2,
    Upload,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DEFAULT_SEQUENCE_RENAME,
    collectCategories,
    computeSequencePreview,
    mergeTags,
    normaliseCategory,
    parseTagInput,
    removeTags,
    renderSequenceName,
    type SequencePreviewIssue,
    type SequenceRenameInput,
} from "@/lib/keyword-event-bulk-actions";
import {
    downloadKeywordEventsZip,
    type KeywordEventsExportProgress,
} from "@/lib/keyword-events-sqlite-export";
import { Progress } from "@/components/ui/progress";
import {
    buildPatchFromImport,
    diffMatchedFields,
    planImportMatches,
    readKeywordEventsZip,
    type ImportMatchPlan,
    type KeywordEventsImportResult,
} from "@/lib/keyword-events-sqlite-import";
import type { KeywordEvent } from "@/hooks/use-keyword-events";

export interface KeywordEventBulkContextMenuProps {
    /** The row this menu wraps. Right-clicking it opens the menu. */
    readonly children: React.ReactNode;
    /** Events that are currently part of the selection set. */
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    /** Every event in the panel — used by Rename-in-sequence to detect
     *  collisions with rows the user did NOT select. Optional; when omitted
     *  collision detection is skipped. */
    readonly allEvents?: ReadonlyArray<KeywordEvent>;
    /** Called when the user right-clicks a row that isn't yet selected — the
     *  parent should add it to the selection so the menu acts on it. */
    readonly onContextOpenForUnselected?: () => void;
    /** True when the wrapped row is itself in the selection. */
    readonly isRowSelected: boolean;
    /** Apply a patch to one event by id. */
    readonly onUpdateEvent: (id: string, patch: Partial<Omit<KeywordEvent, "Id">>) => void;
    /** Delete one event by id. */
    readonly onRemoveEvent: (id: string) => void;
    /** Clear the selection set (called after destructive actions). */
    readonly onClearSelection: () => void;
}

type DialogKind = null | "tags-add" | "tags-remove" | "category" | "rename" | "export" | "import" | "delete";

export function KeywordEventBulkContextMenu(
    props: KeywordEventBulkContextMenuProps,
): JSX.Element {
    const {
        children, selectedEvents, allEvents, isRowSelected, onContextOpenForUnselected,
        onUpdateEvent, onRemoveEvent, onClearSelection,
    } = props;

    const [dialog, setDialog] = useState<DialogKind>(null);
    const count = selectedEvents.length;

    const handleOpenChange = (open: boolean): void => {
        if (open && !isRowSelected) onContextOpenForUnselected?.();
    };

    const handleEnable = (enabled: boolean): void => {
        for (const ev of selectedEvents) onUpdateEvent(ev.Id, { Enabled: enabled });
    };

    const handleDeleteConfirmed = (): void => {
        for (const ev of selectedEvents) onRemoveEvent(ev.Id);
        onClearSelection();
        setDialog(null);
    };

    return (
        <>
            <ContextMenu onOpenChange={handleOpenChange}>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent
                    className="w-56"
                    data-testid="keyword-events-context-menu"
                >
                    <ContextMenuLabel className="text-xs text-muted-foreground">
                        {count} selected
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => handleEnable(true)}
                        data-testid="keyword-events-context-enable"
                    >
                        <Eye className="mr-2 h-4 w-4" /> Enable
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => handleEnable(false)}
                        data-testid="keyword-events-context-disable"
                    >
                        <EyeOff className="mr-2 h-4 w-4" /> Disable
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => setDialog("tags-add")}
                        data-testid="keyword-events-context-tags-add"
                    >
                        <Tag className="mr-2 h-4 w-4" /> Add labels…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("tags-remove")}
                        data-testid="keyword-events-context-tags-remove"
                    >
                        <TagsIcon className="mr-2 h-4 w-4" /> Remove labels…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("category")}
                        data-testid="keyword-events-context-category"
                    >
                        <FolderTree className="mr-2 h-4 w-4" /> Set category…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("rename")}
                        data-testid="keyword-events-context-rename"
                    >
                        <Pencil className="mr-2 h-4 w-4" /> Rename in sequence…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("export")}
                        data-testid="keyword-events-context-export"
                    >
                        <Download className="mr-2 h-4 w-4" /> Export selected as ZIP…
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setDialog("import")}
                        data-testid="keyword-events-context-import"
                    >
                        <Upload className="mr-2 h-4 w-4" /> Update selected from ZIP…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDialog("delete")}
                        data-testid="keyword-events-context-delete"
                    >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete…
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            <BulkTagsDialog
                mode="add"
                open={dialog === "tags-add"}
                onOpenChange={(o) => setDialog(o ? "tags-add" : null)}
                selectedEvents={selectedEvents}
                onApply={(tags) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Tags: mergeTags(ev.Tags, tags) });
                    }
                }}
            />
            <BulkTagsDialog
                mode="remove"
                open={dialog === "tags-remove"}
                onOpenChange={(o) => setDialog(o ? "tags-remove" : null)}
                selectedEvents={selectedEvents}
                onApply={(tags) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Tags: removeTags(ev.Tags, tags) });
                    }
                }}
            />
            <BulkRenameSequenceDialog
                open={dialog === "rename"}
                onOpenChange={(o) => setDialog(o ? "rename" : null)}
                selectedEvents={selectedEvents}
                allEvents={allEvents}
                onApply={(input) => {
                    selectedEvents.forEach((ev, i) => {
                        onUpdateEvent(ev.Id, { Keyword: renderSequenceName(input, i) });
                    });
                }}
            />
            <BulkCategoryDialog
                open={dialog === "category"}
                onOpenChange={(o) => setDialog(o ? "category" : null)}
                selectedEvents={selectedEvents}
                onApply={(category) => {
                    for (const ev of selectedEvents) {
                        onUpdateEvent(ev.Id, { Category: category });
                    }
                }}
            />
            <BulkExportDialog
                open={dialog === "export"}
                onOpenChange={(o) => setDialog(o ? "export" : null)}
                selectedEvents={selectedEvents}
            />
            <BulkImportDialog
                open={dialog === "import"}
                onOpenChange={(o) => setDialog(o ? "import" : null)}
                selectedEvents={selectedEvents}
                onApply={(plan) => {
                    for (const m of plan.matches) {
                        onUpdateEvent(m.target.Id, buildPatchFromImport(m.source));
                    }
                }}
            />
            <BulkDeleteConfirmDialog
                open={dialog === "delete"}
                onOpenChange={(o) => setDialog(o ? "delete" : null)}
                selectedEvents={selectedEvents}
                onConfirm={handleDeleteConfirmed}
            />
        </>
    );
}

/* ------------------------------------------------------------------ */
/*  Tags dialog                                                       */
/* ------------------------------------------------------------------ */

interface BulkTagsDialogProps {
    readonly mode: "add" | "remove";
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly onApply: (tags: string[]) => void;
}

function BulkTagsDialog(props: BulkTagsDialogProps): JSX.Element {
    const { mode, open, onOpenChange, selectedEvents, onApply } = props;
    const [raw, setRaw] = useState("");
    const tags = useMemo(() => parseTagInput(raw), [raw]);
    const existing = useMemo(() => {
        const all = new Set<string>();
        for (const ev of selectedEvents) {
            (ev.Tags ?? []).forEach(t => all.add(t));
        }
        return Array.from(all).sort((a, b) => a.localeCompare(b));
    }, [selectedEvents]);

    const handleApply = (): void => {
        if (tags.length === 0) return;
        onApply(tags);
        setRaw("");
        onOpenChange(false);
    };

    const title = mode === "add" ? "Add labels" : "Remove labels";
    const desc = mode === "add"
        ? `Label ${selectedEvents.length} selected event${selectedEvents.length === 1 ? "" : "s"}.`
        : `Remove labels from ${selectedEvents.length} selected event${selectedEvents.length === 1 ? "" : "s"}.`;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setRaw(""); onOpenChange(o); }}>
            <DialogContent data-testid={`keyword-events-bulk-tags-dialog-${mode}`}>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{desc} Separate labels with commas or spaces.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-tags-input">Labels</Label>
                        <Input
                            id="bulk-tags-input"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            placeholder="e.g. login, smoke, regression"
                            autoFocus
                            data-testid="keyword-events-bulk-tags-input"
                        />
                    </div>
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {tags.map(t => (
                                <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                            ))}
                        </div>
                    )}
                    {mode === "remove" && existing.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">Existing labels on selection:</p>
                            <div className="flex flex-wrap gap-1">
                                {existing.map(t => (
                                    <Badge
                                        key={t}
                                        variant="outline"
                                        className="cursor-pointer text-[10px]"
                                        onClick={() => setRaw(r => r.length === 0 ? t : `${r}, ${t}`)}
                                    >
                                        {t}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleApply}
                        disabled={tags.length === 0}
                        data-testid={`keyword-events-bulk-tags-apply-${mode}`}
                    >
                        {mode === "add" ? "Add" : "Remove"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Rename in sequence dialog                                          */
/* ------------------------------------------------------------------ */

interface BulkRenameSequenceDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly allEvents?: ReadonlyArray<KeywordEvent>;
    readonly onApply: (input: SequenceRenameInput) => void;
}

// ──────────────────────────────────────────────────────────────────────────
//  Persisted Sequence settings: versioned envelope + migration chain
// ──────────────────────────────────────────────────────────────────────────
//
// Storage shape (v2+):
//     { v: <number>, data: <SequenceRenameInput> }
//
// Legacy (v1) shape that may exist on disk:
//     { Base, Start, Padding, Separator }   ← bare object, no envelope
//
// To evolve the schema:
//   1. Bump CURRENT_SEQUENCE_VERSION.
//   2. Append a migration to SEQUENCE_MIGRATIONS that takes the previous
//      version's payload and returns the next one. Migrations run in
//      sequence and are idempotent (re-running on already-current data
//      is a no-op because the version stamp matches).
//   3. Field-validate the final result in `coerceSequenceInput()` so any
//      garbage from older builds still falls back to safe defaults.
//
// The localStorage KEY itself is stable across versions to avoid orphaned
// keys from older releases piling up in users' browser storage.
const SEQUENCE_RENAME_STORAGE_KEY = "marco.bulkRename.sequence";

/** Bump this whenever the persisted shape changes in a non-additive way. */
const CURRENT_SEQUENCE_VERSION = 2;

/** Legacy key used before the versioned envelope was introduced. */
const LEGACY_SEQUENCE_KEY_V1 = "marco.bulkRename.sequence.v1";

interface VersionedSequenceEnvelope {
    readonly v: number;
    readonly data: SequenceRenameInput;
}

/**
 * Migration chain: index `i` upgrades a payload from version `i+1` to `i+2`.
 * Each migration receives the *raw* parsed JSON (shape is whatever the
 * previous version persisted) and returns the next version's payload.
 *
 * Add new migrations to the end of this array — never reorder or remove.
 */
const SEQUENCE_MIGRATIONS: ReadonlyArray<(prev: Partial<SequenceRenameInput>) => Partial<SequenceRenameInput>> = [
    // v1 → v2: no shape change, just wrapped in {v, data} envelope. The
    // wrapping is handled by the loader; this migration is identity.
    (prev) => prev,
    // Example for future use:
    //   v2 → v3: rename `Padding` to `MinDigits`
    // (prev) => ({ ...prev, MinDigits: prev.Padding ?? 2 }),
];

/** Field-validate and clamp a raw object into a safe SequenceRenameInput. */
function coerceSequenceInput(parsed: Partial<SequenceRenameInput>): SequenceRenameInput {
    return {
        Base: typeof parsed.Base === "string" ? parsed.Base : DEFAULT_SEQUENCE_RENAME.Base,
        Start: typeof parsed.Start === "number" && Number.isFinite(parsed.Start)
            ? Math.max(0, Math.floor(parsed.Start))
            : DEFAULT_SEQUENCE_RENAME.Start,
        Padding: typeof parsed.Padding === "number" && Number.isFinite(parsed.Padding)
            ? Math.max(1, Math.min(6, Math.floor(parsed.Padding)))
            : DEFAULT_SEQUENCE_RENAME.Padding,
        Separator: typeof parsed.Separator === "string"
            ? parsed.Separator
            : DEFAULT_SEQUENCE_RENAME.Separator,
    };
}

/** Run migrations from `fromVersion` up to CURRENT_SEQUENCE_VERSION. */
function migrateSequencePayload(payload: Partial<SequenceRenameInput>, fromVersion: number): Partial<SequenceRenameInput> {
    let current = payload;
    let v = fromVersion;
    while (v < CURRENT_SEQUENCE_VERSION) {
        const migration = SEQUENCE_MIGRATIONS[v - 1];
        if (!migration) break;  // no migration registered → stop and let coerce fix it
        current = migration(current);
        v++;
    }
    return current;
}

function loadPersistedSequence(): SequenceRenameInput {
    if (typeof localStorage === "undefined") return DEFAULT_SEQUENCE_RENAME;
    try {
        // 1. Prefer the current versioned key.
        const raw = localStorage.getItem(SEQUENCE_RENAME_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as Partial<VersionedSequenceEnvelope> | Partial<SequenceRenameInput>;
            // Versioned envelope?
            if (parsed && typeof parsed === "object" && "v" in parsed && typeof parsed.v === "number" && "data" in parsed && parsed.data) {
                const migrated = migrateSequencePayload(parsed.data, parsed.v);
                return coerceSequenceInput(migrated);
            }
            // Bare object found under the new key (shouldn't happen, but treat as v1).
            const migrated = migrateSequencePayload(parsed as Partial<SequenceRenameInput>, 1);
            return coerceSequenceInput(migrated);
        }
        // 2. Fall back to the legacy v1 key (one-shot migration; we'll
        //    rewrite under the new key on the next persist).
        const legacy = localStorage.getItem(LEGACY_SEQUENCE_KEY_V1);
        if (legacy) {
            const parsed = JSON.parse(legacy) as Partial<SequenceRenameInput>;
            const migrated = migrateSequencePayload(parsed, 1);
            return coerceSequenceInput(migrated);
        }
        return DEFAULT_SEQUENCE_RENAME;
    } catch {
        return DEFAULT_SEQUENCE_RENAME;
    }
}

function persistSequence(input: SequenceRenameInput): void {
    if (typeof localStorage === "undefined") return;
    try {
        const envelope: VersionedSequenceEnvelope = { v: CURRENT_SEQUENCE_VERSION, data: input };
        localStorage.setItem(SEQUENCE_RENAME_STORAGE_KEY, JSON.stringify(envelope));
        // Best-effort cleanup of the legacy key once we've successfully
        // written the new one — keeps user storage tidy across upgrades.
        if (localStorage.getItem(LEGACY_SEQUENCE_KEY_V1) !== null) {
            localStorage.removeItem(LEGACY_SEQUENCE_KEY_V1);
        }
    } catch {
        // Storage may be unavailable (private mode, quota); silently ignore — the
        // dialog still works, it just won't remember last used settings.
    }
}

function clearPersistedSequence(): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.removeItem(SEQUENCE_RENAME_STORAGE_KEY);
        localStorage.removeItem(LEGACY_SEQUENCE_KEY_V1);
    } catch {
        // Best-effort; reset still applies to the in-memory state.
    }
}

export function BulkRenameSequenceDialog(props: BulkRenameSequenceDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, allEvents, onApply } = props;
    const [input, setInput] = useState<SequenceRenameInput>(loadPersistedSequence);

    // Re-hydrate from storage whenever the dialog is reopened so other surfaces
    // that use the same key (or another tab) stay in sync.
    useEffect(() => {
        if (open) setInput(loadPersistedSequence());
    }, [open]);

    // Cross-tab live sync: when another tab writes to the same localStorage key,
    // refresh this dialog's fields immediately so all open Batch Rename dialogs
    // stay in lockstep. The `storage` event only fires in OTHER tabs, never the
    // one that wrote it, so we never clobber the user's in-progress edits here.
    useEffect(() => {
        if (!open) return;
        if (typeof window === "undefined") return;
        const handler = (e: StorageEvent): void => {
            if (e.key !== SEQUENCE_RENAME_STORAGE_KEY) return;
            setInput(loadPersistedSequence());
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, [open]);

    // Persist edits live (debounced via React's batching) so other open tabs
    // receive the `storage` event and mirror the changes immediately. Skipped
    // while the dialog is closed to avoid writing default values on mount.
    useEffect(() => {
        if (!open) return;
        persistSequence(input);
    }, [open, input]);

    // Build the set of "outside" keywords once per (allEvents, selection) change.
    // Selected events are excluded so renaming an event back to its own name
    // doesn't falsely flag a collision.
    const outsideKeywords = useMemo(() => {
        if (!allEvents || allEvents.length === 0) return [];
        const selectedIds = new Set(selectedEvents.map(e => e.Id));
        return allEvents
            .filter(e => !selectedIds.has(e.Id))
            .map(e => e.Keyword);
    }, [allEvents, selectedEvents]);

    const summary = useMemo(
        () => computeSequencePreview(selectedEvents, input, outsideKeywords),
        [selectedEvents, input, outsideKeywords],
    );
    const previewRows = summary.Rows.slice(0, 8);

    const handleApply = (): void => {
        if (!summary.IsValid) return;
        persistSequence(input);
        onApply(input);
        onOpenChange(false);
    };

    // Keyboard shortcuts:
    //   • Enter (in any text/number field)        → submit (handled by <form>).
    //   • Ctrl/Cmd+Enter from anywhere in dialog → submit even when focus
    //     is on a non-form control (e.g. the help button).
    //   • Escape                                  → close (Dialog default).
    const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            handleApply();
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        handleApply();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                data-testid="keyword-events-bulk-rename-dialog"
                onKeyDown={handleDialogKeyDown}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Rename in sequence
                        <TooltipProvider delayDuration={150}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="How {n} and Separator work"
                                        className="text-muted-foreground hover:text-foreground"
                                        data-testid="keyword-events-bulk-rename-help"
                                    >
                                        <HelpCircle className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                                    <p className="mb-1 font-semibold">How sequencing works</p>
                                    <p className="mb-1">
                                        <code>{"{n}"}</code> is replaced with the row number, starting at <em>Start number</em> and zero-padded to <em>Padding</em> digits.
                                    </p>
                                    <p className="mb-1">
                                        Example: base <code>Login {"{n}"}</code>, start <code>1</code>, padding <code>2</code> →
                                        <code> Login 01</code>, <code>Login 02</code>…
                                    </p>
                                    <p>
                                        <strong>Separator</strong> is appended only when the base has no <code>{"{n}"}</code>. e.g. base <code>Step</code> with separator <code>-</code> → <code>Step-01</code>.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </DialogTitle>
                    <DialogDescription>
                        Renames {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"}.
                        Use <code>{"{n}"}</code> in the base to control number placement.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} data-testid="keyword-events-bulk-rename-form">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 space-y-1.5">
                            <Label htmlFor="bulk-rename-base">Base name</Label>
                            <Input
                                id="bulk-rename-base"
                                value={input.Base}
                                onChange={(e) => setInput(s => ({ ...s, Base: e.target.value }))}
                                autoFocus
                                tabIndex={1}
                                data-testid="keyword-events-bulk-rename-base"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bulk-rename-start">Start number</Label>
                            <Input
                                id="bulk-rename-start"
                                type="number"
                                min={0}
                                value={input.Start}
                                tabIndex={2}
                                onChange={(e) => setInput(s => ({ ...s, Start: Math.max(0, Number(e.target.value) || 0) }))}
                                data-testid="keyword-events-bulk-rename-start"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bulk-rename-padding">Padding</Label>
                            <Input
                                id="bulk-rename-padding"
                                type="number"
                                min={1}
                                max={6}
                                value={input.Padding}
                                tabIndex={3}
                                onChange={(e) => setInput(s => ({ ...s, Padding: Math.max(1, Math.min(6, Number(e.target.value) || 1)) }))}
                                data-testid="keyword-events-bulk-rename-padding"
                            />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label htmlFor="bulk-rename-separator" className="flex items-baseline justify-between gap-2">
                                <span>Separator</span>
                                <span className="text-[11px] font-normal text-muted-foreground">
                                    Only applied when <code className="rounded bg-muted px-1 py-0.5">{"{n}"}</code> is not in the base
                                </span>
                            </Label>
                            <Input
                                id="bulk-rename-separator"
                                value={input.Separator}
                                tabIndex={4}
                                onChange={(e) => setInput(s => ({ ...s, Separator: e.target.value }))}
                                data-testid="keyword-events-bulk-rename-separator"
                            />
                            <p className="text-[11px] text-muted-foreground">
                                Example: base <code className="rounded bg-muted px-1 py-0.5">Step</code> + separator <code className="rounded bg-muted px-1 py-0.5">-</code> → <code className="rounded bg-muted px-1 py-0.5">Step-01</code>. Ignored if base already contains <code className="rounded bg-muted px-1 py-0.5">{"{n}"}</code>.
                            </p>
                        </div>
                    </div>

                    <SequenceFormulaExample start={input.Start} padding={input.Padding} />

                    <PreviewSummaryBanner summary={summary} />

                    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
                        <p className="mb-1 font-medium text-muted-foreground">Preview</p>
                        <ul className="space-y-0.5 font-mono" data-testid="keyword-events-bulk-rename-preview">
                            {previewRows.map((row) => {
                                const hasIssue = row.Issues.length > 0;
                                const nextClass = hasIssue
                                    ? "truncate text-destructive font-semibold"
                                    : "truncate text-foreground";
                                return (
                                    <li
                                        key={row.Id}
                                        className="flex items-center gap-2"
                                        data-testid="keyword-events-bulk-rename-preview-row"
                                        data-issues={row.Issues.join(",")}
                                    >
                                        <span className="truncate text-muted-foreground line-through">{row.Old}</span>
                                        <span aria-hidden>→</span>
                                        <span className={nextClass}>{row.Next || "(empty)"}</span>
                                        {row.Issues.map(issue => (
                                            <Badge
                                                key={issue}
                                                variant="destructive"
                                                className="h-4 px-1 text-[10px] uppercase tracking-wide"
                                            >
                                                {issueLabel(issue)}
                                            </Badge>
                                        ))}
                                    </li>
                                );
                            })}
                            {summary.Rows.length > previewRows.length && (
                                <li className="text-muted-foreground">…and {summary.Rows.length - previewRows.length} more</li>
                            )}
                        </ul>
                    </div>
                    <DialogFooter className="mt-3 sm:justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                clearPersistedSequence();
                                setInput(DEFAULT_SEQUENCE_RENAME);
                            }}
                            tabIndex={7}
                            data-testid="keyword-events-bulk-rename-reset"
                        >
                            Reset to defaults
                        </Button>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} tabIndex={6}>Cancel</Button>
                            <Button
                                type="submit"
                                disabled={!summary.IsValid || selectedEvents.length === 0}
                                tabIndex={5}
                                data-testid="keyword-events-bulk-rename-apply"
                            >
                                Rename
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function issueLabel(issue: SequencePreviewIssue): string {
    switch (issue) {
        case "duplicate": return "duplicate";
        case "collision": return "collision";
        case "empty":     return "empty";
        case "too-long":  return "too long";
    }
}

function PreviewSummaryBanner({ summary }: { readonly summary: ReturnType<typeof computeSequencePreview> }): JSX.Element | null {
    if (summary.IsValid) return null;
    const parts: string[] = [];
    if (summary.DuplicateCount > 0) parts.push(`${summary.DuplicateCount} duplicate${summary.DuplicateCount === 1 ? "" : "s"}`);
    if (summary.CollisionCount > 0) parts.push(`${summary.CollisionCount} collide with existing names`);
    if (summary.EmptyCount > 0)     parts.push(`${summary.EmptyCount} empty`);
    if (summary.TooLongCount > 0)   parts.push(`${summary.TooLongCount} too long`);

    const collidingRows = summary.Rows.filter(r => r.CollidesWith.length > 0);

    return (
        <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
            data-testid="keyword-events-bulk-rename-issues"
        >
            <div>Cannot apply: {parts.join(" · ")}.</div>
            {collidingRows.length > 0 && (
                <details
                    className="mt-1.5"
                    data-testid="keyword-events-bulk-rename-collision-details"
                >
                    <summary className="cursor-pointer select-none font-medium underline-offset-2 hover:underline">
                        Show {collidingRows.length} collision{collidingRows.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 pl-3 font-mono">
                        {collidingRows.map(row => (
                            <li
                                key={row.Id}
                                data-testid="keyword-events-bulk-rename-collision-row"
                                data-row-id={row.Id}
                            >
                                <span className="font-semibold">{row.Next || "(empty)"}</span>
                                {" → already used by "}
                                <span>{row.CollidesWith.map(k => `“${k}”`).join(", ")}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}

function SequenceFormulaExample({ start, padding }: { readonly start: number; readonly padding: number }): JSX.Element {
    const example: SequenceRenameInput = {
        Base: "Login {n}",
        Start: start,
        Padding: padding,
        Separator: "",
    };
    const samples = [0, 1, 2].map(i => renderSequenceName(example, i));
    return (
        <p
            className="mt-2 text-[11px] text-muted-foreground"
            data-testid="keyword-events-bulk-rename-formula-example"
        >
            Example with current Start ({start}) &amp; Padding ({padding}):{" "}
            <code className="rounded bg-muted px-1 py-0.5">Login {"{n}"}</code> →{" "}
            <code className="rounded bg-muted px-1 py-0.5">{samples.join(", ")}</code>
        </p>
    );
}
/* ------------------------------------------------------------------ */

interface BulkCategoryDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    /** undefined => clear category. Trimmed, whitespace-collapsed string => set. */
    readonly onApply: (category: string | undefined) => void;
}

function BulkCategoryDialog(props: BulkCategoryDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, onApply } = props;
    const [raw, setRaw] = useState("");
    const existing = useMemo(() => collectCategories(selectedEvents), [selectedEvents]);
    const normalised = normaliseCategory(raw);

    const handleSet = (): void => {
        onApply(normalised);
        setRaw("");
        onOpenChange(false);
    };

    const handleClear = (): void => {
        onApply(undefined);
        setRaw("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) setRaw(""); onOpenChange(o); }}>
            <DialogContent data-testid="keyword-events-bulk-category-dialog">
                <DialogHeader>
                    <DialogTitle>Set category</DialogTitle>
                    <DialogDescription>
                        Assigns a single category to {selectedEvents.length} selected
                        event{selectedEvents.length === 1 ? "" : "s"}. Categories are a
                        primary grouping bucket — use labels for multi-tagging.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="bulk-category-input">Category</Label>
                        <Input
                            id="bulk-category-input"
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            placeholder="e.g. Auth, Smoke, Regression"
                            autoFocus
                            data-testid="keyword-events-bulk-category-input"
                        />
                    </div>
                    {existing.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] text-muted-foreground">
                                Existing categories on selection (click to reuse):
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {existing.map(c => (
                                    <Badge
                                        key={c}
                                        variant="outline"
                                        className="cursor-pointer text-[10px]"
                                        onClick={() => setRaw(c)}
                                    >
                                        {c}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant="outline"
                        onClick={handleClear}
                        data-testid="keyword-events-bulk-category-clear"
                    >
                        Clear category
                    </Button>
                    <Button
                        onClick={handleSet}
                        disabled={normalised === undefined}
                        data-testid="keyword-events-bulk-category-apply"
                    >
                        Set
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Export dialog                                                      */
/* ------------------------------------------------------------------ */

interface BulkExportDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
}

function BulkExportDialog(props: BulkExportDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents } = props;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<KeywordEventsExportProgress | null>(null);

    const handleExport = async (): Promise<void> => {
        setBusy(true);
        setError(null);
        setProgress(null);
        try {
            // Real SQLite DB inside the .zip — same PascalCase + Uid + Meta
            // conventions as `marco-backup.zip`, with a `bundle_kind` marker
            // so a future importer can branch between full backups and
            // partial keyword-event bundles. A JSON snapshot ships alongside
            // for diff-friendly review and JSON-only re-import.
            await downloadKeywordEventsZip(selectedEvents, (p) => {
                setProgress(p);
            });
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="keyword-events-bulk-export-dialog">
                <DialogHeader>
                    <DialogTitle>Export selected as ZIP</DialogTitle>
                    <DialogDescription>
                        Bundles {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"} into a
                        downloadable .zip containing a real SQLite database
                        (<code>keyword-events.db</code>) plus a
                        readable <code>keyword-events.json</code> snapshot —
                        the same export format the app uses elsewhere.
                    </DialogDescription>
                </DialogHeader>
                {progress && (
                    <div
                        className="space-y-1.5"
                        role="status"
                        aria-live="polite"
                        data-testid="keyword-events-bulk-export-progress"
                    >
                        <Progress value={Math.round(progress.fraction * 100)} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{progress.label}…</span>
                            <span className="font-mono">
                                {Math.round(progress.fraction * 100)}%
                            </span>
                        </div>
                    </div>
                )}
                {error && (
                    <p className="text-xs text-destructive" role="alert">{error}</p>
                )}
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
                    <Button
                        onClick={() => { void handleExport(); }}
                        disabled={busy || selectedEvents.length === 0}
                        data-testid="keyword-events-bulk-export-apply"
                    >
                        {busy ? (progress?.label ?? "Building") + "…" : "Download .zip"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Delete confirm dialog                                              */
/* ------------------------------------------------------------------ */

interface BulkDeleteConfirmDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly onConfirm: () => void;
}

function BulkDeleteConfirmDialog(props: BulkDeleteConfirmDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, onConfirm } = props;
    const count = selectedEvents.length;
    const previewRows = selectedEvents.slice(0, 5);
    const remainder = Math.max(0, count - previewRows.length);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-md"
                onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        onConfirm();
                    }
                }}
                data-testid="keyword-events-bulk-delete-dialog"
            >
                <DialogHeader>
                    <DialogTitle>
                        Delete {count} event{count === 1 ? "" : "s"}?
                    </DialogTitle>
                    <DialogDescription>
                        This permanently removes the selected keyword event
                        {count === 1 ? "" : "s"} and all of their steps. This
                        action cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded border border-border/60 bg-muted/30 p-2 text-xs">
                    <ul className="space-y-0.5 font-mono">
                        {previewRows.map((ev) => (
                            <li
                                key={ev.Id}
                                data-testid={`keyword-events-bulk-delete-row-${ev.Id}`}
                                className="truncate"
                            >
                                {ev.Keyword || <span className="italic opacity-70">(unnamed)</span>}
                            </li>
                        ))}
                        {remainder > 0 && (
                            <li className="italic text-muted-foreground">
                                … and {remainder} more
                            </li>
                        )}
                    </ul>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        data-testid="keyword-events-bulk-delete-cancel"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={count === 0}
                        data-testid="keyword-events-bulk-delete-confirm"
                    >
                        Delete {count} event{count === 1 ? "" : "s"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/*  Import dialog                                                      */
/* ------------------------------------------------------------------ */

interface BulkImportDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly selectedEvents: ReadonlyArray<KeywordEvent>;
    readonly onApply: (plan: ImportMatchPlan) => void;
}

// eslint-disable-next-line max-lines-per-function -- single dialog owns picker + dry-run + apply
function BulkImportDialog(props: BulkImportDialogProps): JSX.Element {
    const { open, onOpenChange, selectedEvents, onApply } = props;
    const [bundle, setBundle] = useState<KeywordEventsImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [filename, setFilename] = useState<string>("");
    const [strictUidOnly, setStrictUidOnly] = useState(false);

    useEffect(() => {
        if (!open) {
            setBundle(null);
            setError(null);
            setBusy(false);
            setFilename("");
            setStrictUidOnly(false);
        }
    }, [open]);

    const plan = useMemo<ImportMatchPlan | null>(
        () => (bundle ? planImportMatches(selectedEvents, bundle.events, { strictUidOnly }) : null),
        [bundle, selectedEvents, strictUidOnly],
    );

    const handleFile = async (file: File | undefined): Promise<void> => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const result = await readKeywordEventsZip(file);
            setBundle(result);
            setFilename(file.name);
        } catch (err) {
            setBundle(null);
            setError(err instanceof Error ? err.message : "Failed to read ZIP");
        } finally {
            setBusy(false);
        }
    };

    const handleApply = (): void => {
        if (!plan) return;
        onApply(plan);
        onOpenChange(false);
    };

    const matchCount = plan?.matches.length ?? 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl"
                data-testid="keyword-events-bulk-import-dialog"
            >
                <DialogHeader>
                    <DialogTitle>Update selected from ZIP</DialogTitle>
                    <DialogDescription>
                        Reads <code>keyword-events.db</code> from a ZIP previously
                        produced by Export and overlays each imported row onto the
                        matching event in your current selection
                        ({selectedEvents.length} selected).{" "}
                        {strictUidOnly
                            ? "Strict mode: matches by Uid only."
                            : "Matches by Uid first, then by Keyword (case-insensitive)."}
                    </DialogDescription>
                </DialogHeader>

                {selectedEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Select at least one event before importing.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label htmlFor="kw-import-file" className="text-xs">
                                ZIP file
                            </Label>
                            <Input
                                id="kw-import-file"
                                type="file"
                                accept=".zip,application/zip"
                                disabled={busy}
                                onChange={(e) => {
                                    void handleFile(e.target.files?.[0]);
                                }}
                                data-testid="keyword-events-bulk-import-file"
                            />
                            {filename && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                    {filename}
                                </p>
                            )}
                        </div>

                        <div className="flex items-start gap-2">
                            <Checkbox
                                id="kw-import-strict-uid"
                                checked={strictUidOnly}
                                onCheckedChange={(v) => setStrictUidOnly(v === true)}
                                disabled={busy}
                                data-testid="keyword-events-bulk-import-strict-uid"
                            />
                            <div className="grid gap-0.5 leading-tight">
                                <Label
                                    htmlFor="kw-import-strict-uid"
                                    className="text-xs cursor-pointer"
                                >
                                    Match by Uid only (no keyword fallback)
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Skip rows whose Uid isn&apos;t in your selection instead of
                                    falling back to Keyword.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <p
                                className="text-xs text-destructive"
                                role="alert"
                                data-testid="keyword-events-bulk-import-error"
                            >
                                {error}
                            </p>
                        )}

                        {plan && (
                            <div
                                className="rounded border border-border/60 bg-muted/30 p-2 text-xs space-y-1"
                                data-testid="keyword-events-bulk-import-summary"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Will update</span>
                                    <Badge variant="secondary">{matchCount}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Imported rows with no match</span>
                                    <Badge variant="outline">{plan.unmatchedImports.length}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Selected rows left untouched</span>
                                    <Badge variant="outline">{plan.unmatchedSelected.length}</Badge>
                                </div>
                                {bundle?.exportedAt && (
                                    <p className="text-[11px] text-muted-foreground pt-1">
                                        Bundle exported {bundle.exportedAt}
                                    </p>
                                )}
                            </div>
                        )}

                        {plan && plan.matches.length > 0 && (
                            <div
                                className="rounded border border-border/60 bg-background/40 max-h-72 overflow-y-auto"
                                data-testid="keyword-events-bulk-import-diff"
                            >
                                <div className="sticky top-0 bg-muted/60 backdrop-blur px-2 py-1 text-[11px] font-medium text-muted-foreground border-b border-border/60">
                                    Field-by-field preview
                                </div>
                                <ul className="divide-y divide-border/40">
                                    {plan.matches.map((m) => {
                                        const diffs = diffMatchedFields(m.target, m.source);
                                        return (
                                            <li key={m.target.Id} className="p-2 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-medium truncate" title={m.target.Keyword}>
                                                        {m.target.Keyword || <em className="text-muted-foreground">(no keyword)</em>}
                                                    </span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Badge variant="outline" className="text-[10px]">
                                                            by {m.matchedBy}
                                                        </Badge>
                                                        <Badge
                                                            variant={diffs.length === 0 ? "outline" : "secondary"}
                                                            className="text-[10px]"
                                                        >
                                                            {diffs.length === 0 ? "no changes" : `${diffs.length} field${diffs.length === 1 ? "" : "s"}`}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                {diffs.length > 0 && (
                                                    <table className="w-full table-fixed text-[11px] border-collapse">
                                                        <thead>
                                                            <tr className="text-muted-foreground">
                                                                <th className="text-left font-normal w-28 pr-2 pb-1">Field</th>
                                                                <th className="text-left font-normal pr-2 pb-1">Before</th>
                                                                <th className="text-left font-normal pl-2 pb-1 border-l border-border/40">After</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {diffs.map((d) => (
                                                                <tr key={d.field} className="align-top">
                                                                    <td className="pr-2 py-0.5 font-mono text-muted-foreground">{d.field}</td>
                                                                    <td
                                                                        className="pr-2 py-0.5 text-destructive/90 break-all whitespace-pre-wrap line-clamp-3"
                                                                        title={d.before}
                                                                    >
                                                                        {d.before}
                                                                    </td>
                                                                    <td
                                                                        className="pl-2 py-0.5 text-emerald-400 break-all whitespace-pre-wrap line-clamp-3 border-l border-border/40"
                                                                        title={d.after}
                                                                    >
                                                                        {d.after}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={busy || matchCount === 0}
                        data-testid="keyword-events-bulk-import-apply"
                    >
                        {busy
                            ? "Reading…"
                            : `Update ${matchCount} event${matchCount === 1 ? "" : "s"}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
