/**
 * useSchemaBuilder — State and handlers for SchemaTab
 *
 * Extracted from SchemaTab.tsx to keep the component under max-lines-per-function.
 */

import { useState, useCallback, useRef } from "react";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";
import { createErrorModel, type ErrorModel } from "@/types/error-model";
import type { ColumnDefinition } from "./ColumnEditor";
import type { ForeignKeyDefinition, OnDeleteAction } from "./ForeignKeyEditor";
import type { ValidationRule } from "./ValidationRuleEditor";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ColumnWithValidation extends ColumnDefinition {
  validation?: ValidationRule | null;
}

export interface TableDefinition {
  name: string;
  description: string;
  columns: ColumnWithValidation[];
  relations: ForeignKeyDefinition[];
  isOpen: boolean;
}

export interface ApplyResult {
  isOk: boolean;
  created?: number;
  migrated?: number;
  errors?: string[];
  errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- hook managing complex schema builder state
export function useSchemaBuilder(projectSlug: string, onMigrationComplete: () => void) {
  const [tables, setTables] = useState<TableDefinition[]>([]);
  const [applying, setApplying] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [lastResult, setLastResult] = useState<ApplyResult | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [modalError, setModalError] = useState<ErrorModel | null>(null);
  const [errorModalOpen, setErrorModalOpen] = useState(false);

  const allTableNames = tables.map((t) => t.name).filter(Boolean);

  const addTable = () => {
    setTables([
      ...tables,
      { name: "", description: "", columns: [{ name: "", type: "TEXT" }], relations: [], isOpen: true },
    ]);
  };

  const updateTable = (index: number, patch: Partial<TableDefinition>) => {
    setTables(tables.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const removeTable = (index: number) => {
    setTables(tables.filter((_, i) => i !== index));
  };

  const toggleTable = (index: number) => {
    updateTable(index, { isOpen: !tables[index].isOpen });
  };

  // eslint-disable-next-line max-lines-per-function -- loads and transforms existing schema from DB meta
  const handleLoadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      const resp = await sendMessage<{
        isOk: boolean;
        tables?: Array<{ Name: string; Description?: string }>;
        columns?: Array<{ TableName: string; Name: string; Type: string; Nullable?: boolean; Unique?: boolean; DefaultValue?: string; Description?: string }>;
        relations?: Array<{ TableName: string; SourceColumn: string; TargetTable: string; TargetColumn: string; OnDelete?: string }>;
        errorMessage?: string;
      }>({ type: "GENERATE_SCHEMA_DOCS", project: projectSlug, format: "meta" });

      if (!resp.isOk) { toast.error(resp.errorMessage || "Failed to load schema"); return; }

      const metaTables = resp.tables ?? [];
      const metaCols = resp.columns ?? [];
      const metaRels = resp.relations ?? [];

      if (metaTables.length === 0) { toast.info("No existing tables found in meta"); return; }

      const loaded: TableDefinition[] = metaTables.map((t) => ({
        name: t.Name,
        description: t.Description ?? "",
        columns: metaCols.filter((c) => c.TableName === t.Name).map((c) => ({
          name: c.Name, type: (c.Type || "TEXT") as ColumnDefinition["type"],
          nullable: c.Nullable ?? false, unique: c.Unique ?? false,
          defaultValue: c.DefaultValue ?? "", description: c.Description ?? "",
        })),
        relations: metaRels.filter((r) => r.TableName === t.Name).map((r) => ({
          sourceColumn: r.SourceColumn, targetTable: r.TargetTable,
          targetColumn: r.TargetColumn || "Id", onDelete: ((r.OnDelete) || "CASCADE") as OnDeleteAction,
        })),
        isOpen: false,
      }));

      setTables(loaded);
      toast.success(`Loaded ${loaded.length} table(s) from DB`);
    } catch (err) {
      const errModel = createErrorModel(err, {
        source: "Database", operation: "LoadFromDB", projectName: projectSlug,
        contextJson: JSON.stringify({ type: "GENERATE_SCHEMA_DOCS", project: projectSlug, format: "meta" }),
        suggestedAction: "Ensure the project slug is set. Try selecting a project from the project list first.",
      });
      setModalError(errModel);
      setErrorModalOpen(true);
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoadingExisting(false);
    }
  }, [projectSlug]);

  const handleExport = useCallback(() => {
    if (tables.length === 0) { toast.error("No tables to export"); return; }
    const exportData = {
      _type: "marco-schema-export", version: "1.0.0",
      exportedAt: new Date().toISOString(),
      tables: tables.map(({ isOpen, ...rest }) => rest),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectSlug}-schema.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Schema exported");
  }, [tables, projectSlug]);

  const handleImport = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data._type !== "marco-schema-export" || !Array.isArray(data.tables)) {
          toast.error("Invalid schema file"); return;
        }
        const imported: TableDefinition[] = data.tables.map((t: Record<string, unknown>) => ({
          name: t.name ?? "", description: t.description ?? "",
          columns: Array.isArray(t.columns) ? t.columns : [{ name: "", type: "TEXT" }],
          relations: Array.isArray(t.relations) ? t.relations : [],
          isOpen: false,
        }));
        setTables(imported);
        toast.success(`Imported ${imported.length} table(s)`);
      } catch {
        toast.error("Failed to parse schema file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleApply = useCallback(async () => {
    const validTables = tables.filter((t) => t.name.trim() && t.columns.some((c) => c.name.trim()));
    if (validTables.length === 0) { toast.error("Add at least one table with columns"); return; }

    setApplying(true);
    setLastResult(null);

    try {
      const schema = buildSchemaPayload(validTables);
      const result = await sendMessage<ApplyResult>({
        type: "APPLY_JSON_SCHEMA", project: projectSlug, schema: JSON.stringify(schema),
      });
      setLastResult(result);
      if (result.isOk) {
        toast.success(`Schema applied: ${result.created ?? 0} created, ${result.migrated ?? 0} migrated`);
        onMigrationComplete();
      } else {
        toast.error(result.errorMessage || "Schema apply failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResult({ isOk: false, errorMessage: msg });
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  }, [tables, projectSlug, onMigrationComplete]);

  return {
    tables, setTables, applying, loadingExisting, lastResult, importRef,
    modalError, errorModalOpen, setErrorModalOpen, allTableNames,
    addTable, updateTable, removeTable, toggleTable,
    handleLoadExisting, handleExport, handleImport, handleApply,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- builds nested schema payload structure
function buildSchemaPayload(validTables: TableDefinition[]) {
  return {
    version: "1.0.0",
    tables: validTables.map((t) => {
      const tableDef: Record<string, unknown> = { TableName: t.name.trim() };
      if (t.description.trim()) tableDef.Description = t.description.trim();

      tableDef.Columns = t.columns.filter((c) => c.name.trim()).map((c) => {
        const col: Record<string, unknown> = { Name: c.name.trim(), Type: c.type };
        if (c.nullable) col.Nullable = true;
        if (c.unique) col.Unique = true;
        if (c.defaultValue) col.Default = c.defaultValue;
        if (c.description) col.Description = c.description;
        if (c.validation) col.Validation = c.validation;
        return col;
      });

      if (t.relations.length > 0) {
        tableDef.Relations = t.relations
          .filter((r) => r.sourceColumn.trim() && r.targetTable.trim())
          .map((r) => ({
            SourceColumn: r.sourceColumn, TargetTable: r.targetTable,
            TargetColumn: r.targetColumn || "Id", OnDelete: r.onDelete,
          }));
      }
      return tableDef;
    }),
  };
}
