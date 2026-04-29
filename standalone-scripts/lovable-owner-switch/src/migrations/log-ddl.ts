/**
 * Owner Switch — DDL for the per-row log table.
 *
 * Appended to the v1 migration but kept in its own file so the P19 logs
 * viewer can reuse the schema constant without importing the full
 * migration descriptor.
 */

export const DDL_OWNER_SWITCH_LOG = `
CREATE TABLE IF NOT EXISTS OwnerSwitchLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    TaskId TEXT NOT NULL REFERENCES OwnerSwitchTask(Id) ON DELETE CASCADE,
    RowIndex INTEGER,
    Phase TEXT NOT NULL,
    Severity TEXT NOT NULL,
    Message TEXT NOT NULL,
    TimestampUtc TEXT NOT NULL
);
`.trim();

export const DDL_INDEX_LOG_TASK = `
CREATE INDEX IF NOT EXISTS IX_OwnerSwitchLog_TaskId ON OwnerSwitchLog(TaskId, Id);
`.trim();
