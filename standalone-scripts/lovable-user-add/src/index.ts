/**
 * Lovable User Add — public barrel.
 *
 * P11: entry class + instruction manifest.
 * P12: migration v1 (DDL + MembershipRole + TaskStatus seeds).
 * P13: CSV parser + validator (Editor→Member normalization).
 * P14: popup UI shell + default-role select.
 * P15: Step A — POST membership via shared `addMembership`.
 * P16: Step B — Owner promotion via shared `promoteToOwner` (R12).
 * P17: per-row state machine + sign-out.
 */

export { LovableUserAdd } from "./lovable-user-add";
export { default as instruction } from "./instruction";
export { USER_ADD_MIGRATION_V1 } from "./migrations";
export { UserAddMembershipRoleCode } from "./migrations/membership-role-seed";
export { UserAddTaskStatusCode } from "./migrations/task-status-seed";
export { parseUserAddCsv, normalizeRole, UserAddCsvColumn } from "./csv";
export type { UserAddCsvRow, UserAddCsvParseResult, RoleNormalizeResult } from "./csv";
export { mountPopup, DEFAULT_ROLE_OPTIONS, DEFAULT_ROLE_VALUE } from "./ui";
export type { RoleOption } from "./ui";
export { runStepA, StepAStepCode, extractWorkspaceId, toStepAApiRole } from "./flow";
export type { StepARequest, StepAResult, StepAStepOutcome } from "./flow";
export { runStepB, StepBStepCode, shouldRunStepB } from "./flow";
export type { StepBRequest, StepBResult, StepBStepOutcome } from "./flow";
export {
    runUserAddRow, UserAddRowOutcomeCode, finalizeUserAddRow,
    buildRowFailure, buildRowSuccess,
    UserAddLogPhase, UserAddLogSeverity, buildUserAddEntry,
    runTaskSignOut,
} from "./flow";
export type {
    UserAddRowContext, UserAddRowResult, UserAddTaskParams,
    UserAddRowStateStore, UserAddRowStateUpdate,
    UserAddLogSink, UserAddLogEntry, TaskSignOutResult,
} from "./flow";
