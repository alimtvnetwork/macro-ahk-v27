/**
 * ChainBuilder — Spec 21
 *
 * Visual editor for creating/editing automation chains.
 * Supports dragging steps between top-level, condition-then, and condition-else.
 */

import { useState, useMemo, useCallback } from "react";
import type { AutomationChain, ChainStep, StepCondition, TriggerType, TriggerConfig as TriggerConfigType } from "@/lib/automation-types";
import { createDefaultStep, STEP_TYPE_META } from "@/lib/automation-types";
import type { FlattenedStep } from "@/lib/automation-types";
import { StepCard } from "./StepCard";
import { TriggerConfigPanel } from "./TriggerConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

/* ------------------------------------------------------------------ */
/*  Path-based step location                                           */
/* ------------------------------------------------------------------ */

interface StepLocation {
  /** "top" | "then" | "else" */
  container: "top" | "then" | "else";
  /** For then/else: the top-level index of the parent condition */
  conditionIndex?: number;
  /** Index within the container array */
  index: number;
}

/** Encode a location to a sortable ID string */
function encodeId(loc: StepLocation): string {
  if (loc.container === "top") return `top-${loc.index}`;
  return `cond-${loc.conditionIndex}-${loc.container}-${loc.index}`;
}

/** Decode a sortable ID back to a location */
function decodeId(id: string): StepLocation | null {
  const topMatch = id.match(/^top-(\d+)$/);
  if (topMatch) return { container: "top", index: Number(topMatch[1]) };

  const branchMatch = id.match(/^cond-(\d+)-(then|else)-(\d+)$/);
  if (branchMatch) {
    return {
      container: branchMatch[2] as "then" | "else",
      conditionIndex: Number(branchMatch[1]),
      index: Number(branchMatch[3]),
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Build flat list with path-based IDs                                */
/* ------------------------------------------------------------------ */

interface DisplayStep {
  flatStep: FlattenedStep;
  sortableId: string;
  location: StepLocation;
}

function buildDisplaySteps(steps: ChainStep[]): DisplayStep[] {
  const result: DisplayStep[] = [];
  steps.forEach((step, topIdx) => {
    const loc: StepLocation = { container: "top", index: topIdx };
    result.push({
      flatStep: { step, depth: 0 },
      sortableId: encodeId(loc),
      location: loc,
    });
    if (step.type === "condition") {
      step.then.forEach((s, i) => {
        const thenLoc: StepLocation = { container: "then", conditionIndex: topIdx, index: i };
        result.push({
          flatStep: { step: s, depth: 1, branchLabel: "then" },
          sortableId: encodeId(thenLoc),
          location: thenLoc,
        });
      });
      step.else.forEach((s, i) => {
        const elseLoc: StepLocation = { container: "else", conditionIndex: topIdx, index: i };
        result.push({
          flatStep: { step: s, depth: 1, branchLabel: "else" },
          sortableId: encodeId(elseLoc),
          location: elseLoc,
        });
      });
    }
  });
  return result;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  chain?: AutomationChain;
  onSave: (chain: Partial<AutomationChain>) => void;
  onCancel: () => void;
}

// eslint-disable-next-line max-lines-per-function
export function ChainBuilder({ chain, onSave, onCancel }: Props) {
  const [name, setName] = useState(chain?.name ?? "");
  const [slug, setSlug] = useState(chain?.slug ?? "");
  const [steps, setSteps] = useState<ChainStep[]>(chain?.steps ?? []);
  const [triggerType, setTriggerType] = useState<TriggerType>(chain?.triggerType ?? "manual");
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigType>(chain?.triggerConfig ?? {});
  const [saving, setSaving] = useState(false);

  const displaySteps = useMemo(() => buildDisplaySteps(steps), [steps]);
  const allSortableIds = useMemo(() => displaySteps.map((d) => d.sortableId), [displaySteps]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const addStep = (type: ChainStep["type"]) => {
    setSteps([...steps, createDefaultStep(type)]);
  };

  /** Get a step from the steps array given a location */
  const getStepAtLocation = useCallback((loc: StepLocation, source: ChainStep[]): ChainStep | null => {
    if (loc.container === "top") return source[loc.index] ?? null;
    const parent = source[loc.conditionIndex!];
    if (!parent || parent.type !== "condition") return null;
    const branch = loc.container === "then" ? parent.then : parent.else;
    return branch[loc.index] ?? null;
  }, []);

  /** Remove a step at a location, returning [newSteps, removedStep] */
  const removeAtLocation = useCallback((loc: StepLocation, source: ChainStep[]): [ChainStep[], ChainStep] => {
    const newSteps = source.map((s) => s.type === "condition" ? { ...s, then: [...s.then], else: [...s.else] } : s);
    if (loc.container === "top") {
      const [removed] = newSteps.splice(loc.index, 1);
      return [newSteps, removed];
    }
    const parent = newSteps[loc.conditionIndex!] as StepCondition;
    const branch = loc.container === "then" ? parent.then : parent.else;
    const [removed] = branch.splice(loc.index, 1);
    return [newSteps, removed];
  }, []);

  /** Insert a step at a location */
  const insertAtLocation = useCallback((loc: StepLocation, step: ChainStep, target: ChainStep[]): ChainStep[] => {
    const newSteps = target.map((s) => s.type === "condition" ? { ...s, then: [...s.then], else: [...s.else] } : s);
    if (loc.container === "top") {
      newSteps.splice(loc.index, 0, step);
      return newSteps;
    }
    const parent = newSteps[loc.conditionIndex!] as StepCondition;
    const branch = loc.container === "then" ? parent.then : parent.else;
    branch.splice(loc.index, 0, step);
    return newSteps;
  }, []);

  const updateStepAtLocation = useCallback((loc: StepLocation, updated: ChainStep) => {
    setSteps((prev) => {
      const newSteps = prev.map((s) => s.type === "condition" ? { ...s, then: [...s.then], else: [...s.else] } : s);
      if (loc.container === "top") {
        newSteps[loc.index] = updated;
      } else {
        const parent = newSteps[loc.conditionIndex!] as StepCondition;
        const branch = loc.container === "then" ? parent.then : parent.else;
        branch[loc.index] = updated;
      }
      return newSteps;
    });
  }, []);

  const removeStepAtLocation = useCallback((loc: StepLocation) => {
    setSteps((prev) => removeAtLocation(loc, prev)[0]);
  }, [removeAtLocation]);

  const duplicateStepAtLocation = useCallback((loc: StepLocation) => {
    setSteps((prev) => {
      const newSteps = prev.map((s) => JSON.parse(JSON.stringify(s)) as ChainStep);
      if (loc.container === "top") {
        const clone = JSON.parse(JSON.stringify(newSteps[loc.index])) as ChainStep;
        newSteps.splice(loc.index + 1, 0, clone);
      } else {
        const parent = newSteps[loc.conditionIndex!];
        if (parent?.type === "condition") {
          const branch = loc.container === "then" ? parent.then : parent.else;
          const clone = JSON.parse(JSON.stringify(branch[loc.index])) as ChainStep;
          branch.splice(loc.index + 1, 0, clone);
        }
      }
      return newSteps;
    });
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromLoc = decodeId(String(active.id));
    const toLoc = decodeId(String(over.id));
    if (!fromLoc || !toLoc) return;

    // Same container → simple reorder
    if (
      fromLoc.container === toLoc.container &&
      fromLoc.conditionIndex === toLoc.conditionIndex
    ) {
      setSteps((prev) => {
        if (fromLoc.container === "top") {
          return arrayMove(prev, fromLoc.index, toLoc.index);
        }
        const newSteps = prev.map((s) =>
          s.type === "condition" ? { ...s, then: [...s.then], else: [...s.else] } : s,
        );
        const parent = newSteps[fromLoc.conditionIndex!] as StepCondition;
        const branch = fromLoc.container === "then" ? parent.then : parent.else;
        const reordered = arrayMove(branch, fromLoc.index, toLoc.index);
        if (fromLoc.container === "then") parent.then = reordered;
        else parent.else = reordered;
        return newSteps;
      });
      return;
    }

    // Cross-container move
    setSteps((prev) => {
      const [afterRemove, movedStep] = removeAtLocation(fromLoc, prev);
      // Adjust toLoc index if removal shifted indices in the same parent
      const adjustedTo = { ...toLoc };
      if (
        fromLoc.container === toLoc.container &&
        fromLoc.conditionIndex === toLoc.conditionIndex &&
        fromLoc.index < toLoc.index
      ) {
        adjustedTo.index--;
      }
      return insertAtLocation(adjustedTo, movedStep, afterRemove);
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Chain name is required"); return; }
    if (!slug.trim()) { toast.error("Chain slug is required"); return; }
    if (steps.length === 0) { toast.error("Add at least one step"); return; }

    setSaving(true);
    try {
      onSave({
        id: chain?.id,
        name: name.trim(),
        slug: slug.trim(),
        steps,
        triggerType,
        triggerConfig,
        enabled: chain?.enabled ?? true,
      });
      toast.success(chain ? "Chain updated" : "Chain created");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{chain ? "Edit Chain" : "New Automation Chain"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name + Slug */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Review Cycle" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Slug</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="full-review-cycle"
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {/* Trigger */}
        <TriggerConfigPanel triggerType={triggerType} triggerConfig={triggerConfig} onChange={(t, c) => { setTriggerType(t); setTriggerConfig(c); }} />

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Steps ({steps.length})</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add Step
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {(Object.keys(STEP_TYPE_META) as ChainStep["type"][]).map((type) => {
                  const meta = STEP_TYPE_META[type];
                  return (
                    <DropdownMenuItem key={type} onClick={() => addStep(type)} className="text-xs gap-2">
                      <span>{meta.icon}</span> {meta.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {displaySteps.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No steps yet. Click "Add Step" to begin building your chain.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {displaySteps.map((ds) => (
                  <StepCard
                    key={ds.sortableId}
                    flatStep={ds.flatStep}
                    index={displaySteps.indexOf(ds)}
                    total={displaySteps.length}
                    editing={true}
                    sortableId={ds.sortableId}
                    draggable={true}
                    onChange={(updated) => updateStepAtLocation(ds.location, updated)}
                    onRemove={() => removeStepAtLocation(ds.location)}
                    onDuplicate={() => duplicateStepAtLocation(ds.location)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save Chain"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1">
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
