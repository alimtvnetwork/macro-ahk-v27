/**
 * SchemaDiffPreview — Shows what will change before applying schema
 *
 * Compares current DB meta tables against the visual builder state
 * and displays created/modified/dropped tables with column-level diffs.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";
import {
  Loader2, GitCompareArrows, Plus, Pencil, Trash2,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SimpleTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
}

interface DiffEntry {
  table: string;
  action: "create" | "modify" | "drop";
  addedCols: string[];
  removedCols: string[];
  modifiedCols: string[];
}

interface SchemaDiffPreviewProps {
  projectSlug: string;
  pendingTables: SimpleTable[];
}

// eslint-disable-next-line max-lines-per-function
export function SchemaDiffPreview({ projectSlug, pendingTables }: SchemaDiffPreviewProps) {
  const [diffs, setDiffs] = useState<DiffEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  // eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
  const computeDiff = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await sendMessage<{
        isOk: boolean;
        tables?: Array<{ Name: string }>;
        columns?: Array<{ TableName: string; Name: string; Type: string }>;
      }>({
        type: "GENERATE_SCHEMA_DOCS",
        project: projectSlug,
        format: "meta",
      });

      const existingTables = resp.tables ?? [];
      const existingCols = resp.columns ?? [];
      const existingNames = new Set(existingTables.map((t) => t.Name));
      const pendingNames = new Set(pendingTables.map((t) => t.name).filter(Boolean));

      const entries: DiffEntry[] = [];

      // Created tables
      for (const pt of pendingTables) {
        if (!pt.name) continue;
        if (!existingNames.has(pt.name)) {
          entries.push({
            table: pt.name,
            action: "create",
            addedCols: pt.columns.map((c) => c.name).filter(Boolean),
            removedCols: [],
            modifiedCols: [],
          });
        } else {
          // Modified tables — compare columns
          const existing = existingCols
            .filter((c) => c.TableName === pt.name)
            .map((c) => ({ name: c.Name, type: c.Type }));
          const existColNames = new Set(existing.map((c) => c.name));
          const pendColNames = new Set(pt.columns.map((c) => c.name).filter(Boolean));

          const added = pt.columns.filter((c) => c.name && !existColNames.has(c.name)).map((c) => c.name);
          const removed = existing.filter((c) => !pendColNames.has(c.name)).map((c) => c.name);
          const modified = pt.columns.filter((c) => {
            if (!c.name || !existColNames.has(c.name)) return false;
            const ex = existing.find((e) => e.name === c.name);
            return ex && ex.type !== c.type;
          }).map((c) => c.name);

          if (added.length > 0 || removed.length > 0 || modified.length > 0) {
            entries.push({
              table: pt.name,
              action: "modify",
              addedCols: added,
              removedCols: removed,
              modifiedCols: modified,
            });
          }
        }
      }

      // Dropped tables (in DB but not in pending)
      for (const et of existingTables) {
        if (!pendingNames.has(et.Name)) {
          const cols = existingCols.filter((c) => c.TableName === et.Name).map((c) => c.Name);
          entries.push({
            table: et.Name,
            action: "drop",
            addedCols: [],
            removedCols: cols,
            modifiedCols: [],
          });
        }
      }

      setDiffs(entries);
      if (entries.length === 0) {
        toast.info("No differences detected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Diff failed");
    } finally {
      setLoading(false);
    }
  }, [projectSlug, pendingTables]);

  const actionIcon = (action: DiffEntry["action"]) => {
    switch (action) {
      case "create": return <Plus className="h-3 w-3 text-green-600" />;
      case "modify": return <Pencil className="h-3 w-3 text-amber-600" />;
      case "drop": return <Trash2 className="h-3 w-3 text-destructive" />;
    }
  };

  const actionBadge = (action: DiffEntry["action"]) => {
    const variants: Record<string, string> = {
      create: "bg-green-500/10 text-green-700 border-green-500/20",
      modify: "bg-amber-500/10 text-amber-700 border-amber-500/20",
      drop: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return variants[action] ?? "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void computeDiff()}
          disabled={loading || pendingTables.length === 0}
          className="h-7 text-xs gap-1"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <GitCompareArrows className="h-3 w-3" />
          )}
          Preview Changes
        </Button>
        {diffs !== null && (
          <span className="text-[10px] text-muted-foreground">
            {diffs.length === 0
              ? "No changes"
              : `${diffs.length} change${diffs.length !== 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {diffs && diffs.length > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Diff Details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 mt-1.5">
              {diffs.map((d) => (
                <div
                  key={d.table}
                  className={`flex items-start gap-2 px-3 py-1.5 rounded-md text-xs border ${actionBadge(d.action)}`}
                >
                  {actionIcon(d.action)}
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-semibold">{d.table}</span>
                    <span className="ml-1.5 text-[10px] uppercase opacity-70">{d.action}</span>
                    {d.addedCols.length > 0 && (
                      <div className="text-[10px] mt-0.5">
                        <span className="text-green-700">+ {d.addedCols.join(", ")}</span>
                      </div>
                    )}
                    {d.removedCols.length > 0 && (
                      <div className="text-[10px] mt-0.5">
                        <span className="text-destructive">− {d.removedCols.join(", ")}</span>
                      </div>
                    )}
                    {d.modifiedCols.length > 0 && (
                      <div className="text-[10px] mt-0.5">
                        <span className="text-amber-700">~ {d.modifiedCols.join(", ")}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
