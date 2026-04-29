/**
 * User Add — flow barrel.
 *
 * P15: Step A — POST membership via shared `LovableApiClient.addMembership`.
 * P16: Step B — Owner promotion via shared `promoteToOwner` (R12).
 * P17: per-row state machine + task-level sign-out stub.
 */

export { runStepA } from "./run-step-a";
export { StepAStepCode } from "./step-a-types";
export type { StepARequest, StepAResult, StepAStepOutcome } from "./step-a-types";
export { extractWorkspaceId } from "./extract-workspace-id";
export { toStepAApiRole } from "./role-api-mapper";
export { runStepB } from "./run-step-b";
export { StepBStepCode } from "./step-b-types";
export type { StepBRequest, StepBResult, StepBStepOutcome } from "./step-b-types";
export { shouldRunStepB } from "./should-run-step-b";
export { runUserAddRow } from "./run-row";
export { UserAddRowOutcomeCode } from "./row-types";
export type { UserAddRowContext, UserAddRowResult, UserAddTaskParams } from "./row-types";
export { finalizeUserAddRow } from "./row-finalize";
export { buildRowFailure, buildRowSuccess } from "./row-result-builders";
export type { UserAddRowStateStore, UserAddRowStateUpdate } from "./row-state-store";
export {
    UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry,
} from "./log-sink";
export type { UserAddLogSink, UserAddLogEntry } from "./log-sink";
export { runTaskSignOut } from "./run-task-sign-out";
export type { TaskSignOutResult } from "./run-task-sign-out";
export { toUserAddLogViewerEntries } from "./log-viewer-adapter";
export { buildUserAddRunSummary } from "./run-summary-builder";
export type { UserAddSummaryInput } from "./run-summary-builder";
