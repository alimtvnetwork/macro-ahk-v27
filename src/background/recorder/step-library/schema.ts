/**
 * Marco Extension — Step Library DB Schema
 *
 * Implements §5 of `spec/31-macro-recorder/16-step-group-library.md`
 * — pure SQL strings + the canonical `StepKindId` enum + the schema
 * version this codebase ships with. Kept separate from the wrapper so
 * tests can call `applySchema(db)` against an in-memory `sql.js`
 * Database without touching OPFS.
 *
 * ALL DDL is idempotent (`CREATE ... IF NOT EXISTS`) so running
 * `applySchema()` on an already-initialised DB is a no-op.
 *
 * @see spec/31-macro-recorder/16-step-group-library.md  §5
 * @see spec/31-macro-recorder/16-step-group-library-erd.md
 */

import type { Database } from "sql.js";

/** Schema version this codebase ships. Bumped whenever DDL changes. */
export const STEP_LIBRARY_SCHEMA_VERSION = 1;

/** Maximum nesting depth for StepGroup (per §2 of the spec). */
export const MAX_GROUP_NESTING_DEPTH = 8;

/** Maximum RunGroup call-stack depth at runtime (per §3.1 of the spec). */
export const MAX_RUN_GROUP_CALL_DEPTH = 16;

/**
 * Canonical lookup values for `StepKind`. The numeric IDs are the
 * single source of truth and MUST NOT change once shipped (existing
 * exported bundles reference them).
 */
export enum StepKindId {
    Click = 1,
    Type = 2,
    Select = 3,
    JsInline = 4,
    Wait = 5,
    /** New in §5.3 — invokes another group inline. */
    RunGroup = 6,
    /**
     * AutoHotkey-style chord macro. Payload shape:
     * `{ "Keys": ["Ctrl+S","Tab","Enter"], "WaitMs": 500 }`.
     * Each entry in `Keys` is a single chord dispatched in order; an
     * optional `WaitMs` pauses after the final chord. The replayer
     * translates each chord into KeyboardEvent dispatches.
     */
    Hotkey = 7,
}

const STEP_KIND_SEED: ReadonlyArray<{ Id: StepKindId; Name: string }> = [
    { Id: StepKindId.Click,    Name: "Click" },
    { Id: StepKindId.Type,     Name: "Type" },
    { Id: StepKindId.Select,   Name: "Select" },
    { Id: StepKindId.JsInline, Name: "JsInline" },
    { Id: StepKindId.Wait,     Name: "Wait" },
    { Id: StepKindId.RunGroup, Name: "RunGroup" },
    { Id: StepKindId.Hotkey,   Name: "Hotkey" },
];

/* ------------------------------------------------------------------ */
/*  DDL                                                                */
/* ------------------------------------------------------------------ */

const DDL_PROJECT = `
CREATE TABLE IF NOT EXISTS Project (
    ProjectId         INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectExternalId TEXT    NOT NULL UNIQUE,
    Name              VARCHAR(120) NOT NULL,
    CreatedAt         TEXT    NOT NULL DEFAULT (datetime('now')),
    UpdatedAt         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS IxProjectExternal ON Project (ProjectExternalId);
`;

const DDL_STEP_GROUP = `
CREATE TABLE IF NOT EXISTS StepGroup (
    StepGroupId       INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectId         INTEGER NOT NULL,
    ParentStepGroupId INTEGER NULL,
    Name              VARCHAR(120) NOT NULL,
    Description       TEXT NULL,
    OrderIndex        INTEGER NOT NULL DEFAULT 0,
    IsArchived        TINYINT NOT NULL DEFAULT 0,
    CreatedAt         TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ProjectId) REFERENCES Project (ProjectId) ON DELETE CASCADE,
    FOREIGN KEY (ParentStepGroupId) REFERENCES StepGroup (StepGroupId) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS IxStepGroupProjectParent
    ON StepGroup (ProjectId, ParentStepGroupId);
CREATE UNIQUE INDEX IF NOT EXISTS IxStepGroupSiblingNameUnique
    ON StepGroup (ProjectId, IFNULL(ParentStepGroupId, -1), lower(Name));
`;

/**
 * Reject self-parenting and cross-project parenting.
 * Reject inserts/updates that would push the descendant chain to
 * depth > MAX_GROUP_NESTING_DEPTH (8). The depth count is "number of
 * ancestors above this row + 1", so the root group has depth 1.
 */
