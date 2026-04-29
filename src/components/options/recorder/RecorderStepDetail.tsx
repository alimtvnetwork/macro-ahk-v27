/**
 * Marco Extension — Recorder Step Detail (Phase 10 + 14)
 *
 * Right-pane detail view for one selected Step:
 *   - Variable rename (PascalCase free-text, server enforces uniqueness)
 *   - Description / tag chips / cross-project links (Phase 14)
 *   - Persisted Selector rows (primary highlighted)
 *   - Bound DataSource column (if any)
 *
 * All edits route to handlers passed by `RecorderVisualisationPanel`, which
 * in turn use the hook's local-state splice helpers — so the row re-renders
 * with the latest Description, tags, and link targets without a full reload.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";
import type {
    StepRow,
    SelectorRow,
    DataSourceRow,
    FieldBindingRow,
    StepLinkSlot,
} from "@/hooks/use-recorder-project-data";

const SELECTOR_KIND_LABEL: Record<number, string> = {
    1: "XPathFull",
    2: "XPathRelative",
    3: "Css",
    4: "Aria",
};

interface Props {
    step: StepRow;
    selectors: ReadonlyArray<SelectorRow>;
    dataSources: ReadonlyArray<DataSourceRow>;
    bindings: ReadonlyArray<FieldBindingRow>;
    /** Cached tag list for this step (from the hook). */
    tags: ReadonlyArray<string>;
    onRename: (stepId: number, newName: string) => Promise<void>;
    onDescriptionSave: (stepId: number, description: string | null) => Promise<void>;
    onTagsSave: (stepId: number, tags: ReadonlyArray<string>) => Promise<void>;
    onLinkChange: (
        stepId: number,
        slot: StepLinkSlot,
        targetProjectSlug: string | null,
    ) => Promise<void>;
}

