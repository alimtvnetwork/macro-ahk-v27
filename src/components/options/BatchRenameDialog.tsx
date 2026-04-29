/**
 * Marco Extension — Batch Rename Dialog
 *
 * Lets the user rename every selected step group at once via one of
 * four composable transforms:
 *
 *   • **Find & replace** — case-sensitive substring swap
 *   • **Add prefix**     — prepend a fixed string
 *   • **Add suffix**     — append a fixed string
 *   • **Sequence**       — rename every selected row to "{Base}{N}" with
 *                          a configurable start number and zero-padding
 *                          width. If the Base contains the literal token
 *                          `{n}` the number is substituted there; otherwise
 *                          it is appended after a separator.
 *
 * The dialog renders a live preview row for every selected group:
 * "OldName  →  NewName", with badges for `unchanged`, `invalid`
 * (validation failure), and `conflict` (would clash with a sibling
 * that's NOT being renamed in the same batch). The Apply button is
 * disabled until at least one row is changed AND zero rows are
 * invalid/conflicting.
 *
 * On Apply the caller receives a list of `{ Id, OldName, NewName }`
 * tuples to commit + a chance to push an undo toast. The dialog itself
 * never touches the database.
 */

import { useMemo, useState } from "react";
import { ArrowRight, AlertTriangle, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";

import type { StepGroupRow } from "@/background/recorder/step-library/db";
import {
    STEP_GROUP_NAME_MAX_LEN,
    validateStepGroupName,
} from "./step-group-name-validator";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface BatchRenameChange {
    readonly Id: number;
    readonly OldName: string;
    readonly NewName: string;
}

export interface BatchRenameDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    /**
     * The groups the user has selected, in any order. Each row is
     * shown in the preview — even unselected siblings are excluded.
     */
    readonly targets: ReadonlyArray<StepGroupRow>;
    /**
     * Every group in the project (used to compute sibling-name
     * conflicts against rows NOT in `targets`). Pass the full
     * `lib.Groups` array — the dialog filters internally.
     */
    readonly allGroups: ReadonlyArray<StepGroupRow>;
    /** Fired with the final {Id, Old, New} list when the user confirms. */
    readonly onApply: (changes: ReadonlyArray<BatchRenameChange>) => void;
}

/* ------------------------------------------------------------------ */
/*  Transforms                                                         */
/* ------------------------------------------------------------------ */

type Mode = "replace" | "prefix" | "suffix" | "sequence";

interface TransformInput {
    readonly Mode: Mode;
    readonly Find: string;
    readonly Replace: string;
    readonly Prefix: string;
    readonly Suffix: string;
    /** Sequence base name. May contain `{n}` as the substitution token. */
    readonly SequenceBase: string;
    /** Sequence start number (defaults to 1). Negative values clamp to 0. */
    readonly SequenceStart: number;
    /** Zero-padding width (1 → "1", 2 → "01", 3 → "001"). Clamped to 1..6. */
    readonly SequencePadding: number;
    /** Separator between base and number when `{n}` is absent. */
    readonly SequenceSeparator: string;
}

const SEQUENCE_TOKEN = "{n}";

