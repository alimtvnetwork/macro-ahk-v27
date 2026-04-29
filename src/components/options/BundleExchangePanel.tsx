/**
 * Marco Extension — Bundle Exchange Panel
 *
 * Dedicated import/export "screen" embedded in the Step Group Library
 * page. Surfaces the same `runStepGroupExport` / `runStepGroupImport`
 * pipelines the toolbar already calls, but as a labeled, two-column
 * card with:
 *
 *   - an explicit drag-and-drop zone for `.zip` bundles,
 *   - a count-aware Export button keyed off the parent's selection,
 *   - persistent "last export / last import" summaries so the user can
 *     confirm what just happened without re-reading toast history.
 *
 * The component is **purely presentational over callbacks** — it does
 * NOT touch sql.js or the bundle modules directly. That keeps the
 * library page as the single source of truth for the in-memory DB and
 * lets us unit-test this component in isolation later.
 */

import { useRef, useState } from "react";
import { Download, FileArchive, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface LastExportSummary {
    readonly FileName: string;
    readonly GroupCount: number;
    readonly StepCount: number;
    readonly At: string; // ISO timestamp
}

export interface LastImportSummary {
    readonly GroupCount: number;
    readonly StepCount: number;
    readonly RenameCount: number;
    readonly At: string;
}

interface BundleExchangePanelProps {
    readonly selectedCount: number;
    /**
     * Trigger an export. The boolean argument is the user's choice from
     * the "Include descendants" checkbox — when `true`, every transitive
     * sub-group of each ticked root is packaged; when `false`, only the
     * exact selection ships and any nested children are skipped.
     */
    readonly onExport: (includeDescendants: boolean) => void | Promise<void>;
    readonly onImportFile: (file: File) => void | Promise<void>;
    readonly lastExport: LastExportSummary | null;
    readonly lastImport: LastImportSummary | null;
    readonly disabled?: boolean;
}

const ACCEPT_ZIP = ".zip,application/zip";
const ZIP_MIME = "application/zip";

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleTimeString();
    } catch {
        return iso;
    }
}

function isZipFile(file: File): boolean {
    return file.type === ZIP_MIME || file.name.toLowerCase().endsWith(".zip");
}

export default function BundleExchangePanel(props: BundleExchangePanelProps) {
    const { selectedCount, onExport, onImportFile, lastExport, lastImport, disabled } = props;
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    /**
     * Default ON to preserve the long-standing behaviour ("Includes every
     * nested sub-group and step"). Users can untick it for a strict,
     * roots-only export — useful when migrating just the top-level
     * shells across projects without their inner step trees.
     */
    const [includeDescendants, setIncludeDescendants] = useState(true);

    const handleDrop = (ev: React.DragEvent<HTMLDivElement>) => {
        ev.preventDefault();
        setDragOver(false);
        const file = ev.dataTransfer.files?.[0];
        if (file === undefined) return;
        if (!isZipFile(file)) return; // silent ignore; UI will show no change
        void onImportFile(file);
    };

    const handlePicked = (ev: React.ChangeEvent<HTMLInputElement>) => {
        const file = ev.target.files?.[0];
        if (file !== undefined) void onImportFile(file);
        ev.target.value = "";
    };

    return (
        <Card className="flex flex-col gap-4 p-4">
            <header className="flex items-center gap-2">
                <FileArchive className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Import / Export bundle</h2>
                <span className="text-xs text-muted-foreground">
                    Move step groups between projects or back them up as a portable .zip
                </span>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
                {/* ---- Export side ---- */}
                <section className="flex flex-col gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Export selected groups</div>
                        <span className="text-xs text-muted-foreground">
                            {selectedCount} selected
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Tick groups in the tree below to add them. Use the checkbox to control
                        whether nested sub-groups are packaged too.
                    </p>
                    <div className="flex items-start gap-2">
                        <Checkbox
                            id="export-include-descendants"
                            checked={includeDescendants}
                            onCheckedChange={(v) => setIncludeDescendants(v === true)}
                            disabled={disabled === true}
                            aria-describedby="export-include-descendants-help"
                        />
                        <div className="flex flex-col">
                            <Label
                                htmlFor="export-include-descendants"
                                className="cursor-pointer text-sm font-medium leading-none"
                            >
                                Include descendants
                            </Label>
                            <span
                                id="export-include-descendants-help"
                                className="mt-1 text-xs text-muted-foreground"
                            >
                                {includeDescendants
                                    ? "Every nested sub-group of each ticked group is packaged too."
                                    : "Only the exact groups you ticked ship — children are skipped."}
                            </span>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        className="self-start"
                        disabled={disabled === true || selectedCount === 0}
                        onClick={() => void onExport(includeDescendants)}
                    >
                        <Download className="mr-1 h-4 w-4" />
                        Download .zip
                    </Button>
                    {lastExport !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Last: <span className="font-mono">{lastExport.FileName}</span> ·
                            {" "}{lastExport.GroupCount} group(s) · {lastExport.StepCount} step(s) ·
                            {" "}{formatTime(lastExport.At)}
                        </p>
                    )}
                </section>

                {/* ---- Import side ---- */}
                <section className="flex flex-col gap-2 rounded-md border p-3">
                    <div className="text-sm font-medium">Import a bundle</div>
                    <div
                        onDragOver={(ev) => { ev.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") inputRef.current?.click();
                        }}
                        className={[
                            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-6 text-center text-xs transition",
                            dragOver
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary",
                            disabled === true ? "pointer-events-none opacity-50" : "",
                        ].join(" ")}
                        aria-label="Drop a .zip bundle here or click to browse"
                    >
                        <Upload className="h-5 w-5" />
                        <span className="font-medium">Drop a .zip here, or click to browse</span>
                        <span>Conflicting names are auto-renamed</span>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={ACCEPT_ZIP}
                        className="hidden"
                        onChange={handlePicked}
                    />
                    {lastImport !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            Last: {lastImport.GroupCount} group(s) · {lastImport.StepCount} step(s)
                            {lastImport.RenameCount > 0
                                ? ` · ${lastImport.RenameCount} renamed`
                                : ""} · {formatTime(lastImport.At)}
                        </p>
                    )}
                </section>
            </div>
        </Card>
    );
}
