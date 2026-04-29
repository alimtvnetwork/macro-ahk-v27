/**
 * Marco Extension — Capture → Step Persistence (with failure logging)
 *
 * Phase 06↔09 wiring layer that wraps `buildStepDraftFromCapture` +
 * `insertStep` with the shared {@link logFailure} contract. The bridge and
 * persistence modules stay pure and synchronous — this module is the
 * imperative seam where Record-phase failures (selector synthesis errors,
 * unique-name collisions, FK violations on anchor rows) get a structured
 * `[MarcoRecord]` report and a re-throw the caller can surface in a toast.
 *
 * @see ./failure-logger.ts        — Shared report shape.
 * @see ./capture-to-step-bridge.ts — Pure draft builder.
 * @see ./step-persistence.ts       — Async DB facade.
 * @see spec/03-error-manage/01-error-resolution/06-error-documentation-guideline.md
 */

import { initProjectDb } from "../project-db-manager";
import {
    buildStepDraftFromCapture,
    findAnchorSelectorId,
    type XPathCapturePayload,
} from "./capture-to-step-bridge";
import {
    insertStepRow,
    listSelectorsForStep,
    type PersistedSelector,
    type PersistedStep,
} from "./step-persistence";
import { logFailure, type FailureReport } from "./failure-logger";

const SOURCE_FILE = "src/background/recorder/capture-step-recorder.ts";

export interface CaptureStepResult {
    readonly Ok: boolean;
    readonly Step: PersistedStep | null;
    readonly Selectors: ReadonlyArray<PersistedSelector>;
    /** Populated only when `Ok === false`. */
    readonly FailureReport: FailureReport | null;
}

/**
 * Persists a captured step into the per-project DB. On failure, emits a
 * structured `[MarcoRecord]` report (console + returned `FailureReport`)
 * and resolves with `Ok=false` instead of throwing — the caller decides
 * whether to surface a toast or retry.
 */
export async function captureAndPersistStep(
    projectSlug: string,
    payload: XPathCapturePayload,
    now?: () => Date,
): Promise<CaptureStepResult> {
    let target: Element | null = null;
    if (typeof document !== "undefined") {
        target = locateCaptureTarget(payload.XPathFull);
    }

    try {
        const mgr = await initProjectDb(projectSlug);
        const db = mgr.getDb();

        const anchorId = payload.AnchorXPath !== null
            ? findAnchorSelectorId(db, payload.AnchorXPath)
            : null;

        const draft = buildStepDraftFromCapture(payload, anchorId);
        const step = insertStepRow(db, draft);
        const selectors = listSelectorsForStep(db, step.StepId);
        mgr.markDirty();

        return { Ok: true, Step: step, Selectors: selectors, FailureReport: null };
    } catch (err) {
        const report = logFailure({
            Phase: "Record",
            Error: err,
            StepKind: payload.TagName,
            Target: target,
            SourceFile: SOURCE_FILE,
            Now: now,
        });
        return { Ok: false, Step: null, Selectors: [], FailureReport: report };
    }
}

function locateCaptureTarget(xpathFull: string): Element | null {
    try {
        const r = document.evaluate(
            xpathFull, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
        );
        const node = r.singleNodeValue;
        return node instanceof Element ? node : null;
    } catch {
        return null;
    }
}
