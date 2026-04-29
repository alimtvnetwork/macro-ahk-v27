/**
 * Marco Extension — Recorder Session Types
 *
 * In-memory PascalCase contracts for an active recording session, mirrored
 * exactly from `spec/26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md`.
 *
 * These are the *transient* shape held in the toolbar's state machine
 * (`RecorderStore`). Persistence to the per-project SQLite recorder DB
 * happens in Phase 09 — at that point Steps are translated into rows of
 * the `Step` / `Selector` tables defined in `recorder-db-schema.ts`.
 */

import type { FormSnapshot } from "./form-snapshot";

export type RecordingPhase = "Idle" | "Recording" | "Paused";

export type RecordedStepKind = "Click" | "Type" | "Select" | "Submit" | "Wait" | "JsInline";

export type SelectorStrategy = "Id" | "TestId" | "RoleText" | "Positional";

export interface StepSelector {
    readonly XPathFull: string;
    readonly XPathRelative: string | null;
    readonly AnchorStepId: string | null;
    readonly Strategy: SelectorStrategy;
}

export interface RecordedStep {
    readonly StepId: string;
    readonly Index: number;
    readonly Kind: RecordedStepKind;
    readonly Label: string;
    readonly VariableName: string;
    readonly Selector: StepSelector;
    readonly CapturedAt: string;
    /**
     * Optional captured form/input snapshot. Populated by the recorder
     * automatically for `Submit` steps (entire form) and for `Type` /
     * `Select` steps (the single field's metadata, plus value when
     * verbose). Field metadata is always present; raw values are gated by
     * the project's verbose-logging flag — see
     * mem://standards/verbose-logging-and-failure-diagnostics and
     * mem://features/form-snapshot-capture.
     */
    readonly FormSnapshot?: FormSnapshot;
}

export interface RecordingSession {
    readonly SessionId: string;
    readonly ProjectSlug: string;
    readonly StartedAt: string;
    readonly Phase: RecordingPhase;
    readonly Steps: ReadonlyArray<RecordedStep>;
}

/** Storage key for the persisted session draft (one active session at a time). */
export const RECORDER_SESSION_STORAGE_KEY = "marco_recorder_session_v1";