export function RecorderStepDetail({
    step,
    selectors,
    dataSources,
    bindings,
    tags,
    onRename,
    onDescriptionSave,
    onTagsSave,
    onLinkChange,
}: Props) {
    const [draftName, setDraftName] = useState(step.VariableName);
    const [renameError, setRenameError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [draftDesc, setDraftDesc] = useState(step.Description ?? "");
    const [descSaving, setDescSaving] = useState(false);
    const [descError, setDescError] = useState<string | null>(null);

    const [draftTag, setDraftTag] = useState("");
    const [tagsError, setTagsError] = useState<string | null>(null);

    const [linkError, setLinkError] = useState<string | null>(null);

    useEffect(() => {
        setDraftName(step.VariableName);
        setRenameError(null);
        setDraftDesc(step.Description ?? "");
        setDescError(null);
        setDraftTag("");
        setTagsError(null);
        setLinkError(null);
    }, [step.StepId, step.VariableName, step.Description]);

    const isDirty = draftName !== step.VariableName;
    const isDescDirty = draftDesc !== (step.Description ?? "");
    const binding = bindings.find((b) => b.StepId === step.StepId) ?? null;
    const boundDs = binding ? dataSources.find((d) => d.DataSourceId === binding.DataSourceId) : null;

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        setRenameError(null);
        try {
            await onRename(step.StepId, draftName.trim());
        } catch (err) {
            setRenameError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDescSave = async () => {
        if (!isDescDirty) return;
        setDescSaving(true);
        setDescError(null);
        try {
            const trimmed = draftDesc.trim();
            await onDescriptionSave(step.StepId, trimmed.length === 0 ? null : trimmed);
        } catch (err) {
            setDescError(err instanceof Error ? err.message : String(err));
        } finally {
            setDescSaving(false);
        }
    };

    const handleAddTag = async () => {
        const next = draftTag.trim();
        if (next.length === 0) return;
        if (tags.includes(next)) {
            setDraftTag("");
            return;
        }
        setTagsError(null);
        try {
            await onTagsSave(step.StepId, [...tags, next]);
            setDraftTag("");
        } catch (err) {
            setTagsError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleRemoveTag = async (name: string) => {
        setTagsError(null);
        try {
            await onTagsSave(step.StepId, tags.filter((t) => t !== name));
        } catch (err) {
            setTagsError(err instanceof Error ? err.message : String(err));
        }
    };

    const handleLinkSave = async (slot: StepLinkSlot, raw: string) => {
        setLinkError(null);
        try {
            const trimmed = raw.trim();
            await onLinkChange(step.StepId, slot, trimmed.length === 0 ? null : trimmed);
        } catch (err) {
            setLinkError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <div className="space-y-4">
            {/* Identity */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Variable
                </h3>
                <div className="flex gap-2">
                    <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="font-mono text-sm h-8"
                    />
                    <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
                        {isSaving ? "Saving…" : "Rename"}
                    </Button>
                </div>
                {renameError && (
                    <p className="text-xs text-destructive font-mono">{renameError}</p>
                )}
                <div className="text-[10px] text-muted-foreground font-mono">
                    StepId={step.StepId} • OrderIndex={step.OrderIndex} • Captured {step.CapturedAt}
                </div>
            </section>

            {/* Description (Phase 14) */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Description
                </h3>
                <Textarea
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    rows={2}
                    placeholder="Optional notes about this step…"
                    className="text-xs"
                />
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDescSave}
                        disabled={!isDescDirty || descSaving}
                    >
                        {descSaving ? "Saving…" : "Save description"}
                    </Button>
                    {descError && (
                        <span className="text-xs text-destructive font-mono">{descError}</span>
                    )}
                </div>
            </section>

            {/* Tags (Phase 14) */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Tags ({tags.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                    {tags.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">No tags.</span>
                    )}
                    {tags.map((t) => (
                        <Badge
                            key={t}
                            variant="secondary"
                            className="gap-1 pl-2 pr-1 py-0.5 text-[10px] font-mono"
                        >
                            {t}
                            <button
                                type="button"
                                onClick={() => void handleRemoveTag(t)}
                                aria-label={`Remove tag ${t}`}
                                className="hover:text-destructive"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input
                        value={draftTag}
                        onChange={(e) => setDraftTag(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleAddTag();
                            }
                        }}
                        placeholder="Add tag…"
                        className="font-mono text-xs h-8"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddTag}
                        disabled={draftTag.trim().length === 0}
                    >
                        Add
                    </Button>
                </div>
                {tagsError && (
                    <p className="text-xs text-destructive font-mono">{tagsError}</p>
                )}
            </section>

            {/* Cross-project links (Phase 14) */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Cross-project links
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <LinkSlotEditor
                        label="On success → project"
                        initialValue={step.OnSuccessProjectId ?? ""}
                        onSave={(v) => handleLinkSave("OnSuccessProjectId", v)}
                    />
                    <LinkSlotEditor
                        label="On failure → project"
                        initialValue={step.OnFailureProjectId ?? ""}
                        onSave={(v) => handleLinkSave("OnFailureProjectId", v)}
                    />
                </div>
                {linkError && (
                    <p className="text-xs text-destructive font-mono">{linkError}</p>
                )}
            </section>

            {/* Selectors */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Selectors ({selectors.length})
                </h3>
                {selectors.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No selectors persisted.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {selectors.map((sel) => (
                            <li
                                key={sel.SelectorId}
                                className={`rounded-md border px-2.5 py-2 text-xs space-y-1 ${
                                    sel.IsPrimary === 1
                                        ? "border-primary/60 bg-primary/5"
                                        : "border-border bg-card"
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                                        {SELECTOR_KIND_LABEL[sel.SelectorKindId] ?? `Kind${sel.SelectorKindId}`}
                                    </Badge>
                                    {sel.IsPrimary === 1 && (
                                        <Badge className="text-[10px] py-0 px-1.5 bg-primary text-primary-foreground">
                                            Primary
                                        </Badge>
                                    )}
                                    {sel.AnchorSelectorId !== null && (
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            anchor=#{sel.AnchorSelectorId}
                                        </span>
                                    )}
                                </div>
                                <code className="block font-mono text-[11px] break-all text-foreground/90">
                                    {sel.Expression}
                                </code>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Field binding */}
            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Field Binding
                </h3>
                {binding === null ? (
                    <p className="text-xs text-muted-foreground italic">
                        No data-source column bound to this step.
                    </p>
                ) : (
                    <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs space-y-1">
                        <div className="font-mono">
                            <span className="text-primary">{`{{${binding.ColumnName}}}`}</span>{" "}
                            <span className="text-muted-foreground">→</span>{" "}
                            <span>{boundDs?.FilePath ?? `DataSourceId=${binding.DataSourceId}`}</span>
                        </div>
                        {boundDs && (
                            <div className="text-[10px] text-muted-foreground">
                                Columns: {boundDs.Columns.join(", ")} • Rows: {boundDs.RowCount}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  LinkSlotEditor — small inline input for one cross-project slot     */
/* ------------------------------------------------------------------ */

interface LinkSlotEditorProps {
    label: string;
    initialValue: string;
    onSave: (value: string) => Promise<void>;
}

function LinkSlotEditor({ label, initialValue, onSave }: LinkSlotEditorProps) {
    const [draft, setDraft] = useState(initialValue);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(initialValue);
    }, [initialValue]);

    const isDirty = draft !== initialValue;

    const handleClick = async () => {
        if (!isDirty) return;
        setSaving(true);
        try {
            await onSave(draft);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </label>
            <div className="flex gap-1.5">
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="project-slug or empty"
                    className="font-mono text-xs h-8"
                />
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClick}
                    disabled={!isDirty || saving}
                >
                    {saving ? "…" : "Save"}
                </Button>
            </div>
        </div>
    );
}
