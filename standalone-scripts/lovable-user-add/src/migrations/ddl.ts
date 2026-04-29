/**
 * User Add — DDL statements for the v1 schema.
 *
 * Tables (PascalCase per mem://architecture/data-storage-layers):
 *   - UserAddTask         one row per uploaded CSV run
 *   - UserAddRow          one row per CSV data row (member to add)
 *   - TaskStatus          seeded enum (Pending/Running/Completed/Failed/Cancelled)
 *   - MembershipRole      seeded enum (Owner/Admin/Member; RequiresPromotion flag)
 *   - UserAddLog          per-row log entries (Step A vs B distinguishable)
 *
 * `RoleCode` references MembershipRole, so Editor cannot be inserted —
 * P13 parser normalizes Editor→Member before any row reaches the DB.
 *
 * Idempotent (`IF NOT EXISTS`).
 */

export const DDL_TASK_STATUS = `
CREATE TABLE IF NOT EXISTS TaskStatus (
    Code TEXT PRIMARY KEY,
    DisplayLabel TEXT NOT NULL,
    SortOrder INTEGER NOT NULL
);
`.trim();

export const DDL_MEMBERSHIP_ROLE = `
CREATE TABLE IF NOT EXISTS MembershipRole (
    Code TEXT PRIMARY KEY,
    DisplayLabel TEXT NOT NULL,
    SortOrder INTEGER NOT NULL,
    RequiresPromotion INTEGER NOT NULL DEFAULT 0
);
`.trim();

export const DDL_USER_ADD_TASK = `
CREATE TABLE IF NOT EXISTS UserAddTask (
    Id TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    SourceFileName TEXT NOT NULL,
    LoginUrl TEXT NOT NULL,
    DefaultRoleCode TEXT NOT NULL REFERENCES MembershipRole(Code),
    UseIncognito INTEGER NOT NULL DEFAULT 0,
    StatusCode TEXT NOT NULL REFERENCES TaskStatus(Code),
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
);
`.trim();

export const DDL_USER_ADD_ROW = `
CREATE TABLE IF NOT EXISTS UserAddRow (
    Id TEXT PRIMARY KEY,
    TaskId TEXT NOT NULL REFERENCES UserAddTask(Id) ON DELETE CASCADE,
    RowIndex INTEGER NOT NULL,
    WorkspaceUrl TEXT NOT NULL,
    MemberEmail TEXT NOT NULL,
    RoleCode TEXT NOT NULL REFERENCES MembershipRole(Code),
    Notes TEXT,
    StepADone INTEGER NOT NULL DEFAULT 0,
    StepBDone INTEGER NOT NULL DEFAULT 0,
    HasError INTEGER NOT NULL DEFAULT 0,
    LastError TEXT,
    CompletedAt TEXT
);
`.trim();

export const DDL_INDEX_ROW_TASK = `
CREATE INDEX IF NOT EXISTS IX_UserAddRow_TaskId ON UserAddRow(TaskId);
`.trim();

export const DDL_USER_ADD_LOG = `
CREATE TABLE IF NOT EXISTS UserAddLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    TaskId TEXT NOT NULL REFERENCES UserAddTask(Id) ON DELETE CASCADE,
    RowIndex INTEGER,
    Phase TEXT NOT NULL,
    Severity TEXT NOT NULL,
    Message TEXT NOT NULL,
    TimestampUtc TEXT NOT NULL
);
`.trim();

export const DDL_INDEX_LOG_TASK = `
CREATE INDEX IF NOT EXISTS IX_UserAddLog_TaskId ON UserAddLog(TaskId, Id);
`.trim();

export const ALL_DDL: ReadonlyArray<string> = Object.freeze([
    DDL_TASK_STATUS,
    DDL_MEMBERSHIP_ROLE,
    DDL_USER_ADD_TASK,
    DDL_USER_ADD_ROW,
    DDL_INDEX_ROW_TASK,
    DDL_USER_ADD_LOG,
    DDL_INDEX_LOG_TASK,
]);