const DDL_STEP_GROUP_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS TrgStepGroupNoSelfParentInsert
BEFORE INSERT ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL AND NEW.ParentStepGroupId = NEW.StepGroupId
BEGIN
    SELECT RAISE(ABORT, 'StepGroup cannot be its own parent');
END;

CREATE TRIGGER IF NOT EXISTS TrgStepGroupNoSelfParentUpdate
BEFORE UPDATE OF ParentStepGroupId ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL AND NEW.ParentStepGroupId = NEW.StepGroupId
BEGIN
    SELECT RAISE(ABORT, 'StepGroup cannot be its own parent');
END;

CREATE TRIGGER IF NOT EXISTS TrgStepGroupSameProjectParentInsert
BEFORE INSERT ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL
 AND (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.ParentStepGroupId) <> NEW.ProjectId
BEGIN
    SELECT RAISE(ABORT, 'ParentStepGroup must belong to the same Project');
END;

CREATE TRIGGER IF NOT EXISTS TrgStepGroupSameProjectParentUpdate
BEFORE UPDATE OF ParentStepGroupId, ProjectId ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL
 AND (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.ParentStepGroupId) <> NEW.ProjectId
BEGIN
    SELECT RAISE(ABORT, 'ParentStepGroup must belong to the same Project');
END;

-- Recursive CTE walks up to count ancestor depth. Reject if depth >= MAX_GROUP_NESTING_DEPTH.
CREATE TRIGGER IF NOT EXISTS TrgStepGroupMaxDepthInsert
BEFORE INSERT ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL AND (
    WITH RECURSIVE Ancestors(Id, Depth) AS (
        SELECT NEW.ParentStepGroupId, 1
        UNION ALL
        SELECT g.ParentStepGroupId, a.Depth + 1
        FROM StepGroup g JOIN Ancestors a ON g.StepGroupId = a.Id
        WHERE g.ParentStepGroupId IS NOT NULL
    )
    SELECT MAX(Depth) FROM Ancestors
) >= ${MAX_GROUP_NESTING_DEPTH}
BEGIN
    SELECT RAISE(ABORT, 'MaxNestingDepthExceeded: StepGroup tree exceeds depth ${MAX_GROUP_NESTING_DEPTH}');
END;

CREATE TRIGGER IF NOT EXISTS TrgStepGroupMaxDepthUpdate
BEFORE UPDATE OF ParentStepGroupId ON StepGroup
WHEN NEW.ParentStepGroupId IS NOT NULL AND (
    WITH RECURSIVE Ancestors(Id, Depth) AS (
        SELECT NEW.ParentStepGroupId, 1
        UNION ALL
        SELECT g.ParentStepGroupId, a.Depth + 1
        FROM StepGroup g JOIN Ancestors a ON g.StepGroupId = a.Id
        WHERE g.ParentStepGroupId IS NOT NULL
    )
    SELECT MAX(Depth) FROM Ancestors
) >= ${MAX_GROUP_NESTING_DEPTH}
BEGIN
    SELECT RAISE(ABORT, 'MaxNestingDepthExceeded: StepGroup tree exceeds depth ${MAX_GROUP_NESTING_DEPTH}');
