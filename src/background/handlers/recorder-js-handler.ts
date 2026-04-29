/**
 * Marco Extension — JsSnippet + JsInline Step Dry-Run Handler
 *
 * Phase 11 — Macro Recorder.
 *
 * Background-side message handlers for:
 *   - RECORDER_JS_SNIPPET_UPSERT  → create / update a named snippet.
 *   - RECORDER_JS_SNIPPET_LIST    → list every snippet (Name ASC).
 *   - RECORDER_JS_SNIPPET_DELETE  → drop one by JsSnippetId.
 *   - RECORDER_JS_STEP_DRYRUN     → validate + execute an InlineJs body
 *     against a caller-supplied Row/Vars context. Used by the editor's
 *     "Test snippet" button. Does NOT touch persistence.
 *
 * @see spec/31-macro-recorder/11-inline-javascript-step.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    upsertJsSnippet,
    listJsSnippets,
    deleteJsSnippet,
    type JsSnippetRow,
} from "../recorder/js-snippet-persistence";
import {
    executeJsBody,
    type JsInlineContext,
    type JsInlineResult,
} from "../recorder/js-step-sandbox";

interface UpsertRequest {
    projectSlug: string;
    draft: { Name: string; Description: string; Body: string };
}

interface ListRequest {
    projectSlug: string;
}

interface DeleteRequest {
    projectSlug: string;
    jsSnippetId: number;
}

interface DryRunRequest {
    body: string;
    context: JsInlineContext;
}

export async function handleRecorderJsSnippetUpsert(
    message: MessageRequest,
): Promise<{ isOk: true; snippet: JsSnippetRow }> {
    const req = message as unknown as UpsertRequest;
    if (!req.projectSlug || !req.draft) {
        throw new Error(
            "RECORDER_JS_SNIPPET_UPSERT requires projectSlug and draft",
        );
    }
    const snippet = await upsertJsSnippet(req.projectSlug, req.draft);
    return { isOk: true, snippet };
}

export async function handleRecorderJsSnippetList(
    message: MessageRequest,
): Promise<{ snippets: ReadonlyArray<JsSnippetRow> }> {
    const req = message as unknown as ListRequest;
    if (!req.projectSlug) {
        throw new Error("RECORDER_JS_SNIPPET_LIST requires projectSlug");
    }
    const snippets = await listJsSnippets(req.projectSlug);
    return { snippets };
}

export async function handleRecorderJsSnippetDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const req = message as unknown as DeleteRequest;
    if (!req.projectSlug || typeof req.jsSnippetId !== "number") {
        throw new Error(
            "RECORDER_JS_SNIPPET_DELETE requires projectSlug and jsSnippetId",
        );
    }
    await deleteJsSnippet(req.projectSlug, req.jsSnippetId);
    return { isOk: true };
}

export async function handleRecorderJsStepDryRun(
    message: MessageRequest,
): Promise<{ isOk: true; result: JsInlineResult }> {
    const req = message as unknown as DryRunRequest;
    if (typeof req.body !== "string" || !req.context) {
        throw new Error(
            "RECORDER_JS_STEP_DRYRUN requires body and context",
        );
    }
    const result = await executeJsBody(req.body, req.context);
    return { isOk: true, result };
}
