/**
 * Owner Switch — DDL statements for the v1 schema.
 *
 * Tables (PascalCase per mem://architecture/data-storage-layers):
 *   - OwnerSwitchTask       one row per uploaded CSV run
 *   - OwnerSwitchRow        one row per CSV data row
 *   - TaskStatus            seeded enum (Pending/Running/Completed/Failed/Cancelled)
 *   - XPathSetting          editable XPath + delay per KeyCode
 *
 * Idempotent (`IF NOT EXISTS`). Executed by `migrations/index.ts`.
 */

export const DDL_TASK_STATUS = `
CREATE TABLE IF NOT EXISTS TaskStatus (
    Code TEXT PRIMARY KEY,
    DisplayLabel TEXT NOT NULL,
    SortOrder INTEGER NOT NULL
);
`.trim();

export const DDL_XPATH_SETTING = `
CREATE TABLE IF NOT EXISTS XPathSetting (
    KeyCode TEXT PRIMARY KEY,
    XPath TEXT NOT NULL,
    DelayMs INTEGER NOT NULL
);
`.trim();

export const DDL_OWNER_SWITCH_TASK = `
CREATE TABLE IF NOT EXISTS OwnerSwitchTask (
    Id TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    SourceFileName TEXT NOT NULL,
    LoginUrl TEXT NOT NULL,
    UseIncognito INTEGER NOT NULL DEFAULT 0,
    StatusCode TEXT NOT NULL REFERENCES TaskStatus(Code),
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);
`.trim();

export const DDL_OWNER_SWITCH_ROW = `
CREATE TABLE IF NOT EXISTS OwnerSwitchRow (
    Id TEXT PRIMARY KEY,
    TaskId TEXT NOT NULL REFERENCES OwnerSwitchTask(Id) ON DELETE CASCADE,
    RowIndex INTEGER NOT NULL,
    LoginEmail TEXT NOT NULL,
    OwnerEmail1 TEXT NOT NULL,
    OwnerEmail2 TEXT,
    Notes TEXT,
    IsDone INTEGER NOT NULL DEFAULT 0,
    HasError INTEGER NOT NULL DEFAULT 0,
    LastError TEXT,
    CompletedAt TEXT
);
`.trim();

export const DDL_INDEX_ROW_TASK = `
CREATE INDEX IF NOT EXISTS IX_OwnerSwitchRow_TaskId ON OwnerSwitchRow(TaskId);
`.trim();

import { DDL_OWNER_SWITCH_LOG, DDL_INDEX_LOG_TASK } from "./log-ddl";

export const ALL_DDL: ReadonlyArray<string> = Object.freeze([
    DDL_TASK_STATUS,
    DDL_XPATH_SETTING,
    DDL_OWNER_SWITCH_TASK,
    DDL_OWNER_SWITCH_ROW,
    DDL_INDEX_ROW_TASK,
    DDL_OWNER_SWITCH_LOG,
    DDL_INDEX_LOG_TASK,
]);
