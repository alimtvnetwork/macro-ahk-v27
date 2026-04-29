/**
 * Marco Extension — Field Binding Handler
 *
 * Phase 08 — Macro Recorder.
 *
 * Background-side message handlers for the field-binding subsystem:
 *   - RECORDER_FIELD_BINDING_UPSERT: validate column + insert/replace
 *     `FieldBinding` row keyed by `StepId`.
 *   - RECORDER_FIELD_BINDING_LIST: list every binding for the project.
 *   - RECORDER_FIELD_BINDING_DELETE: remove the binding for one Step.
 *
 * @see spec/31-macro-recorder/08-field-reference-wrapper.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    upsertFieldBinding,
    listFieldBindings,
    deleteFieldBinding,
    type PersistedFieldBinding,
} from "../recorder/field-binding-persistence";

interface UpsertRequest {
    projectSlug: string;
    stepId: number;
    dataSourceId: number;
    columnName: string;
}

interface ListRequest {
    projectSlug: string;
}

interface DeleteRequest {
    projectSlug: string;
    stepId: number;
}

/* ------------------------------------------------------------------ */
/*  Upsert                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderFieldBindingUpsert(
    message: MessageRequest,
): Promise<{ isOk: true; binding: PersistedFieldBinding }> {
    const req = message as unknown as UpsertRequest;
    validateUpsertRequest(req);

    const binding = await upsertFieldBinding(
        req.projectSlug,
        req.stepId,
        req.dataSourceId,
        req.columnName,
    );
    return { isOk: true, binding };
}

function validateUpsertRequest(req: UpsertRequest): void {
    const missing =
        !req.projectSlug ||
        typeof req.stepId !== "number" ||
        typeof req.dataSourceId !== "number" ||
        !req.columnName;

    if (missing) {
        throw new Error(
            "RECORDER_FIELD_BINDING_UPSERT requires projectSlug, stepId, dataSourceId, columnName",
        );
    }
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function handleRecorderFieldBindingList(
    message: MessageRequest,
): Promise<{ bindings: ReadonlyArray<PersistedFieldBinding> }> {
    const req = message as unknown as ListRequest;
    if (!req.projectSlug) {
        throw new Error("RECORDER_FIELD_BINDING_LIST requires projectSlug");
    }
    const bindings = await listFieldBindings(req.projectSlug);
    return { bindings };
}

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

export async function handleRecorderFieldBindingDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const req = message as unknown as DeleteRequest;
    if (!req.projectSlug || typeof req.stepId !== "number") {
        throw new Error(
            "RECORDER_FIELD_BINDING_DELETE requires projectSlug and stepId",
        );
    }
    await deleteFieldBinding(req.projectSlug, req.stepId);
    return { isOk: true };
}
