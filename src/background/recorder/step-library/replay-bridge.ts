/**
 * Marco Extension — Step Library → Live Replay Bridge
 *
 * Adapter that lets the pure `runGroup()` runner drive the existing
 * `executeReplay()` live-DOM actuator. The runner is decoupled from
 * the DOM: it walks the StepGroup tree and delegates leaf execution
 * to a caller-supplied `LeafStepExecutor`. Until now the only
 * executor wired into the UI was the **preview executor** (a stub
 * that always reports success — see `RunGroupDialog` /
 * `BatchRunDialog`). That meant RunGroup steps could be authored,
 * imported, and exported, but they couldn't actually click / type
 * anything during real macro playback.
 *
 * This module closes that gap by translating each `StepRow` into the
 * `ReplayStepInput` shape `executeReplay()` already understands, and
 * surfaces the resulting `FailureReport` back to the runner.
 *
 * What it does NOT do:
 *   - It never touches `chrome.*` APIs. The Document the executor
 *     dispatches against is supplied by the caller (Options-page
 *     preview, content-script playback, or unit tests).
 *   - It does NOT persist a `ReplayRun` row. The runner already
 *     produces a structured `Trace` and the calling UI persists its
 *     own results (`replay-run-persistence` is the legacy single-step
 *     flow). Wiring the trace into that table is a separate concern.
 *
 * Payload contract:
 *   The step-library DB stores leaf-step parameters as
 *   `Step.PayloadJson` — a JSON object with the shape
 *   `{ Selector: string, Value?: string, WaitMs?: number }`. The
 *   bridge parses that, picks the StepKind-specific fields, and
 *   wraps the selector as a single `PersistedSelector` row so the
 *   replay actuator can reuse its existing CSS/XPath resolver.
 *
 * @see ./run-group-runner.ts          — Runner that calls the executor.
 * @see ../live-dom-replay.ts          — The actuator we're driving.
 * @see ../replay-resolver.ts          — Selector kind detection.
 * @see ../failure-logger.ts           — FailureReport contract.
 * @see spec/31-macro-recorder/16-step-group-library.md §6
 */

import {
    executeReplay,
    type ReplayOptions,
    type ReplayStepInput,
} from "../live-dom-replay";
import type { PersistedSelector } from "../step-persistence";
import { logFailure, type FailureReport } from "../failure-logger";
import type { FieldRow } from "../field-reference-resolver";
import { SelectorKindId } from "../../recorder-db-schema";
import type { StepRow } from "./db";
import type { LeafStepExecutor, LeafStepContext } from "./run-group-runner";
import { StepKindId } from "./schema";

const SOURCE_FILE = "src/background/recorder/step-library/replay-bridge.ts";

/* ------------------------------------------------------------------ */
/*  Public surface                                                     */
/* ------------------------------------------------------------------ */

export interface ReplayBridgeOptions {
    /** Live document the actuator dispatches events into. */
    readonly Doc: Document;
    /** Active row used to resolve `{{Column}}` templates in Type/Select values. */
    readonly Row?: FieldRow;
    /** Override sleep for tests. */
    readonly Sleep?: (ms: number) => Promise<void>;
    /** Override clock for tests. */
    readonly Now?: () => Date;
    /** Forwarded to `executeReplay` — see its docstring. */
    readonly Verbose?: boolean;
}

/**
 * Build a `LeafStepExecutor` that drives `executeReplay()` for each
 * leaf step the runner emits. RunGroup steps NEVER reach this
 * executor — the runner handles them itself before delegating.
 */