function formatSequenceNumber(n: number, padding: number): string {
    const width = Math.max(1, Math.min(6, Math.floor(padding)));
    return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

/** Builds the new name for the `index`-th selected target (0-based). */
function applySequence(t: TransformInput, index: number): string {
    const n = formatSequenceNumber(t.SequenceStart + index, t.SequencePadding);
    if (t.SequenceBase.includes(SEQUENCE_TOKEN)) {
        return t.SequenceBase.split(SEQUENCE_TOKEN).join(n);
    }
    const base = t.SequenceBase.trim();
    if (base.length === 0) return n;
    return `${base}${t.SequenceSeparator}${n}`;
}

function applyTransform(name: string, t: TransformInput, index: number): string {
    switch (t.Mode) {
        case "replace":
            // Empty Find = identity. Splitting on empty string would
            // explode the name into per-character pieces.
            if (t.Find === "") return name;
            return name.split(t.Find).join(t.Replace);
        case "prefix":
            return `${t.Prefix}${name}`;
        case "suffix":
            return `${name}${t.Suffix}`;
        case "sequence":
            return applySequence(t, index);
    }
}

/* ------------------------------------------------------------------ */
/*  Per-row preview                                                    */
/* ------------------------------------------------------------------ */

interface PreviewRow {
    readonly Id: number;
    readonly OldName: string;
    readonly NewName: string;
    readonly Changed: boolean;
    /** `null` when fine, otherwise the user-facing reason. */
    readonly Issue: string | null;
}

function buildPreview(
    targets: ReadonlyArray<StepGroupRow>,
    allGroups: ReadonlyArray<StepGroupRow>,
    transform: TransformInput,
): ReadonlyArray<PreviewRow> {
    const targetIds = new Set(targets.map((g) => g.StepGroupId));

    // Sibling names that are NOT being renamed, indexed by parent.
    // Renames within the batch are validated separately below so two
    // selected siblings swapping into each other don't trip the
    // single-name validator.
    const externalSiblingsByParent = new Map<number | null, string[]>();
    for (const g of allGroups) {
        if (targetIds.has(g.StepGroupId)) continue;
        const key = g.ParentStepGroupId ?? null;
        const arr = externalSiblingsByParent.get(key) ?? [];
        arr.push(g.Name);
        externalSiblingsByParent.set(key, arr);
    }

    // Track new names *within* the batch per parent — clashes inside
    // the batch are also surfaced (two groups both renamed to "Foo").
    const newNamesByParent = new Map<number | null, Map<string, number>>();

    const rows: PreviewRow[] = targets.map((g, i) => {
        const newName = applyTransform(g.Name, transform, i);
        const trimmed = newName.trim();
        const parent = g.ParentStepGroupId ?? null;
        const externals = externalSiblingsByParent.get(parent) ?? [];
        const baseIssue = validateStepGroupName(newName, externals);
        const issue: string | null = (() => {
            if (newName === g.Name) return null; // unchanged is fine
            return baseIssue;
        })();

        // Record for intra-batch clash detection (post-trim, lowered).
        const slot = newNamesByParent.get(parent) ?? new Map<string, number>();
        const key = trimmed.toLowerCase();
        slot.set(key, (slot.get(key) ?? 0) + 1);
        newNamesByParent.set(parent, slot);

        return {
            Id: g.StepGroupId,
            OldName: g.Name,
            NewName: newName,
            Changed: newName !== g.Name,
            Issue: issue,
        };
    });

    // Second pass: flag intra-batch duplicates.
    return rows.map((r) => {
        if (r.Issue !== null) return r;
        if (!r.Changed) return r;
        const target = targets.find((g) => g.StepGroupId === r.Id);
        if (target === undefined) return r;
        const parent = target.ParentStepGroupId ?? null;
        const slot = newNamesByParent.get(parent);
        const count = slot?.get(r.NewName.trim().toLowerCase()) ?? 0;
        if (count > 1) {
            return { ...r, Issue: "Two selected groups would share this name." };
        }
        return r;
    });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BatchRenameDialog({
    open,
    onOpenChange,
    targets,
    allGroups,
    onApply,
}: BatchRenameDialogProps) {
    const [mode, setMode] = useState<Mode>("replace");
    const [find, setFind] = useState("");
    const [replace, setReplace] = useState("");
    const [prefix, setPrefix] = useState("");
    const [suffix, setSuffix] = useState("");
    const [sequenceBase, setSequenceBase] = useState("");
    const [sequenceStart, setSequenceStart] = useState(1);
    const [sequencePadding, setSequencePadding] = useState(1);
    const [sequenceSeparator, setSequenceSeparator] = useState(" ");

    const transform: TransformInput = {
        Mode: mode,
        Find: find,
        Replace: replace,
        Prefix: prefix,
        Suffix: suffix,
        SequenceBase: sequenceBase,
        SequenceStart: sequenceStart,
        SequencePadding: sequencePadding,
        SequenceSeparator: sequenceSeparator,
    };
    const preview = useMemo(
        () => buildPreview(targets, allGroups, transform),
        // `transform` is stable enough — recompute whenever any input changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targets, allGroups, mode, find, replace, prefix, suffix,
         sequenceBase, sequenceStart, sequencePadding, sequenceSeparator],
    );

    const changedCount = preview.filter((r) => r.Changed).length;
    const issueCount = preview.filter((r) => r.Issue !== null).length;
    const canApply = changedCount > 0 && issueCount === 0;

    const handleApply = () => {
        if (!canApply) return;
        const changes: BatchRenameChange[] = preview
            .filter((r) => r.Changed)
            .map((r) => ({ Id: r.Id, OldName: r.OldName, NewName: r.NewName.trim() }));
        onApply(changes);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-4 w-4" /> Batch rename
                    </DialogTitle>
                    <DialogDescription>
                        Renames every selected group using the chosen transform.
                        Preview the result below — Apply is blocked until all
                        conflicts are resolved.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="replace">Find &amp; replace</TabsTrigger>
                        <TabsTrigger value="prefix">Add prefix</TabsTrigger>
                        <TabsTrigger value="suffix">Add suffix</TabsTrigger>
                        <TabsTrigger value="sequence">Sequence</TabsTrigger>
                    </TabsList>

                    <TabsContent value="replace" className="space-y-2 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label htmlFor="batch-find" className="text-xs">Find</Label>
                                <Input
                                    id="batch-find"
                                    value={find}
                                    onChange={(e) => setFind(e.target.value)}
                                    placeholder="e.g. Old"
                                    maxLength={STEP_GROUP_NAME_MAX_LEN}
                                />
                            </div>
                            <div>
                                <Label htmlFor="batch-replace" className="text-xs">Replace with</Label>
                                <Input
                                    id="batch-replace"
                                    value={replace}
                                    onChange={(e) => setReplace(e.target.value)}
                                    placeholder="e.g. New"
                                    maxLength={STEP_GROUP_NAME_MAX_LEN}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Case-sensitive. Empty Find leaves names unchanged.
                        </p>
                    </TabsContent>

                    <TabsContent value="prefix" className="space-y-2 pt-3">
                        <Label htmlFor="batch-prefix" className="text-xs">Prefix</Label>
                        <Input
                            id="batch-prefix"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            placeholder="e.g. [archived] "
                            maxLength={STEP_GROUP_NAME_MAX_LEN}
                        />
                    </TabsContent>

                    <TabsContent value="suffix" className="space-y-2 pt-3">
                        <Label htmlFor="batch-suffix" className="text-xs">Suffix</Label>
                        <Input
                            id="batch-suffix"
                            value={suffix}
                            onChange={(e) => setSuffix(e.target.value)}
                            placeholder="e.g.  (v2)"
                            maxLength={STEP_GROUP_NAME_MAX_LEN}
                        />
                    </TabsContent>

                    <TabsContent value="sequence" className="space-y-2 pt-3">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                            <div>
                                <Label htmlFor="batch-seq-base" className="text-xs">
                                    Base name
                                </Label>
                                <Input
                                    id="batch-seq-base"
                                    value={sequenceBase}
                                    onChange={(e) => setSequenceBase(e.target.value)}
                                    placeholder="e.g. Login {n}"
                                    maxLength={STEP_GROUP_NAME_MAX_LEN}
                                />
                            </div>
                            <div className="w-20">
                                <Label htmlFor="batch-seq-start" className="text-xs">Start</Label>
                                <Input
                                    id="batch-seq-start"
                                    type="number"
                                    min={0}
                                    value={sequenceStart}
                                    onChange={(e) => setSequenceStart(Number(e.target.value) || 0)}
                                />
                            </div>
                            <div className="w-20">
                                <Label htmlFor="batch-seq-padding" className="text-xs">Padding</Label>
                                <Input
                                    id="batch-seq-padding"
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={sequencePadding}
                                    onChange={(e) =>
                                        setSequencePadding(
                                            Math.max(1, Math.min(6, Number(e.target.value) || 1)),
                                        )
                                    }
                                />
                            </div>
                            <div className="w-16">
                                <Label htmlFor="batch-seq-sep" className="text-xs">Sep</Label>
                                <Input
                                    id="batch-seq-sep"
                                    value={sequenceSeparator}
                                    onChange={(e) => setSequenceSeparator(e.target.value)}
                                    placeholder=" "
                                    maxLength={4}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Use <code className="rounded bg-muted px-1">{"{n}"}</code> in the
                            base name to control where the number goes
                            (e.g. <code className="rounded bg-muted px-1">Step {"{n}"} — login</code>).
                            Without it, the number is appended after the separator.
                            Padding 2 → <code className="rounded bg-muted px-1">01</code>,
                            3 → <code className="rounded bg-muted px-1">001</code>.
                        </p>
                    </TabsContent>
                </Tabs>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        {changedCount} of {preview.length} group(s) will change
                    </span>
                    {issueCount > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {issueCount} conflict{issueCount === 1 ? "" : "s"}
                        </span>
                    )}
                </div>

                <ScrollArea className="h-64 rounded border">
                    <ul className="divide-y text-sm">
                        {preview.map((r) => (
                            <li
                                key={r.Id}
                                className={[
                                    "flex items-center gap-2 px-3 py-2",
                                    r.Issue !== null ? "bg-destructive/5" : "",
                                ].join(" ")}
                            >
                                <span className="min-w-0 flex-1 truncate text-muted-foreground line-through decoration-muted-foreground/40">
                                    {r.OldName}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                <span
                                    className={[
                                        "min-w-0 flex-1 truncate font-medium",
                                        r.Issue !== null
                                            ? "text-destructive"
                                            : r.Changed
                                                ? "text-foreground"
                                                : "text-muted-foreground",
                                    ].join(" ")}
                                    title={r.NewName}
                                >
                                    {r.NewName}
                                </span>
                                {!r.Changed && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                        Unchanged
                                    </span>
                                )}
                                {r.Issue !== null && (
                                    <span
                                        className="max-w-[18ch] truncate text-[10px] text-destructive"
                                        title={r.Issue}
                                    >
                                        {r.Issue}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleApply} disabled={!canApply}>
                        Rename {changedCount} group{changedCount === 1 ? "" : "s"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
