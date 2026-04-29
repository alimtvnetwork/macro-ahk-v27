/* eslint-disable max-lines-per-function */
/**
 * ForeignKeyEditor — Reusable component for defining foreign key relationships.
 *
 * Allows users to specify source column, target table, target column,
 * and ON DELETE behavior. Used in the Schema tab and table creation forms.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Link } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type OnDeleteAction = "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";

export interface ForeignKeyDefinition {
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  onDelete: OnDeleteAction;
}

interface ForeignKeyEditorProps {
  relations: ForeignKeyDefinition[];
  onChange: (relations: ForeignKeyDefinition[]) => void;
  /** Available table names for the target dropdown */
  availableTables?: string[];
  /** Available column names on the current table */
  availableColumns?: string[];
  readOnly?: boolean;
}

const ON_DELETE_OPTIONS: OnDeleteAction[] = ["CASCADE", "SET NULL", "RESTRICT", "NO ACTION"];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function ForeignKeyEditor({
  relations,
  onChange,
  availableTables = [],
  availableColumns = [],
  readOnly = false,
}: ForeignKeyEditorProps) {
  const addRelation = () => {
    onChange([
      ...relations,
      { sourceColumn: "", targetTable: "", targetColumn: "Id", onDelete: "CASCADE" },
    ]);
  };

  const updateRelation = (index: number, patch: Partial<ForeignKeyDefinition>) => {
    const updated = relations.map((rel, i) => (i === index ? { ...rel, ...patch } : rel));
    onChange(updated);
  };

  const removeRelation = (index: number) => {
    onChange(relations.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link className="h-3 w-3 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Foreign Keys</p>
        </div>
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={addRelation} className="h-6 text-[10px] gap-1">
            <Plus className="h-3 w-3" /> FK
          </Button>
        )}
      </div>

      {relations.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">
          No foreign keys. {!readOnly && "Click \"+ FK\" to add a relationship."}
        </p>
      )}
      {relations.map((rel, i) => (
        <div
          key={i}
          className="flex items-end gap-1.5 rounded-md border border-border p-2 bg-muted/20"
        >
          {/* Source column */}
          <div className="space-y-0.5 flex-1">
            <Label className="text-[9px] text-muted-foreground">Source Column</Label>
            {availableColumns.length > 0 ? (
              <Select
                value={rel.sourceColumn}
                onValueChange={(v) => updateRelation(i, { sourceColumn: v })}
                disabled={readOnly}
              >
                <SelectTrigger className="h-6 text-[10px] font-mono">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={rel.sourceColumn}
                onChange={(e) => updateRelation(i, { sourceColumn: e.target.value })}
                placeholder="ColumnName"
                className="h-6 text-[10px] font-mono"
                readOnly={readOnly}
              />
            )}
          </div>

          <span className="text-[10px] text-muted-foreground pb-1">→</span>

          {/* Target table */}
          <div className="space-y-0.5 flex-1">
            <Label className="text-[9px] text-muted-foreground">Target Table</Label>
            {availableTables.length > 0 ? (
              <Select
                value={rel.targetTable}
                onValueChange={(v) => updateRelation(i, { targetTable: v })}
                disabled={readOnly}
              >
                <SelectTrigger className="h-6 text-[10px] font-mono">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTables.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={rel.targetTable}
                onChange={(e) => updateRelation(i, { targetTable: e.target.value })}
                placeholder="TableName"
                className="h-6 text-[10px] font-mono"
                readOnly={readOnly}
              />
            )}
          </div>

          {/* Target column */}
          <div className="space-y-0.5 w-16">
            <Label className="text-[9px] text-muted-foreground">Target Col</Label>
            <Input
              value={rel.targetColumn}
              onChange={(e) => updateRelation(i, { targetColumn: e.target.value })}
              placeholder="Id"
              className="h-6 text-[10px] font-mono"
              readOnly={readOnly}
            />
          </div>

          {/* ON DELETE */}
          <div className="space-y-0.5 w-24">
            <Label className="text-[9px] text-muted-foreground">On Delete</Label>
            <Select
              value={rel.onDelete}
              onValueChange={(v) => updateRelation(i, { onDelete: v as OnDeleteAction })}
              disabled={readOnly}
            >
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ON_DELETE_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delete */}
          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRelation(i)}
              className="h-6 w-6 p-0 text-destructive shrink-0"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
