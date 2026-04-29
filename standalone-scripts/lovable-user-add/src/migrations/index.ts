/**
 * User Add — v1 migration runner (declarative spec).
 *
 * P12 deliverable: assembles DDL + seed data into a single `Migration`
 * descriptor that the project entry class (P17+) executes against
 * `RiseupAsiaMacroExt.Sqlite`. Pure data — no SDK runtime calls here.
 *
 * Note: User Add does NOT seed XPathSetting rows in v1 because the
 * P15 Step A flow uses `LovableApiClient.addMembership(...)` (no DOM
 * interaction). P18 may later add a shared XPath/delay editor that
 * spans both projects.
 */

import { ALL_DDL } from "./ddl";
import { TASK_STATUS_SEEDS } from "./task-status-seed";
import { MEMBERSHIP_ROLE_SEEDS } from "./membership-role-seed";
import type { TaskStatusSeed } from "./task-status-seed";
import type { MembershipRoleSeed } from "./membership-role-seed";

export interface UserAddMigration {
    Version: number;
    Ddl: ReadonlyArray<string>;
    TaskStatusSeeds: ReadonlyArray<TaskStatusSeed>;
    MembershipRoleSeeds: ReadonlyArray<MembershipRoleSeed>;
}

const MIGRATION_VERSION = 1;

export const USER_ADD_MIGRATION_V1: UserAddMigration = Object.freeze({
    Version: MIGRATION_VERSION,
    Ddl: ALL_DDL,
    TaskStatusSeeds: TASK_STATUS_SEEDS,
    MembershipRoleSeeds: MEMBERSHIP_ROLE_SEEDS,
});
