/**
 * SchemaTab — Visual Table Builder
 *
 * Thin orchestrator that delegates state to useSchemaBuilder
 * and table card rendering to SchemaTableCard.
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SchemaDiffPreview } from "./SchemaDiffPreview";
import { SchemaVersionHistory } from "./SchemaVersionHistory";
import { ErrorModal } from "./ErrorModal";
import { SchemaTableCard } from "./SchemaTableCard";
import { useSchemaBuilder, type ColumnWithValidation } from "./useSchemaBuilder";
import type { ForeignKeyDefinition } from "./ForeignKeyEditor";
import {
  Plus, Save, Loader2, CheckCircle2, AlertCircle,
  Download, Upload, DatabaseBackup, Layers,
} from "lucide-react";

interface SchemaTabProps {
  projectSlug: string;
  onMigrationComplete: () => void;
}

// eslint-disable-next-line max-lines-per-function -- thin orchestrator for visual table builder
export function SchemaTab({ projectSlug, onMigrationComplete }: SchemaTabProps) {
  const sb = useSchemaBuilder(projectSlug, onMigrationComplete);

  return (
    <div className="space-y-3">
      <SchemaToolbar
        tableCount={sb.tables.length}
        loadingExisting={sb.loadingExisting}
        applying={sb.applying}
        importRef={sb.importRef}
        onLoadExisting={() => void sb.handleLoadExisting()}
        onImport={sb.handleImport}
        onExport={sb.handleExport}
        onAddTable={sb.addTable}
        onApply={() => void sb.handleApply()}
      />

      <ResultBanner result={sb.lastResult} />

      {sb.tables.length > 0 && (
        <div className="space-y-2 border rounded-md p-3">
          <SchemaDiffPreview
            projectSlug={projectSlug}
            pendingTables={sb.tables.map((t) => ({
              name: t.name, columns: t.columns.filter((c) => c.name.trim()),
            }))}
          />
          <SchemaVersionHistory
            projectSlug={projectSlug}
            currentTables={sb.tables.map(({ isOpen, ...rest }) => rest) as unknown as Record<string, unknown>[]}
            onRestore={(restored) => {
              sb.setTables(
                (restored as unknown as Array<Record<string, unknown>>).map((t) => ({
                  name: String(t.name ?? ""),
                  description: String(t.description ?? ""),
                  columns: Array.isArray(t.columns) ? t.columns as ColumnWithValidation[] : [],
                  relations: Array.isArray(t.relations) ? t.relations as ForeignKeyDefinition[] : [],
                  isOpen: false,
                })),
              );
            }}
          />
        </div>
      )}

      {sb.tables.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto h-8 w-8 mb-2 opacity-40" />
          <p>No tables defined yet.</p>
          <p className="text-xs mt-1">Click "Add Table" to start designing your schema visually.</p>
        </div>
      )}

      {sb.tables.map((table, idx) => (
        <SchemaTableCard
          key={idx}
          table={table}
          tableIdx={idx}
          allTableNames={sb.allTableNames}
          onUpdate={sb.updateTable}
          onRemove={sb.removeTable}
          onToggle={sb.toggleTable}
        />
      ))}

      <ErrorModal error={sb.modalError} open={sb.errorModalOpen} onOpenChange={sb.setErrorModalOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- toolbar with multiple action buttons
function SchemaToolbar({
  tableCount, loadingExisting, applying, importRef,
  onLoadExisting, onImport, onExport, onAddTable, onApply,
}: {
  tableCount: number;
  loadingExisting: boolean;
  applying: boolean;
  importRef: React.RefObject<HTMLInputElement>;
  onLoadExisting: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onAddTable: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Visual Table Builder</span>
        <Badge variant="outline" className="text-[10px]">
          {tableCount} table{tableCount !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={onLoadExisting} disabled={loadingExisting} className="h-7 text-xs gap-1">
          {loadingExisting ? <Loader2 className="h-3 w-3 animate-spin" /> : <DatabaseBackup className="h-3 w-3" />}
          Load from DB
        </Button>
        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} className="h-7 text-xs gap-1">
          <Upload className="h-3 w-3" /> Import
        </Button>
        <Button variant="outline" size="sm" onClick={onExport} disabled={tableCount === 0} className="h-7 text-xs gap-1">
          <Download className="h-3 w-3" /> Export
        </Button>
        <Button variant="outline" size="sm" onClick={onAddTable} className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> Add Table
        </Button>
        <Button size="sm" onClick={onApply} disabled={applying || tableCount === 0} className="h-7 text-xs gap-1">
          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Apply Schema
        </Button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}
        />
      </div>
    </div>
  );
}

function ResultBanner({ result }: { result: { isOk: boolean; created?: number; migrated?: number; errorMessage?: string; errors?: string[] } | null }) {
  if (!result) return null;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
      result.isOk
        ? "bg-green-500/10 text-green-700 border border-green-500/20"
        : "bg-destructive/10 text-destructive border border-destructive/20"
    }`}>
      {result.isOk ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
      <span>
        {result.isOk
          ? `${result.created ?? 0} created, ${result.migrated ?? 0} migrated`
          : result.errorMessage}
      </span>
      {result.errors && result.errors.length > 0 && (
        <span className="text-[10px] opacity-70">({result.errors.length} warning{result.errors.length !== 1 ? "s" : ""})</span>
      )}
    </div>
  );
}
