/**
 * GroupInputsDialog
 *
 * Lets the user paste or upload a JSON object and apply it as the
 * input variable bag for one StepGroup. The bag is consumed by the
 * recorder/runner at execution time to substitute `{{Variable}}`
 * placeholders inside step payloads.
 *
 * Three sources are supported:
 *   1. Direct paste into the textarea.
 *   2. Drag/drop or file-picker upload of a `.json` file (≤ 1 MB so
 *      we never accidentally hang the UI thread on huge files —
 *      input bags are intentionally tiny).
 *   3. "Load current" prefills the textarea with the bag already
 *      saved against the group, so the user can edit-in-place
 *      without losing context.
 *
 * Validation runs on every keystroke (cheap — JSON.parse on small
 * input). The Apply button is disabled until the textarea contains a
 * valid JSON **object** — see `parseGroupInputJson`.
 *
 * Presentation only: this component never performs network calls or
 * runs steps. Applying a bag is a localStorage write inside
 * `useStepLibrary.setGroupInput`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import {
    parseGroupInputJson,
    type GroupInputBag,
} from "@/background/recorder/step-library/group-inputs";
import { Download, FileJson, Trash2, Upload } from "lucide-react";

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB — input bags are tiny.

export interface GroupInputsDialogProps {
    readonly open: boolean;
    /** Null when no group is selected — caller should keep the dialog closed in that case. */
    readonly groupName: string | null;
    readonly groupId: number | null;
    /** Existing bag for this group, or null if none has been applied yet. */
    readonly currentBag: GroupInputBag | null;
    readonly onOpenChange: (open: boolean) => void;
    readonly onApply: (groupId: number, bag: GroupInputBag) => void;
    readonly onClear: (groupId: number) => void;
}

export function GroupInputsDialog(props: GroupInputsDialogProps): JSX.Element {
    const { open, groupName, groupId, currentBag, onOpenChange, onApply, onClear } = props;
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState("");
    const [dragOver, setDragOver] = useState(false);

    // Reset the textarea to the current bag every time the dialog
    // opens. We deliberately do NOT live-sync `currentBag` while the
    // dialog is already open — the user might be editing.
    useEffect(() => {
        if (open) {
            setText(currentBag === null ? "" : JSON.stringify(currentBag, null, 2));
            setDragOver(false);
        }
    }, [open, currentBag]);

    const parseResult = useMemo(() => parseGroupInputJson(text), [text]);

    const handleLoadCurrent = useCallback(() => {
        if (currentBag === null) {
            setText("");
            return;
        }
        setText(JSON.stringify(currentBag, null, 2));
    }, [currentBag]);

    const handleFile = useCallback(async (file: File) => {
        if (file.size > MAX_FILE_BYTES) {
            toast({
                variant: "destructive",
                title: "File too large",
                description: `Input bag files must be ≤ 1 MB (got ${formatBytes(file.size)}).`,
            });
            return;
        }
        try {
            const txt = await file.text();
            setText(txt);
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Could not read file",
                description: err instanceof Error ? err.message : String(err),
            });
        }
    }, [toast]);

    const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        // Reset the input so picking the SAME file again still triggers change.
        e.target.value = "";
        if (file !== null) void handleFile(file);
    }, [handleFile]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0] ?? null;
        if (file !== null) void handleFile(file);
    }, [handleFile]);

    const handleApply = useCallback(() => {
        if (groupId === null) return;
        if (!parseResult.Ok) return;
        onApply(groupId, parseResult.Value);
        toast({
            title: "Input data applied",
            description: `Bound ${Object.keys(parseResult.Value).length} variable(s) to "${groupName ?? "(unknown)"}".`,
        });
        onOpenChange(false);
    }, [groupId, groupName, parseResult, onApply, onOpenChange, toast]);

    const handleClear = useCallback(() => {
        if (groupId === null) return;
        onClear(groupId);
        setText("");
        toast({
            title: "Input data cleared",
            description: `Removed input bag from "${groupName ?? "(unknown)"}".`,
        });
        onOpenChange(false);
    }, [groupId, groupName, onClear, onOpenChange, toast]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileJson className="h-5 w-5" /> Apply input data
                    </DialogTitle>
                    <DialogDescription>
                        Paste or upload a JSON object of variables for{" "}
                        <span className="font-medium text-foreground">
                            {groupName ?? "(no group selected)"}
                        </span>
                        . Values are substituted into <code className="rounded bg-muted px-1">{"{{Placeholder}}"}</code>{" "}
                        tokens at recording / execution time.
                    </DialogDescription>
                </DialogHeader>

                {/* Drag-and-drop / picker zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={[
                        "flex items-center justify-between gap-3 rounded border-2 border-dashed px-3 py-2 text-xs transition-colors",
                        dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
                    ].join(" ")}
                >
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span>Drop a <code>.json</code> file here, or</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Choose file
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLoadCurrent}
                            disabled={currentBag === null}
                            title={currentBag === null ? "No bag is currently applied" : "Reload the saved bag"}
                        >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Load current
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={handleFilePick}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={'{\n  "Email": "you@example.com",\n  "Plan": "pro"\n}'}
                        spellCheck={false}
                        className="h-56 font-mono text-xs"
                        aria-label="JSON input data"
                    />
                    <div className="min-h-[1.25rem] text-xs">
                        {text.trim() === "" ? (
                            <span className="text-muted-foreground">
                                Tip: keys must match the placeholders in your steps (case-sensitive).
                            </span>
                        ) : parseResult.Ok ? (
                            <span className="text-emerald-500">
                                ✓ Valid — {Object.keys(parseResult.Value).length} variable(s) ready to apply.
                            </span>
                        ) : (
                            <span className="text-destructive">{parseResult.Reason}</span>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleClear}
                        disabled={groupId === null || currentBag === null}
                        className="mr-auto text-destructive hover:text-destructive"
                    >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Clear bag
                    </Button>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={groupId === null || !parseResult.Ok}
                    >
                        Apply
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
