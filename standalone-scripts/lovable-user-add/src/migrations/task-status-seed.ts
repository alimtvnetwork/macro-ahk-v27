/**
 * User Add — TaskStatus seed (Pending/Running/Completed/Failed/Cancelled).
 *
 * Same closed set as Owner Switch but kept in this project to preserve
 * project-level isolation (no cross-project DB joins). Seeded into the
 * project-scoped `TaskStatus` table.
 */

export enum UserAddTaskStatusCode {
    Pending = "Pending",
    Running = "Running",
    Completed = "Completed",
    Failed = "Failed",
    Cancelled = "Cancelled",
}

export interface TaskStatusSeed {
    Code: UserAddTaskStatusCode;
    DisplayLabel: string;
    SortOrder: number;
}

export const TASK_STATUS_SEEDS: ReadonlyArray<TaskStatusSeed> = Object.freeze([
    { Code: UserAddTaskStatusCode.Pending, DisplayLabel: "Pending", SortOrder: 1 },
    { Code: UserAddTaskStatusCode.Running, DisplayLabel: "Running", SortOrder: 2 },
    { Code: UserAddTaskStatusCode.Completed, DisplayLabel: "Completed", SortOrder: 3 },
    { Code: UserAddTaskStatusCode.Failed, DisplayLabel: "Failed", SortOrder: 4 },
    { Code: UserAddTaskStatusCode.Cancelled, DisplayLabel: "Cancelled", SortOrder: 5 },
]);
