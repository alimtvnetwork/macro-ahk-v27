/**
 * Marco Extension — Recorder Step Handler
 *
 * Phase 09 — Macro Recorder.
 *
 * Background-side message handlers for Step + Selector persistence and
 * deterministic replay-XPath resolution.
 *
 * Messages:
 *   - RECORDER_STEP_INSERT   → insert one Step + 1..N Selectors.
 *   - RECORDER_STEP_LIST     → list every Step in the project, ordered by
 *                              `OrderIndex` ASC.
 *   - RECORDER_STEP_DELETE   → cascade-delete a Step (Selectors and
 *                              FieldBindings drop via FK).
 *   - RECORDER_STEP_RESOLVE  → return the deterministic XPath/Css/Aria
 *                              expression that the replay engine should
 *                              evaluate for the given StepId.
 *
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    insertStep,
    listSteps,
    listSelectors,
    deleteStep,
    updateStepVariableName,
    type PersistedStep,
    type PersistedSelector,
    type StepDraft,
} from "../recorder/step-persistence";
import {
    updateStepMeta,
    setStepTags,
    setStepLink,
    type StepMetaPatch,
    type StepLinkSlot,
} from "../recorder/step-chain-persistence";
import {
    resolveStepSelector,
    type ResolvedSelector,
} from "../recorder/replay-resolver";

interface InsertRequest {
    projectSlug: string;
    draft: StepDraft;
}

interface ListRequest {
    projectSlug: string;
}

interface DeleteRequest {
    projectSlug: string;
    stepId: number;
}

interface ResolveRequest {
    projectSlug: string;
    stepId: number;
}

/* ------------------------------------------------------------------ */
/*  Insert                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepInsert(
    message: MessageRequest,
): Promise<{
    isOk: true;
    step: PersistedStep;
    selectors: ReadonlyArray<PersistedSelector>;
}> {
    const req = message as unknown as InsertRequest;
    if (!req.projectSlug || !req.draft) {
        throw new Error("RECORDER_STEP_INSERT requires projectSlug and draft");
    }
    const { step, selectors } = await insertStep(req.projectSlug, req.draft);
    return { isOk: true, step, selectors };
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepList(
    message: MessageRequest,
): Promise<{ steps: ReadonlyArray<PersistedStep> }> {
    const req = message as unknown as ListRequest;
    if (!req.projectSlug) {
        throw new Error("RECORDER_STEP_LIST requires projectSlug");
    }
    const steps = await listSteps(req.projectSlug);
    return { steps };
}

/* ------------------------------------------------------------------ */
/*  Selectors-for-step list                                            */
/* ------------------------------------------------------------------ */

interface SelectorsListRequest {
    projectSlug: string;
    stepId: number;
}

export async function handleRecorderStepSelectorsList(
    message: MessageRequest,
): Promise<{ selectors: ReadonlyArray<PersistedSelector> }> {
    const req = message as unknown as SelectorsListRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error(
            "RECORDER_STEP_SELECTORS_LIST requires projectSlug and stepId",
        );
    }
    const selectors = await listSelectors(req.projectSlug, req.stepId);
    return { selectors };
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const req = message as unknown as DeleteRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error("RECORDER_STEP_DELETE requires projectSlug and stepId");
    }
    await deleteStep(req.projectSlug, req.stepId);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Resolve (replay contract)                                          */
/* ------------------------------------------------------------------ */

export async function handleRecorderStepResolve(
    message: MessageRequest,
): Promise<{ resolved: ResolvedSelector }> {
    const req = message as unknown as ResolveRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error("RECORDER_STEP_RESOLVE requires projectSlug and stepId");
    }
    const selectors = await listSelectors(req.projectSlug, req.stepId);
    if (selectors.length === 0) {
        throw new Error(`Step ${req.stepId} has no selectors persisted`);
    }
    const resolved = resolveStepSelector(selectors);
    return { resolved };
}

/* ------------------------------------------------------------------ */
/*  Rename (variable name change)                                      */
/* ------------------------------------------------------------------ */

interface RenameRequest {
    projectSlug: string;
    stepId: number;
    newVariableName: string;
}

export async function handleRecorderStepRename(
    message: MessageRequest,
): Promise<{ isOk: true; step: PersistedStep }> {
    const req = message as unknown as RenameRequest;
    if (!req.projectSlug || typeof req.stepId !== "number" || !req.newVariableName) {
        throw new Error(
            "RECORDER_STEP_RENAME requires projectSlug, stepId, and newVariableName",
        );
    }
    const step = await updateStepVariableName(
        req.projectSlug,
        req.stepId,
        req.newVariableName,
    );
    return { isOk: true, step };
}

/* ------------------------------------------------------------------ */
/*  Phase 14 — Meta patch / Tags / Cross-project link                  */
/* ------------------------------------------------------------------ */

interface UpdateMetaRequest {
    projectSlug: string;
    stepId: number;
    patch: StepMetaPatch;
}

export async function handleRecorderStepUpdateMeta(
    message: MessageRequest,
): Promise<{ isOk: true; step: PersistedStep }> {
    const req = message as unknown as UpdateMetaRequest;
    if (!req.projectSlug || typeof req.stepId !== "number" || !req.patch) {
        throw new Error("RECORDER_STEP_UPDATE_META requires projectSlug, stepId, patch");
    }
    const step = await updateStepMeta(req.projectSlug, req.stepId, req.patch);
    return { isOk: true, step };
}

interface TagsSetRequest {
    projectSlug: string;
    stepId: number;
    tags: ReadonlyArray<string>;
}

export async function handleRecorderStepTagsSet(
    message: MessageRequest,
): Promise<{ isOk: true; tags: ReadonlyArray<string> }> {
    const req = message as unknown as TagsSetRequest;
    if (!req.projectSlug || typeof req.stepId !== "number" || !Array.isArray(req.tags)) {
        throw new Error("RECORDER_STEP_TAGS_SET requires projectSlug, stepId, tags[]");
    }
    const tags = await setStepTags(req.projectSlug, req.stepId, req.tags);
    return { isOk: true, tags };
}

interface LinkSetRequest {
    projectSlug: string;
    stepId: number;
    slot: StepLinkSlot;
    targetProjectSlug: string | null;
}

export async function handleRecorderStepLinkSet(
    message: MessageRequest,
): Promise<{ isOk: true; step: PersistedStep }> {
    const req = message as unknown as LinkSetRequest;
    const okSlot = req.slot === "OnSuccessProjectId" || req.slot === "OnFailureProjectId";
    if (!req.projectSlug || typeof req.stepId !== "number" || !okSlot) {
        throw new Error(
            "RECORDER_STEP_LINK_SET requires projectSlug, stepId, slot in {OnSuccessProjectId|OnFailureProjectId}",
        );
    }
    const step = await setStepLink(req.projectSlug, req.stepId, req.slot, req.targetProjectSlug ?? null);
    return { isOk: true, step };
}
