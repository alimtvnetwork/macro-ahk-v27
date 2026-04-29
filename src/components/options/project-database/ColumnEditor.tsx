/* eslint-disable max-lines-per-function */
/**
 * ColumnEditor — Reusable component for defining table columns.
 *
 * Supports: name, type, nullable, unique, default value, description.
 * Used by both the Tables tab (create form) and Schema tab.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { ValidationRuleEditor, type ValidationRule } from "./ValidationRuleEditor";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SqliteType = "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";

export interface ColumnDefinition {
  name: string;
  type: SqliteType;
  nullable?: boolean;
  unique?: boolean;
  defaultValue?: string;
  description?: string;
  validation?: ValidationRule | null;
}

interface ColumnEditorProps {
  columns: ColumnDefinition[];
  onChange: (columns: ColumnDefinition[]) => void;
  /** Show advanced fields (unique, default, description). Default: false */
  advanced?: boolean;
  /** Minimum number of columns. Default: 1 */
  minColumns?: number;
  /** Read-only mode. Default: false */
  readOnly?: boolean;
}

const SQLITE_TYPES: SqliteType[] = ["TEXT", "INTEGER", "REAL", "BLOB", "BOOLEAN"];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function ColumnEditor({
  columns,
  onChange,
  advanced = false,
  minColumns = 1,
  readOnly = false,
}: ColumnEditorProps) {
  const addColumn = () => {
    onChange([...columns, { name: "", type: "TEXT" }]);
  };

  const updateColumn = (index: number, patch: Partial<ColumnDefinition>) => {
    const updated = columns.map((col, i) => (i === index ? { ...col, ...patch } : col));
    onChange(updated);
  };

  const removeColumn = (index: number) => {
    if (columns.length <= minColumns) return;
    onChange(columns.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Columns {!readOnly && "(Id, CreatedAt, UpdatedAt added automatically)"}
        </p>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addColumn} className="h-6 text-[10px] gap-1">
            <Plus className="h-3 w-3" /> Column
          </Button>
        )}
      </div>
      {columns.map((col, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex gap-1.5 items-center">
            {!readOnly && (
              <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-grab" />
            )}
            <Input
              placeholder="ColumnName"
              value={col.name}
              onChange={(e) => updateColumn(i, { name: e.target.value })}
              className="h-7 text-xs flex-1 font-mono"
              readOnly={readOnly}
            />
            <Select
              value={col.type}
              onValueChange={(v) => updateColumn(i, { type: v as SqliteType })}
              disabled={readOnly}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SQLITE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Nullable toggle */}
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={col.nullable ?? false}
                onCheckedChange={(v) => updateColumn(i, { nullable: v })}
                disabled={readOnly}
                className="h-4 w-7"
              />
              <Label className="text-[10px] text-muted-foreground">Null</Label>
            </div>

            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeColumn(i)}
                disabled={columns.length <= minColumns}
                className="h-7 w-7 p-0 text-destructive shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Advanced fields */}
          {advanced && (
            <div className="flex gap-1.5 ml-5">
              <div className="flex items-center gap-1 shrink-0">
                <Switch
                  checked={col.unique ?? false}
                  onCheckedChange={(v) => updateColumn(i, { unique: v })}
                  disabled={readOnly}
                  className="h-4 w-7"
                />
                <Label className="text-[10px] text-muted-foreground">Unique</Label>
              </div>
              <Input
                placeholder="Default value"
                value={col.defaultValue ?? ""}
                onChange={(e) => updateColumn(i, { defaultValue: e.target.value || undefined })}
                className="h-6 text-[10px] flex-1"
                readOnly={readOnly}
              />
              <Input
                placeholder="Description"
                value={col.description ?? ""}
                onChange={(e) => updateColumn(i, { description: e.target.value || undefined })}
                className="h-6 text-[10px] flex-1"
                readOnly={readOnly}
              />
            </div>
          )}

          {/* Inline validation editor */}
          {advanced && col.name.trim() && (
            <div className="ml-5">
              <ValidationRuleEditor
                rule={col.validation ?? null}
                onChange={(v) => updateColumn(i, { validation: v })}
                readOnly={readOnly}
              />
            </div>
          )}
        </div>
      ))}

      {columns.length === 0 && !readOnly && (
        <p className="text-xs text-muted-foreground text-center py-3">
          No columns defined. Click "+ Column" to add one.
        </p>
      )}
    </div>
  );
}
