/**
 * Marco Extension — Recorder Visualisation Panel (Phase 10)
 *
 * Project-scoped tab that visualises persisted Macro Recorder data:
 *   - Step graph (left rail) — ordered list of `Step` rows
 *   - Detail panel (right) — selectors, field binding, variable rename
 *   - Data Source summary chips
 *
 * All data flows through `useRecorderProjectData(projectSlug)` which calls
 * the existing `RECORDER_STEP_LIST`, `RECORDER_DATA_SOURCE_LIST`, and
 * `RECORDER_FIELD_BINDING_LIST` background handlers (Phases 07-09).
 *
 * @see spec/31-macro-recorder/10-project-visualisation.md
 */

import { useCallback, useEffect, useState } from "react";
import {
    useRecorderProjectData,
    type SelectorRow,
} from "@/hooks/use-recorder-project-data";
import { sendMessage } from "@/lib/message-client";
import { RecorderStepGraph } from "./RecorderStepGraph";
import { RecorderStepDetail } from "./RecorderStepDetail";
import { Loader2, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
    projectSlug: string;
}

export default function RecorderVisualisationPanel({ projectSlug }: Props) {
    const {
        data,
        loading,
        error,
        reload,
        loadSelectors,
        tagsByStep,
        updateStepMeta,
        setStepTags,
        setStepLink,
    } = useRecorderProjectData(projectSlug);
    const [selectedStepId, setSelectedStepId] = useState<number | null>(null);
    const [selectors, setSelectors] = useState<ReadonlyArray<SelectorRow>>([]);
    const [selectorsLoading, setSelectorsLoading] = useState(false);

    /* Auto-select the first Step when data loads / refreshes. */
    useEffect(() => {
        if (data === null || data.steps.length === 0) {
            setSelectedStepId(null);
            return;
        }
        const stillExists = data.steps.some((s) => s.StepId === selectedStepId);
        if (!stillExists) {
            setSelectedStepId(data.steps[0].StepId);
        }
    }, [data, selectedStepId]);

    /* Refetch selectors whenever the active step changes. */
    useEffect(() => {
        if (selectedStepId === null) {
            setSelectors([]);
            return;
        }
        let cancelled = false;
        setSelectorsLoading(true);
        loadSelectors(selectedStepId)
            .then((rows) => {
                if (!cancelled) setSelectors(rows);
            })
            .finally(() => {
                if (!cancelled) setSelectorsLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedStepId, loadSelectors]);

    const handleRename = useCallback(
        async (stepId: number, newName: string) => {
            await sendMessage({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: "RECORDER_STEP_RENAME" as any,
                projectSlug,
                stepId,
                newVariableName: newName,
            });
            toast.success(`Renamed step #${stepId} → ${newName}`);
            await reload();
        },
        [projectSlug, reload],
    );

    const handleDelete = useCallback(
        async (stepId: number) => {
            const confirmed = confirm(`Delete step #${stepId}? This cannot be undone.`);
            if (!confirmed) return;
            try {
                await sendMessage({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    type: "RECORDER_STEP_DELETE" as any,
                    projectSlug,
                    stepId,
                });
                toast.success("Step deleted");
                await reload();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete step");
            }
        },
        [projectSlug, reload],
    );

    /* -------- Phase 14 — meta / tags / link refreshers --------------- */

    const handleDescriptionSave = useCallback(
        async (stepId: number, description: string | null) => {
            try {
                await updateStepMeta(stepId, { Description: description });
                toast.success("Description updated");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to update description");
                throw err;
            }
        },
        [updateStepMeta],
    );

    const handleTagsSave = useCallback(
        async (stepId: number, tags: ReadonlyArray<string>) => {
            try {
                await setStepTags(stepId, tags);
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to update tags");
                throw err;
            }
        },
        [setStepTags],
    );

    const handleLinkChange = useCallback(
        async (
            stepId: number,
            slot: "OnSuccessProjectId" | "OnFailureProjectId",
            targetProjectSlug: string | null,
        ) => {
            try {
                await setStepLink(stepId, slot, targetProjectSlug);
                toast.success(
                    targetProjectSlug === null
                        ? `${slot} cleared`
                        : `${slot} → ${targetProjectSlug}`,
                );
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to update link");
                throw err;
            }
        },
        [setStepLink],
    );

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading recorder data…
            </div>
        );
    }
    if (error) {
        return (
            <div className="text-xs text-destructive p-4 border border-destructive/40 rounded-md bg-destructive/5 font-mono">
                {error}
            </div>
        );
    }
    if (data === null) return null;

    const selectedStep = data.steps.find((s) => s.StepId === selectedStepId) ?? null;

    return (
        <div className="space-y-4">
            {/* Data sources summary */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Data Sources:
                </span>
                {data.dataSources.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">none attached</span>
                ) : (
                    data.dataSources.map((ds) => (
                        <Badge key={ds.DataSourceId} variant="outline" className="gap-1.5 font-mono text-[10px]">
                            <Database className="h-3 w-3" />
                            {ds.FilePath} · {ds.RowCount}r × {ds.Columns.length}c
                        </Badge>
                    ))
                )}
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_2fr] gap-4">
                <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Steps ({data.steps.length})
                    </h3>
                    <RecorderStepGraph
                        steps={data.steps}
                        selectedStepId={selectedStepId}
                        onSelect={setSelectedStepId}
                        onDelete={handleDelete}
                    />
                </div>
                <div className="border border-border rounded-md bg-card/50 p-4">
                    {selectedStep === null ? (
                        <p className="text-xs text-muted-foreground italic">
                            Select a step from the list to inspect its selectors and binding.
                        </p>
                    ) : selectorsLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading selectors…
                        </div>
                    ) : (
                        <RecorderStepDetail
                            step={selectedStep}
                            selectors={selectors}
                            dataSources={data.dataSources}
                            bindings={data.bindings}
                            tags={tagsByStep.get(selectedStep.StepId) ?? []}
                            onRename={handleRename}
                            onDescriptionSave={handleDescriptionSave}
                            onTagsSave={handleTagsSave}
                            onLinkChange={handleLinkChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
