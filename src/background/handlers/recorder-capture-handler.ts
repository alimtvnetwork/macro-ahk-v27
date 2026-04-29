/**
 * Marco Extension — Recorder Capture Handler
 *
 * Phase 06↔09 wiring.
 *
 * Receives `RECORDER_CAPTURE_PERSIST` messages forwarded from the content
 * script's `XPATH_CAPTURED` event, resolves the active recording project
 * from `recorder-session-storage`, looks up an anchor `Selector` row when
 * the capture produced a relative XPath, builds a `StepDraft` via the
 * `capture-to-step-bridge`, and persists through `insertStep`.
 *
 * Messages:
 *   - RECORDER_CAPTURE_PERSIST → returns { isOk, step, selectors }
 *
 * @see ./recorder/capture-to-step-bridge.ts — pure converter
 * @see ./recorder/step-persistence.ts        — Step + Selector rows
 * @see spec/31-macro-recorder/13-capture-to-step-bridge.md
 */

import type { MessageRequest } from "../../shared/messages";
import { initProjectDb } from "../project-db-manager";
import { loadSession } from "../recorder/recorder-session-storage";
import {
    buildStepDraftFromCapture,
    findAnchorSelectorId,
    type XPathCapturePayload,
} from "../recorder/capture-to-step-bridge";
import {
    insertStep,
    type PersistedSelector,
    type PersistedStep,
} from "../recorder/step-persistence";

interface CaptureRequest {
    /** Optional override; falls back to the active session's ProjectSlug. */
    projectSlug?: string;
    payload: XPathCapturePayload;
}

export async function handleRecorderCapturePersist(
    message: MessageRequest,
): Promise<{
    isOk: true;
    step: PersistedStep;
    selectors: ReadonlyArray<PersistedSelector>;
}> {
    const req = message as unknown as CaptureRequest;
    if (!req.payload || typeof req.payload.XPathFull !== "string") {
        throw new Error(
            "RECORDER_CAPTURE_PERSIST requires payload.XPathFull (string)",
        );
    }

    const projectSlug = await resolveProjectSlug(req.projectSlug);

    let anchorSelectorId: number | null = null;
    if (req.payload.XPathRelative !== null && req.payload.AnchorXPath !== null) {
        const mgr = await initProjectDb(projectSlug);
        anchorSelectorId = findAnchorSelectorId(
            mgr.getDb(),
            req.payload.AnchorXPath,
        );
    }

    const draft = buildStepDraftFromCapture(req.payload, anchorSelectorId);
    const { step, selectors } = await insertStep(projectSlug, draft);
    return { isOk: true, step, selectors };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function resolveProjectSlug(override?: string): Promise<string> {
    if (override && override.length > 0) return override;
    const session = await loadSession();
    if (session === null || session.Phase === "Idle") {
        throw new Error(
            "RECORDER_CAPTURE_PERSIST: no active recording session — start the recorder first",
        );
    }
    if (!session.ProjectSlug) {
        throw new Error(
            "RECORDER_CAPTURE_PERSIST: active session has empty ProjectSlug",
        );
    }
    return session.ProjectSlug;
}