export function createLiveReplayExecutor(opts: ReplayBridgeOptions): LeafStepExecutor {
    return async (step: StepRow, _ctx: LeafStepContext): Promise<FailureReport | null> => {
        // Translation can fail synchronously when PayloadJson is
        // missing/malformed. Convert that into a FailureReport so the
        // runner reports it the same way as a DOM-level failure.
        let input: ReplayStepInput;
        try {
            input = stepRowToReplayInput(step);
        } catch (err) {
            return logFailure({
                Phase: "Replay",
                Error: err,
                StepId: step.StepId,
                Index: step.OrderIndex,
                StepKind: stepKindLabel(step.StepKindId),
                Selectors: [],
                SourceFile: SOURCE_FILE,
                Reason: "Unknown",
                ReasonDetail: `Step #${step.StepId} (kind=${stepKindLabel(step.StepKindId)}) `
                    + `could not be translated for live replay: `
                    + `${(err as Error).message}`,
                Verbose: opts.Verbose ?? false,
                Now: opts.Now,
            });
        }

        const replayOpts: ReplayOptions = {
            Doc: opts.Doc,
            Row: opts.Row,
            Sleep: opts.Sleep,
            Now: opts.Now,
            Verbose: opts.Verbose,
        };

        const outcome = await executeReplay([input], replayOpts);
        const result = outcome.Results[0];
        if (result === undefined) {
            // Defensive: executeReplay always returns 1 result per
            // input. If that contract ever breaks we fail loud.
            return logFailure({
                Phase: "Replay",
                Error: new Error("executeReplay returned no result"),
                StepId: step.StepId,
                Index: step.OrderIndex,
                StepKind: stepKindLabel(step.StepKindId),
                Selectors: [],
                SourceFile: SOURCE_FILE,
                Reason: "Unknown",
                ReasonDetail: `executeReplay produced an empty Results array for step #${step.StepId}.`,
                Verbose: opts.Verbose ?? false,
                Now: opts.Now,
            });
        }
        if (result.Ok) return null;
        // executeReplay always populates FailureReport on !Ok. Keep
        // the fallback so the executor contract (FailureReport | null)
        // never returns undefined.
        return result.FailureReport ?? logFailure({
            Phase: "Replay",
            Error: new Error(result.Error ?? "Unknown replay failure"),
            StepId: step.StepId,
            Index: step.OrderIndex,
            StepKind: stepKindLabel(step.StepKindId),
            Selectors: [],
            SourceFile: SOURCE_FILE,
            Reason: "Unknown",
            ReasonDetail: result.Error ?? `Step #${step.StepId} failed without a FailureReport.`,
            Verbose: opts.Verbose ?? false,
            Now: opts.Now,
        });
    };
}

/* ------------------------------------------------------------------ */
/*  StepRow → ReplayStepInput translation                              */
/* ------------------------------------------------------------------ */

interface StepPayload {
    readonly Selector?: string;
    readonly Value?: string;
    readonly WaitMs?: number;
}

/**
 * Public for tests. Maps a `StepRow` from the step-library DB to the
 * `ReplayStepInput` consumed by `executeReplay()`.
 *
 * Throws when:
 *   - The step kind has no replay equivalent (RunGroup is the
 *     runner's job; reaching this code with one is a contract bug).
 *   - PayloadJson is missing for a kind that needs a selector.
 *   - PayloadJson is not valid JSON.
 *
 * SelectorKindId mapping uses the same heuristic as
 * `replay-resolver.ts`: expressions that begin with `/` or `(` are
 * treated as XPath, everything else as CSS. The library schema does
 * NOT yet store a selector kind alongside the payload, so this
 * keeps inference in one place.
 */
