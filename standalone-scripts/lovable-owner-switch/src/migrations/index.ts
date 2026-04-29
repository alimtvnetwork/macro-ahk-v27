/**
 * Owner Switch — v1 migration runner (declarative spec).
 *
 * P5 deliverable: assembles DDL + seed data into a single `Migration`
 * descriptor that the project entry class (P10+) executes against
 * `RiseupAsiaMacroExt.Sqlite`. This file does NOT touch the SDK at
 * runtime — it is pure data so P5 stays atomic and testable.
 */

import { ALL_DDL } from "./ddl";
import { TASK_STATUS_SEEDS } from "./task-status-seed";
import { XPATH_SETTING_SEEDS } from "./xpath-setting-seed";
import type { TaskStatusSeed } from "./task-status-seed";
import type { XPathSettingSeed } from "./xpath-setting-seed";

export interface OwnerSwitchMigration {
    Version: number;
    Ddl: ReadonlyArray<string>;
    TaskStatusSeeds: ReadonlyArray<TaskStatusSeed>;
    XPathSeeds: ReadonlyArray<XPathSettingSeed>;
}

const MIGRATION_VERSION = 1;

export const OWNER_SWITCH_MIGRATION_V1: OwnerSwitchMigration = Object.freeze({
    Version: MIGRATION_VERSION,
    Ddl: ALL_DDL,
    TaskStatusSeeds: TASK_STATUS_SEEDS,
    XPathSeeds: XPATH_SETTING_SEEDS,
});
