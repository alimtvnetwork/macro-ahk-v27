/**
 * Marco Extension — Single-Step Retry
 *
 * Re-runs one previously-failed Step against the live DOM using the **same**
 * persisted selectors. The new outcome is logged via the structured
 * {@link logFailure} pipeline (when it fails again) and optionally persisted
 * to the per-project DB as a single-step ReplayRun row tagged
 * `"Retry of step #<id>"` so retries are distinguishable from full chain runs.
 *
 * Pure: no chrome.* / messaging. The caller (toast action, UI button, message
 * handler) supplies the Document, the original {@link ReplayStepInput}, and
 * an optional `Persist` block. This mirrors the Phase 09 contract used by
 * {@link executeReplay} so the same per-step `executeStep` semantics apply.
 *
 * @see ./live-dom-replay.ts — Full-chain executor that this complements.
 * @see ./failure-logger.ts  — Structured failure report shape.
 */

import {
    executeReplay,
    type ReplayOptions,
    type ReplayPersistOptions,
    type ReplayStepInput,
    type ReplayStepResult,
} from "./live-dom-replay";

export interface RetryStepOptions extends Omit<ReplayOptions, "Persist"> {
    /**
     * When provided the retry outcome is saved to the project DB as a
     * single-step ReplayRun. The persistence layer auto-prefixes
     * `"Retry of step #<id>"` to any caller-supplied notes.
     */
    readonly Persist?: ReplayPersistOptions;
}

export interface RetryStepOutcome {
    readonly Result: ReplayStepResult;
    readonly StartedAt: string;
    readonly FinishedAt: string;
    /** Populated only when `options.Persist` was supplied and the save succeeded. */
    readonly PersistedRunId: number | null;
}

/**
 * Re-run a single Step. Returns the new {@link ReplayStepResult} so callers
 * can update toasts / UI rows in place.
 */
export async function retryStep(
    step: ReplayStepInput,
    options: RetryStepOptions,
): Promise<RetryStepOutcome> {
    const persist: ReplayPersistOptions | undefined = options.Persist === undefined
        ? undefined
        : {
            ProjectSlug: options.Persist.ProjectSlug,
            Notes: buildRetryNotes(step.StepId, options.Persist.Notes),
        };

    const outcome = await executeReplay([step], { ...options, Persist: persist });
    const result = outcome.Results[0];
    return {
        Result: result,
        StartedAt: outcome.StartedAt,
        FinishedAt: outcome.FinishedAt,
        PersistedRunId: outcome.PersistedRun?.ReplayRunId ?? null,
    };
}

function buildRetryNotes(stepId: number, callerNotes: string | undefined): string {
    const tag = `Retry of step #${stepId}`;
    if (callerNotes === undefined || callerNotes.trim() === "") { return tag; }
    return `${tag} — ${callerNotes}`;
}
