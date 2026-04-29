/**
 * CsvInputDialog
 *
 * Upload (or paste) a CSV file, configure how each column maps to a
 * variable in the StepGroup's input bag, pick which row to apply, and
 * commit. The resulting bag is identical in shape to what the JSON
 * dialog produces — both feed the same `setGroupInput` call.
 *
 * Constraints (recorded in mem://workflow/no-questions-mode):
 *   - File ≤ 5 MB / ≤ 10 000 rows, fully in memory.
 *   - Pure presentation; the runner picks up the bag from
 *     `useStepLibrary.GroupInputs`.
 *
 * Why single-row apply: the input bag is a flat object keyed by
 * variable name — semantically only one row can be "the" current
 * input. Batch / iterate-rows mode is a separate workstream.
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import {
    parseCsv,
    type CsvParseSuccess,
    MAX_BYTES,
} from "@/background/recorder/step-library/csv-parse";
import {
    buildBagFromRow,
    suggestVariableName,
    validateVariableName,
    type CoercionKind,
    type ColumnMapping,
} from "@/background/recorder/step-library/csv-mapping";
import type { GroupInputBag } from "@/background/recorder/step-library/group-inputs";

import { ChevronLeft, ChevronRight, FileSpreadsheet, Upload } from "lucide-react";

const COERCION_OPTIONS: ReadonlyArray<{ value: CoercionKind; label: string; hint: string }> = [
    { value: "auto",    label: "Auto",    hint: "Numbers, true/false, blank → empty string" },
    { value: "string",  label: "String",  hint: "Always treat as text" },
    { value: "number",  label: "Number",  hint: "Reject non-numeric cells" },
    { value: "boolean", label: "Boolean", hint: "true/false/yes/no/0/1" },
    { value: "json",    label: "JSON",    hint: "Parse cell as JSON" },
];

export interface CsvInputDialogProps {
    readonly open: boolean;
    readonly groupName: string | null;
    readonly groupId: number | null;
    readonly onOpenChange: (open: boolean) => void;
    readonly onApply: (groupId: number, bag: GroupInputBag) => void;
}

interface ParsedState {
    readonly Csv: CsvParseSuccess;
    readonly FileName: string | null;
}

export function CsvInputDialog(props: CsvInputDialogProps): JSX.Element {
    const { open, groupName, groupId, onOpenChange, onApply } = props;
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [pasted, setPasted] = useState("");
    const [parsed, setParsed] = useState<ParsedState | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [mappings, setMappings] = useState<ReadonlyArray<ColumnMapping>>([]);
    const [rowIndex, setRowIndex] = useState(0);
    const [dragOver, setDragOver] = useState(false);

    // Reset whenever the dialog opens.
    useEffect(() => {
        if (open) {
            setPasted("");
            setParsed(null);
            setParseError(null);
            setMappings([]);
            setRowIndex(0);
            setDragOver(false);
        }
    }, [open]);

    const acceptText = useCallback((text: string, fileName: string | null) => {
        const result = parseCsv(text);
        if (!result.Ok) {
            setParsed(null);
            setMappings([]);
            setParseError(result.Reason);
            return;
        }
        setParseError(null);
        setParsed({ Csv: result, FileName: fileName });
        // Default mapping: map every column to its sanitised header,
        // auto-coerce, dedupe collisions by suffixing.
        const seen = new Set<string>();
        const next: ColumnMapping[] = result.Headers.map((h) => {
            let v = suggestVariableName(h);
            let i = 2;
            while (seen.has(v)) v = `${suggestVariableName(h)}_${i++}`;
            seen.add(v);
            return { Column: h, Variable: v, Coerce: "auto" as CoercionKind };
        });
        setMappings(next);
        setRowIndex(0);
    }, []);

    const handleFile = useCallback(async (file: File) => {
        if (file.size > MAX_BYTES) {
            toast({
                variant: "destructive",
                title: "File too large",
                description: "CSV files must be 5 MB or smaller.",
            });
            return;
        }
        try {
            const text = await file.text();
            setPasted(""); // Pasted-text takes a back seat once we have a file.
            acceptText(text, file.name);
        } catch (err) {
            toast({
                variant: "destructive",
                title: "Could not read file",
                description: err instanceof Error ? err.message : String(err),
            });
        }
    }, [acceptText, toast]);

    const handleParseClick = useCallback(() => {
        acceptText(pasted, null);
    }, [pasted, acceptText]);

    const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = "";
        if (file !== null) void handleFile(file);
    }, [handleFile]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0] ?? null;
        if (file !== null) void handleFile(file);
    }, [handleFile]);

    const updateMapping = useCallback((column: string, patch: Partial<Omit<ColumnMapping, "Column">>) => {
        setMappings((prev) => prev.map((m) => (m.Column === column ? { ...m, ...patch } : m)));
    }, []);

    const buildResult = useMemo(() => {
        if (parsed === null) return null;
        const row = parsed.Csv.Rows[rowIndex] ?? null;
        if (row === null) return null;
        return buildBagFromRow({
            Headers: parsed.Csv.Headers,
            Row: row,
            Mappings: mappings,
        });
    }, [parsed, mappings, rowIndex]);

    const handleApply = useCallback(() => {
        if (groupId === null || buildResult === null || !buildResult.Ok) return;
        onApply(groupId, buildResult.Bag);
        toast({
            title: "CSV input applied",
            description: `Bound ${buildResult.UsedColumns} variable(s) from row ${rowIndex + 1} to "${groupName ?? "(unknown)"}".`,
        });
        onOpenChange(false);
    }, [groupId, groupName, buildResult, rowIndex, onApply, onOpenChange, toast]);

    const totalRows = parsed?.Csv.Rows.length ?? 0;
    const canStepBack = rowIndex > 0;
    const canStepFwd  = rowIndex < totalRows - 1;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" /> Import CSV input
                    </DialogTitle>
                    <DialogDescription>
                        Upload a CSV, choose how each column maps to a variable, then apply one row to{" "}
                        <span className="font-medium text-foreground">{groupName ?? "(no group selected)"}</span>.
                        Limits: 5&nbsp;MB / 10&nbsp;000 rows, in memory.
                    </DialogDescription>
                </DialogHeader>

                {/* ------- File / paste source ------- */}
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
                        <span>
                            {parsed?.FileName != null
                                ? `Loaded: ${parsed.FileName}`
                                : "Drop a .csv file here, or paste below"}
                        </span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Choose file
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv,application/csv,text/plain"
                        className="hidden"
                        onChange={handleFilePick}
                    />
                </div>

                {parsed === null && (
                    <div className="space-y-2">
                        <Textarea
                            value={pasted}
                            onChange={(e) => setPasted(e.target.value)}
                            placeholder={"Email,Age,Active\nyou@example.com,42,true"}
                            spellCheck={false}
                            className="h-32 font-mono text-xs"
                            aria-label="Paste CSV contents"
                        />
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-destructive">
                                {parseError !== null ? parseError : ""}
                            </div>
                            <Button
                                size="sm"
                                onClick={handleParseClick}
                                disabled={pasted.trim() === ""}
                            >
                                Parse pasted CSV
                            </Button>
                        </div>
                    </div>
                )}

                {/* ------- Mapping table + row navigator ------- */}
                {parsed !== null && (
                    <div className="space-y-3">
                        {parsed.Csv.Warnings.length > 0 && (
                            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                                <div className="font-medium text-amber-600 dark:text-amber-300">Heads up</div>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                                    {parsed.Csv.Warnings.map((w, i) => <li key={i}>{w}</li>)}
                                </ul>
                            </div>
                        )}

                        <div className="flex items-center justify-between rounded border bg-muted/30 px-3 py-2 text-xs">
                            <div className="text-muted-foreground">
                                <span className="font-medium text-foreground">{parsed.Csv.Headers.length}</span> column(s),{" "}
                                <span className="font-medium text-foreground">{totalRows}</span> data row(s),{" "}
                                delimiter{" "}
                                <code className="rounded bg-muted px-1">{parsed.Csv.Delimiter}</code>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    disabled={!canStepBack}
                                    onClick={() => setRowIndex((i) => Math.max(0, i - 1))}
                                    aria-label="Previous row"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span>
                                    Row{" "}
                                    <Input
                                        type="number"
                                        value={rowIndex + 1}
                                        min={1}
                                        max={Math.max(1, totalRows)}
                                        onChange={(e) => {
                                            const next = Math.max(1, Math.min(totalRows, Number(e.target.value) || 1));
                                            setRowIndex(next - 1);
                                        }}
                                        className="inline-block h-7 w-16 text-center"
                                    />
                                    {" / "}{totalRows}
                                </span>
                                <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    disabled={!canStepFwd}
                                    onClick={() => setRowIndex((i) => Math.min(totalRows - 1, i + 1))}
                                    aria-label="Next row"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="h-72 rounded border">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-card">
                                    <tr className="border-b">
                                        <th className="px-2 py-2 text-left font-medium">Column</th>
                                        <th className="px-2 py-2 text-left font-medium">Cell value (row {rowIndex + 1})</th>
                                        <th className="px-2 py-2 text-left font-medium">Variable</th>
                                        <th className="px-2 py-2 text-left font-medium">Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsed.Csv.Headers.map((header) => {
                                        const m = mappings.find((x) => x.Column === header);
                                        if (m === undefined) return null;
                                        const cell = parsed.Csv.Rows[rowIndex]?.[parsed.Csv.Headers.indexOf(header)] ?? "";
                                        const skipped = m.Variable === null;
                                        const validation = !skipped && m.Variable !== null
                                            ? validateVariableName(m.Variable)
                                            : null;
                                        return (
                                            <tr key={header} className="border-b last:border-0">
                                                <td className="px-2 py-1.5 align-middle font-medium">{header}</td>
                                                <td className="max-w-[14rem] truncate px-2 py-1.5 align-middle text-muted-foreground" title={cell}>
                                                    {cell === "" ? <em className="opacity-50">empty</em> : cell}
                                                </td>
                                                <td className="px-2 py-1.5 align-middle">
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            value={m.Variable ?? ""}
                                                            disabled={skipped}
                                                            placeholder={skipped ? "(skipped)" : suggestVariableName(header)}
                                                            onChange={(e) => updateMapping(header, { Variable: e.target.value })}
                                                            className={[
                                                                "h-7",
                                                                validation !== null ? "border-destructive" : "",
                                                            ].join(" ")}
                                                            aria-invalid={validation !== null}
                                                            title={validation ?? undefined}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs"
                                                            onClick={() => updateMapping(header, {
                                                                Variable: skipped ? suggestVariableName(header) : null,
                                                            })}
                                                            title={skipped ? "Include this column" : "Skip this column"}
                                                        >
                                                            {skipped ? "Use" : "Skip"}
                                                        </Button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-1.5 align-middle">
                                                    <Select
                                                        value={m.Coerce}
                                                        onValueChange={(v) => updateMapping(header, { Coerce: v as CoercionKind })}
                                                        disabled={skipped}
                                                    >
                                                        <SelectTrigger className="h-7 w-[110px]">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {COERCION_OPTIONS.map((opt) => (
                                                                <SelectItem key={opt.value} value={opt.value} title={opt.hint}>
                                                                    {opt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </ScrollArea>

                        <div className="min-h-[1.25rem] text-xs">
                            {buildResult === null ? (
                                <span className="text-muted-foreground">Pick a row to preview the resulting bag.</span>
                            ) : buildResult.Ok ? (
                                <span className="text-emerald-500">
                                    ✓ Will bind {buildResult.UsedColumns} variable(s) from row {rowIndex + 1}.
                                </span>
                            ) : (
                                <span className="text-destructive">
                                    {buildResult.Reason}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {parsed !== null && (
                        <Button
                            variant="outline"
                            onClick={() => { setParsed(null); setMappings([]); setRowIndex(0); }}
                        >
                            Load a different file
                        </Button>
                    )}
                    <Button
                        onClick={handleApply}
                        disabled={groupId === null || buildResult === null || !buildResult.Ok}
                    >
                        Apply row {parsed === null ? "" : rowIndex + 1}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
