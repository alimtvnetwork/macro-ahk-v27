/**
 * SchemaTableCard — Single table card for the Visual Table Builder
 *
 * Extracted from SchemaTab.tsx to keep components under max-lines-per-function.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ColumnEditor } from "./ColumnEditor";
import { ValidationRuleEditor } from "./ValidationRuleEditor";
import { ForeignKeyEditor } from "./ForeignKeyEditor";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { TableDefinition, ColumnWithValidation } from "./useSchemaBuilder";

interface SchemaTableCardProps {
  table: TableDefinition;
  tableIdx: number;
  allTableNames: string[];
  onUpdate: (index: number, patch: Partial<TableDefinition>) => void;
  onRemove: (index: number) => void;
  onToggle: (index: number) => void;
}

// eslint-disable-next-line max-lines-per-function -- collapsible card with column, validation, and FK editors
export function SchemaTableCard({ table, tableIdx, allTableNames, onUpdate, onRemove, onToggle }: SchemaTableCardProps) {
  return (
    <Card className="border-border">
      <Collapsible open={table.isOpen} onOpenChange={() => onToggle(tableIdx)}>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {table.isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </CollapsibleTrigger>
            <Input
              value={table.name}
              onChange={(e) => onUpdate(tableIdx, { name: e.target.value })}
              placeholder="TableName (PascalCase)"
              className="h-7 text-xs font-mono font-semibold flex-1"
            />
            <Input
              value={table.description}
              onChange={(e) => onUpdate(tableIdx, { description: e.target.value })}
              placeholder="Description (optional)"
              className="h-7 text-xs flex-1"
            />
            <Badge variant="outline" className="text-[9px] shrink-0">
              {table.columns.filter((c) => c.name.trim()).length} col
              {table.relations.length > 0 && ` · ${table.relations.length} FK`}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => onRemove(tableIdx)} className="h-6 w-6 p-0 text-destructive shrink-0">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-3 pb-3 space-y-3">
            <ColumnEditor
              columns={table.columns}
              onChange={(cols) => onUpdate(tableIdx, { columns: cols as ColumnWithValidation[] })}
              advanced
            />

            <ColumnValidationSection table={table} tableIdx={tableIdx} onUpdate={onUpdate} />

            <ForeignKeyEditor
              relations={table.relations}
              onChange={(rels) => onUpdate(tableIdx, { relations: rels })}
              availableTables={allTableNames.filter((n) => n !== table.name)}
              availableColumns={table.columns.map((c) => c.name).filter(Boolean)}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Column Validation sub-section                                      */
/* ------------------------------------------------------------------ */

function ColumnValidationSection({
  table, tableIdx, onUpdate,
}: {
  table: TableDefinition;
  tableIdx: number;
  onUpdate: (index: number, patch: Partial<TableDefinition>) => void;
}) {
  const namedCols = table.columns.filter((c) => c.name.trim());
  if (namedCols.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">Column Validation</Label>
      {namedCols.map((col, colIdx) => {
        const realIdx = table.columns.indexOf(col);
        return (
          <div key={colIdx} className="space-y-1">
            <span className="text-[10px] font-mono text-muted-foreground">{col.name}</span>
            <ValidationRuleEditor
              rule={col.validation ?? null}
              onChange={(v) => {
                const newCols = [...table.columns];
                newCols[realIdx] = { ...newCols[realIdx], validation: v };
                onUpdate(tableIdx, { columns: newCols as ColumnWithValidation[] });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
