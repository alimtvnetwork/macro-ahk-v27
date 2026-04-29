/**
 * Marco Extension — Recorder Store (state machine)
 *
 * Pure, dependency-free reducer for the toolbar recording lifecycle.
 * No DOM, no chrome.* — everything is a synchronous function of state.
 * Persistence and shortcut wiring layer on top of this module.
 *
 * @see spec/26-chrome-extension-generic/06-ui-and-design-system/10-toolbar-recording-ux.md
 * @see ./recorder-session-types.ts — Type contracts
 */

import type {
    RecordedStep,
    RecordingPhase,
    RecordingSession,
    StepSelector,
} from "./recorder-session-types";

/* ------------------------------------------------------------------ */
/*  Action contracts                                                   */
/* ------------------------------------------------------------------ */

export type RecorderAction =
    | { Kind: "Start"; ProjectSlug: string; SessionId: string; StartedAt: string }
    | { Kind: "Pause" }
    | { Kind: "Resume" }
    | { Kind: "Stop" }
    | { Kind: "Capture"; StepId: string; CapturedAt: string; Step: NewStepInput }
    | { Kind: "Rename"; StepId: string; VariableName: string }
    | { Kind: "Delete"; StepId: string };

export interface NewStepInput {
    readonly Kind: RecordedStep["Kind"];
    readonly Label: string;
    readonly VariableName: string;
    readonly Selector: StepSelector;
}

/* ------------------------------------------------------------------ */
/*  Initial state + helpers                                            */
/* ------------------------------------------------------------------ */

export const IDLE_SESSION: RecordingSession = {
    SessionId: "",
    ProjectSlug: "",
    StartedAt: "",
    Phase: "Idle",
    Steps: [],
};

export class RecorderStateError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "RecorderStateError";
    }
}

function assertVariableUnique(steps: ReadonlyArray<RecordedStep>, name: string, exceptStepId?: string): void {
    const collision = steps.find((s) => s.VariableName === name && s.StepId !== exceptStepId);
    if (collision !== undefined) {
        throw new RecorderStateError(
            `VariableName '${name}' already used by StepId '${collision.StepId}'. ` +
            `Names must be unique across the session.`,
        );
    }
}

function reindex(steps: ReadonlyArray<RecordedStep>): RecordedStep[] {
    return steps.map((s, i) => ({ ...s, Index: i + 1 }));
}

/* ------------------------------------------------------------------ */
/*  Transition handlers (one each, all <8 lines)                       */
/* ------------------------------------------------------------------ */

function applyStart(state: RecordingSession, a: Extract<RecorderAction, { Kind: "Start" }>): RecordingSession {
    if (state.Phase !== "Idle") {
        throw new RecorderStateError(`Cannot Start from phase '${state.Phase}'. Stop first.`);
    }
    return { SessionId: a.SessionId, ProjectSlug: a.ProjectSlug, StartedAt: a.StartedAt, Phase: "Recording", Steps: [] };
}

function applyPause(state: RecordingSession): RecordingSession {
    if (state.Phase !== "Recording") {
        throw new RecorderStateError(`Cannot Pause from phase '${state.Phase}'.`);
    }
    return { ...state, Phase: "Paused" };
}

function applyResume(state: RecordingSession): RecordingSession {
    if (state.Phase !== "Paused") {
        throw new RecorderStateError(`Cannot Resume from phase '${state.Phase}'.`);
    }
    return { ...state, Phase: "Recording" };
}

function applyStop(state: RecordingSession): RecordingSession {
    if (state.Phase === "Idle") { return state; }
    return { ...state, Phase: "Idle" };
}

function applyCapture(state: RecordingSession, a: Extract<RecorderAction, { Kind: "Capture" }>): RecordingSession {
    if (state.Phase !== "Recording") {
        throw new RecorderStateError(`Cannot Capture in phase '${state.Phase}'. Resume first.`);
    }
    assertVariableUnique(state.Steps, a.Step.VariableName);
    const next: RecordedStep = { StepId: a.StepId, Index: state.Steps.length + 1, CapturedAt: a.CapturedAt, ...a.Step };
    return { ...state, Steps: [...state.Steps, next] };
}

function applyRename(state: RecordingSession, a: Extract<RecorderAction, { Kind: "Rename" }>): RecordingSession {
    assertVariableUnique(state.Steps, a.VariableName, a.StepId);
    const target = state.Steps.find((s) => s.StepId === a.StepId);
    if (target === undefined) { throw new RecorderStateError(`Unknown StepId '${a.StepId}'.`); }
    const updated = state.Steps.map((s) => (s.StepId === a.StepId ? { ...s, VariableName: a.VariableName } : s));
    return { ...state, Steps: updated };
}

function rewriteAnchorOnDelete(steps: ReadonlyArray<RecordedStep>, deletedStepId: string): RecordedStep[] {
    return steps.map((s) => {
        if (s.Selector.AnchorStepId !== deletedStepId) { return s; }
        return { ...s, Selector: { ...s.Selector, AnchorStepId: null } };
    });
}

function applyDelete(state: RecordingSession, a: Extract<RecorderAction, { Kind: "Delete" }>): RecordingSession {
    const remaining = state.Steps.filter((s) => s.StepId !== a.StepId);
    if (remaining.length === state.Steps.length) {
        throw new RecorderStateError(`Cannot delete unknown StepId '${a.StepId}'.`);
    }
    const rewritten = rewriteAnchorOnDelete(remaining, a.StepId);
    return { ...state, Steps: reindex(rewritten) };
}

/* ------------------------------------------------------------------ */
/*  Public reducer                                                     */
/* ------------------------------------------------------------------ */

const HANDLERS: Record<RecorderAction["Kind"], (s: RecordingSession, a: RecorderAction) => RecordingSession> = {
    Start: (s, a) => applyStart(s, a as Extract<RecorderAction, { Kind: "Start" }>),
    Pause: (s) => applyPause(s),
    Resume: (s) => applyResume(s),
    Stop: (s) => applyStop(s),
    Capture: (s, a) => applyCapture(s, a as Extract<RecorderAction, { Kind: "Capture" }>),
    Rename: (s, a) => applyRename(s, a as Extract<RecorderAction, { Kind: "Rename" }>),
    Delete: (s, a) => applyDelete(s, a as Extract<RecorderAction, { Kind: "Delete" }>),
};

export function recorderReducer(state: RecordingSession, action: RecorderAction): RecordingSession {
    return HANDLERS[action.Kind](state, action);
}

/** Returns the next legal phase if the user clicks the toolbar's primary button. */
export function nextPhaseOnPrimary(phase: RecordingPhase): RecordingPhase {
    if (phase === "Idle") { return "Recording"; }
    if (phase === "Recording") { return "Paused"; }
    return "Recording";
}