END;
`;

const DDL_STEP_KIND = `
CREATE TABLE IF NOT EXISTS StepKind (
    StepKindId TINYINT PRIMARY KEY,
    Name       VARCHAR(20) NOT NULL UNIQUE
);
`;

const DDL_STEP = `
CREATE TABLE IF NOT EXISTS Step (
    StepId            INTEGER PRIMARY KEY AUTOINCREMENT,
    StepGroupId       INTEGER NOT NULL,
    OrderIndex        INTEGER NOT NULL DEFAULT 0,
    StepKindId        TINYINT NOT NULL,
    Label             VARCHAR(160) NULL,
    PayloadJson       TEXT NULL,
    TargetStepGroupId INTEGER NULL,
    IsDisabled        TINYINT NOT NULL DEFAULT 0,
    CreatedAt         TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (StepGroupId) REFERENCES StepGroup (StepGroupId) ON DELETE CASCADE,
    FOREIGN KEY (StepKindId) REFERENCES StepKind (StepKindId),
    FOREIGN KEY (TargetStepGroupId) REFERENCES StepGroup (StepGroupId) ON DELETE SET NULL,
    -- CkStepRunGroupTarget: TargetStepGroupId NOT NULL iff RunGroup, else NULL.
    CHECK (
        (StepKindId = ${StepKindId.RunGroup} AND TargetStepGroupId IS NOT NULL)
        OR (StepKindId <> ${StepKindId.RunGroup} AND TargetStepGroupId IS NULL)
    )
);
CREATE INDEX IF NOT EXISTS IxStepGroupOrder ON Step (StepGroupId, OrderIndex);
CREATE INDEX IF NOT EXISTS IxStepTargetGroup ON Step (TargetStepGroupId);
`;

const DDL_STEP_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS TrgStepRunGroupSameProjectInsert
BEFORE INSERT ON Step
WHEN NEW.TargetStepGroupId IS NOT NULL
 AND (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.TargetStepGroupId)
     <> (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.StepGroupId)
BEGIN
    SELECT RAISE(ABORT, 'TargetStepGroupId must belong to the same Project as StepGroupId');
END;

CREATE TRIGGER IF NOT EXISTS TrgStepRunGroupSameProjectUpdate
BEFORE UPDATE OF TargetStepGroupId, StepGroupId ON Step
WHEN NEW.TargetStepGroupId IS NOT NULL
 AND (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.TargetStepGroupId)
     <> (SELECT ProjectId FROM StepGroup WHERE StepGroupId = NEW.StepGroupId)
BEGIN
    SELECT RAISE(ABORT, 'TargetStepGroupId must belong to the same Project as StepGroupId');
END;
`;

const DDL_SCHEMA_MIGRATION = `
CREATE TABLE IF NOT EXISTS SchemaMigration (
    Version     INTEGER PRIMARY KEY,
    Description TEXT NOT NULL,
    AppliedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Apply (or upgrade to) the canonical schema. Idempotent — safe to
 * call on a fresh DB or one already at version
 * `STEP_LIBRARY_SCHEMA_VERSION`. Throws if the on-disk version is
 * NEWER than this codebase supports (caller MUST surface as a Code
 * Red error per mem://constraints/file-path-error-logging-code-red).
 */
export function applySchema(db: Database): void {
    db.exec("PRAGMA foreign_keys = ON;");

    const currentVersion = readUserVersion(db);
    if (currentVersion > STEP_LIBRARY_SCHEMA_VERSION) {
        throw new Error(
            `step-library DB at user_version=${currentVersion} but this build only supports ${STEP_LIBRARY_SCHEMA_VERSION}. ` +
            `Refusing to open — bundle was produced by a newer extension.`,
        );
    }

    db.exec("BEGIN;");
    try {
        db.exec(DDL_PROJECT);
        db.exec(DDL_STEP_GROUP);
        db.exec(DDL_STEP_GROUP_TRIGGERS);
        db.exec(DDL_STEP_KIND);
        db.exec(DDL_STEP);
        db.exec(DDL_STEP_TRIGGERS);
        db.exec(DDL_SCHEMA_MIGRATION);

        // Seed StepKind lookup (idempotent — INSERT OR IGNORE).
        const insertKind = db.prepare(
            "INSERT OR IGNORE INTO StepKind (StepKindId, Name) VALUES (?, ?);",
        );
        try {
            for (const k of STEP_KIND_SEED) {
                insertKind.run([k.Id, k.Name]);
            }
        } finally {
            insertKind.free();
        }

        if (currentVersion < STEP_LIBRARY_SCHEMA_VERSION) {
            db.exec(
                `INSERT OR IGNORE INTO SchemaMigration (Version, Description) VALUES (` +
                `${STEP_LIBRARY_SCHEMA_VERSION}, 'initial step-library schema');`,
            );
            db.exec(`PRAGMA user_version = ${STEP_LIBRARY_SCHEMA_VERSION};`);
        }
        db.exec("COMMIT;");
    } catch (e) {
        db.exec("ROLLBACK;");
        throw e;
    }
}

export function readUserVersion(db: Database): number {
    const res = db.exec("PRAGMA user_version;");
    if (res.length === 0 || res[0].values.length === 0) return 0;
    const v = res[0].values[0][0];
    return typeof v === "number" ? v : 0;
}
