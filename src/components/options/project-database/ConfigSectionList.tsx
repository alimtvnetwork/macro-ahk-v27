/**
 * ConfigSectionList — Collapsible config sections with inline row editors
 *
 * Extracted from ConfigDbTab.tsx to keep the component under max-lines-per-function.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Save, Loader2 } from "lucide-react";
import type { ConfigRow } from "./useConfigDb";

interface ConfigSectionListProps {
  sections: Record<string, ConfigRow[]>;
  edits: Record<string, string>;
  saving: string | null;
  editKey: (section: string, key: string) => string;
  onEditChange: (key: string, value: string) => void;
  onSave: (row: ConfigRow) => void;
}

// eslint-disable-next-line max-lines-per-function -- collapsible section list with inline row editors
export function ConfigSectionList({ sections, edits, saving, editKey, onEditChange, onSave }: ConfigSectionListProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const toggleSection = (s: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  return (
    <>
      {Object.entries(sections).map(([section, sectionRows]) => (
        <Collapsible key={section} open={openSections.has(section)} onOpenChange={() => toggleSection(section)}>
          <div className="border rounded-md">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent/50 transition-colors text-left">
                {openSections.has(section)
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="text-xs font-mono font-semibold">{section}</span>
                <Badge variant="outline" className="text-[9px] ml-auto">{sectionRows.length}</Badge>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t divide-y">
                {sectionRows.map((row) => {
                  const ek = editKey(row.Section, row.Key);
                  const currentValue = edits[ek] ?? row.Value;
                  const isDirty = edits[ek] !== undefined && edits[ek] !== row.Value;
                  const isSaving = saving === ek;

                  return (
                    <div key={ek} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-[11px] font-mono text-muted-foreground w-36 shrink-0 truncate" title={row.Key}>
                        {row.Key}
                      </span>
                      <Input
                        value={currentValue}
                        onChange={(e) => onEditChange(ek, e.target.value)}
                        className="h-6 text-[11px] font-mono flex-1"
                      />
                      <Badge variant="outline" className="text-[8px] shrink-0 w-12 justify-center">
                        {row.ValueType}
                      </Badge>
                      {isDirty && (
                        <Button variant="ghost" size="sm" onClick={() => onSave(row)} disabled={isSaving} className="h-6 w-6 p-0">
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </>
  );
}