export function stepRowToReplayInput(step: StepRow): ReplayStepInput {
    const payload = parsePayload(step);

    switch (step.StepKindId) {
        case StepKindId.Wait: {
            const ms = payload.WaitMs;
            if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
                throw new Error(
                    `Wait step #${step.StepId} has invalid PayloadJson.WaitMs `
                    + `(${JSON.stringify(payload.WaitMs)}). Expected a non-negative number.`,
                );
            }
            return {
                StepId: step.StepId,
                Index: step.OrderIndex,
                Kind: "Wait",
                Selectors: [],
                WaitMs: ms,
            };
        }
        case StepKindId.Click: {
            return {
                StepId: step.StepId,
                Index: step.OrderIndex,
                Kind: "Click",
                Selectors: [requireSelector(step, payload)],
            };
        }
        case StepKindId.Type: {
            return {
                StepId: step.StepId,
                Index: step.OrderIndex,
                Kind: "Type",
                Selectors: [requireSelector(step, payload)],
                Value: payload.Value ?? "",
            };
        }
        case StepKindId.Select: {
            return {
                StepId: step.StepId,
                Index: step.OrderIndex,
                Kind: "Select",
                Selectors: [requireSelector(step, payload)],
                Value: payload.Value ?? "",
            };
        }
        case StepKindId.JsInline: {
            // JsInline is currently out of scope for the live actuator
            // (executeReplay only knows Click/Type/Select/Wait — see
            // mem://features/js-step-diagnostics for the dedicated
            // JS-step pipeline). Surface a precise reason rather than
            // silently no-op'ing so the trace shows "we declined" not
            // "we succeeded".
            throw new Error(
                `JsInline step #${step.StepId} is not yet supported by the live `
                + `replay bridge — JS steps run through buildJsStepFailureReport, `
                + `not executeReplay.`,
            );
        }
        case StepKindId.RunGroup: {
            // The runner intercepts RunGroup steps before invoking the
            // leaf executor. Reaching here means a caller bypassed the
            // runner — that's a programming error.
            throw new Error(
                `RunGroup step #${step.StepId} reached the leaf executor; `
                + `this should be handled by runGroup() recursion, not the bridge.`,
            );
        }
        case StepKindId.Hotkey: {
            // Hotkey (AutoHotkey-style chord macro) is dispatched by a
            // dedicated keyboard executor — not the selector-based
            // replay bridge. Surface a precise reason so the failure
            // diagnostics show "wrong path" instead of a silent skip.
            throw new Error(
                `Hotkey step #${step.StepId} is not handled by the live replay bridge — `
                + `it is dispatched by the dedicated hotkey executor (see executeHotkeyStep).`,
            );
        }
        default: {
            const exhaustive: never = step.StepKindId;
            throw new Error(`Unknown StepKindId for step #${step.StepId}: ${String(exhaustive)}`);
        }
    }
}

function parsePayload(step: StepRow): StepPayload {
    if (step.PayloadJson === null || step.PayloadJson === "") return {};
    try {
        const parsed: unknown = JSON.parse(step.PayloadJson);
        if (parsed === null || typeof parsed !== "object") {
            throw new Error(`PayloadJson must be a JSON object, got ${typeof parsed}`);
        }
        return parsed as StepPayload;
    } catch (err) {
        throw new Error(
            `Step #${step.StepId} has invalid PayloadJson: ${(err as Error).message}`,
        );
    }
}

function requireSelector(step: StepRow, payload: StepPayload): PersistedSelector {
    const expr = payload.Selector;
    if (typeof expr !== "string" || expr.trim() === "") {
        throw new Error(
            `Step #${step.StepId} (kind=${stepKindLabel(step.StepKindId)}) `
            + `requires PayloadJson.Selector — got ${JSON.stringify(payload.Selector)}.`,
        );
    }
    const trimmed = expr.trim();
    // Mirror the kind-detection in replay-resolver.ts so the same
    // expression resolves the same way in both code paths.
    const selectorKindId = trimmed.startsWith("/") || trimmed.startsWith("(")
        ? SelectorKindId.XPathFull
        : SelectorKindId.Css;
    return {
        // Synthetic IDs: the step-library schema doesn't persist
        // Selector rows. Negative numbers stay clearly distinct from
        // any real Selector.SelectorId in the legacy per-project DB
        // so log diffs / persistence layers can tell them apart.
        SelectorId: -step.StepId,
        StepId: step.StepId,
        SelectorKindId: selectorKindId,
        Expression: trimmed,
        AnchorSelectorId: null,
        IsPrimary: 1,
    };
}

function stepKindLabel(id: StepKindId): string {
    switch (id) {
        case StepKindId.Click:    return "Click";
        case StepKindId.Type:     return "Type";
        case StepKindId.Select:   return "Select";
        case StepKindId.JsInline: return "JsInline";
        case StepKindId.Wait:     return "Wait";
        case StepKindId.RunGroup: return "RunGroup";
        default:                  return `Unknown(${String(id)})`;
    }
}
