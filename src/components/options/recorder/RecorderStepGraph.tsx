/**
 * Marco Extension — Recorder Step Graph (Phase 10)
 *
 * Left-rail vertical list of persisted Steps for one project, ordered by
 * `OrderIndex` ASC. Selecting a row notifies the parent which renders the
 * detail panel. Pure presentational — all data fetching lives in the
 * parent's `useRecorderProjectData` hook.
 */

import { useMemo } from "react";
import type { StepRow } from "@/hooks/use-recorder-project-data";
import { Button } from "@/components/ui/button";
import { ChevronRight, Trash2 } from "lucide-react";
import {
    buildExecutionNextPreview,
    type ProjectSummary,
    type StepLinks,
} from "@/background/recorder/execution-next-preview";
import { ExecutionNextBadge } from "@/components/recorder/ExecutionNextBadge";

const STEP_KIND_LABEL: Record<number, string> = {
    1: "Click",
    2: "Type",
    3: "Select",
    4: "JsInline",
    5: "Wait",
};

interface Props {
    steps: ReadonlyArray<StepRow>;
    selectedStepId: number | null;
    onSelect: (stepId: number) => void;
    onDelete: (stepId: number) => void;
    /** Optional cross-project links per StepId (Phase 14). */
    links?: ReadonlyMap<number, StepLinks>;
    /** Optional project lookup so links render the friendly name. */
    projects?: ReadonlyMap<string, ProjectSummary>;
}

export function RecorderStepGraph({ steps, selectedStepId, onSelect, onDelete, links, projects }: Props) {
    const previewByStepId = useMemo(() => {
        const list = buildExecutionNextPreview({
            steps: steps.map((s) => ({
                StepId: s.StepId,
                OrderIndex: s.OrderIndex,
                VariableName: s.VariableName,
                Label: s.Label,
            })),
            links,
            projects,
        });
        return new Map(list.map((p) => [p.StepId, p]));
    }, [steps, links, projects]);

    if (steps.length === 0) {
        return (
            <div className="text-xs text-muted-foreground p-4 border border-dashed border-border rounded-md">
                No recorded steps yet. Use the recorder shortcut
                (<kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl/Cmd+Shift+R</kbd>)
                to start capturing.
            </div>
        );
    }

    return (
        <ol className="space-y-1">
            {steps.map((step) => {
                const isSelected = step.StepId === selectedStepId;
                const preview = previewByStepId.get(step.StepId);
                return (
                    <li key={step.StepId}>
                        <div
                            className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                                isSelected
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-card hover:bg-primary/5"
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => onSelect(step.StepId)}
                                className="flex-1 flex items-center gap-2 text-left"
                            >
                                <span className="font-mono text-[10px] text-muted-foreground w-6 shrink-0">
                                    {step.OrderIndex}
                                </span>
                                <span className="font-mono text-primary shrink-0 w-16 truncate">
                                    {STEP_KIND_LABEL[step.StepKindId] ?? `Kind${step.StepKindId}`}
                                </span>
                                <span className="font-medium truncate">{step.VariableName}</span>
                                <span className="text-muted-foreground truncate">— {step.Label}</span>
                                <ChevronRight className="h-3 w-3 ml-auto shrink-0 text-muted-foreground" />
                            </button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={() => onDelete(step.StepId)}
                                title="Delete step"
                            >
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                        </div>
                        {preview !== undefined && <ExecutionNextBadge preview={preview} />}
                    </li>
                );
            })}
        </ol>
    );
}
