/**
 * Owner Switch — TaskStatus enum (seeded into `TaskStatus` table).
 *
 * Closed set; values double as both DB primary key code and UI label key.
 * No magic strings elsewhere — code paths must reference this enum.
 */

export enum OwnerSwitchTaskStatusCode {
    Pending = "Pending",
    Running = "Running",
    Completed = "Completed",
    Failed = "Failed",
    Cancelled = "Cancelled",
}

export interface TaskStatusSeed {
    Code: OwnerSwitchTaskStatusCode;
    DisplayLabel: string;
    SortOrder: number;
}

export const TASK_STATUS_SEEDS: ReadonlyArray<TaskStatusSeed> = Object.freeze([
    { Code: OwnerSwitchTaskStatusCode.Pending, DisplayLabel: "Pending", SortOrder: 1 },
    { Code: OwnerSwitchTaskStatusCode.Running, DisplayLabel: "Running", SortOrder: 2 },
    { Code: OwnerSwitchTaskStatusCode.Completed, DisplayLabel: "Completed", SortOrder: 3 },
    { Code: OwnerSwitchTaskStatusCode.Failed, DisplayLabel: "Failed", SortOrder: 4 },
    { Code: OwnerSwitchTaskStatusCode.Cancelled, DisplayLabel: "Cancelled", SortOrder: 5 },
]);
