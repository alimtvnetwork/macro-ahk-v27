/**
 * Marco Extension — Step Library DB Wrapper
 *
 * Synchronous CRUD over the schema defined in `./schema.ts`. Pure
 * sql.js — no OPFS, no chrome.storage, no service-worker concerns.
 * The OPFS persistence layer wraps this module (see
 * `./persistence.ts`) and keeps writes serialised behind a single
 * promise queue.
 *
 * Why sync API: sql.js itself is synchronous; exposing async here
 * would lie about latency (it would be microtasks, not real I/O).
 * The wrapper that flushes to OPFS is the only async surface.
 *
 * Failure handling: every method that the user can trigger MUST emit
 * structured errors via `buildFailureReport()` from
 * `src/background/recorder/failure-logger.ts` when it's surfaced to
 * the UI. This module throws plain `Error`s; the calling layer wraps
 * them. See mem://standards/verbose-logging-and-failure-diagnostics.
 *
 * @see ./schema.ts
 * @see spec/31-macro-recorder/16-step-group-library.md  §8.1
 */

import type { Database } from "sql.js";
import { applySchema, StepKindId } from "./schema";

/* ------------------------------------------------------------------ */
/*  Row shapes (PascalCase, mirrors DDL exactly)                       */
/* ------------------------------------------------------------------ */

export interface ProjectRow {
    readonly ProjectId: number;
    readonly ProjectExternalId: string;
    readonly Name: string;
    readonly CreatedAt: string;
    readonly UpdatedAt: string;
}

export interface StepGroupRow {
    readonly StepGroupId: number;
    readonly ProjectId: number;
    readonly ParentStepGroupId: number | null;
    readonly Name: string;
    readonly Description: string | null;
    readonly OrderIndex: number;
    readonly IsArchived: boolean;
    readonly CreatedAt: string;
    readonly UpdatedAt: string;
}

export interface StepRow {
    readonly StepId: number;
    readonly StepGroupId: number;
    readonly OrderIndex: number;
    readonly StepKindId: StepKindId;
    readonly Label: string | null;
    readonly PayloadJson: string | null;
    readonly TargetStepGroupId: number | null;
    readonly IsDisabled: boolean;
    readonly CreatedAt: string;
    readonly UpdatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

/**
 * Synchronous wrapper around a sql.js `Database`. The constructor
 * automatically applies the schema (idempotent), so callers can hand
 * in a fresh DB or a deserialised one.
 */
export class StepLibraryDb {
    constructor(private readonly db: Database) {
        applySchema(db);
    }

    /** Direct DB access for the persistence/export layer. */
    get raw(): Database { return this.db; }

    /* -------------------- Project --------------------------------- */

    upsertProject(input: { ExternalId: string; Name: string }): number {
        const stmt = this.db.prepare(
            `INSERT INTO Project (ProjectExternalId, Name) VALUES (?, ?)
             ON CONFLICT(ProjectExternalId) DO UPDATE SET
                 Name = excluded.Name,
                 UpdatedAt = datetime('now')
             RETURNING ProjectId;`,
        );
        try {
            stmt.bind([input.ExternalId, input.Name]);
            if (!stmt.step()) {
                throw new Error("upsertProject: RETURNING returned no row");
            }
            const row = stmt.getAsObject();
            return row.ProjectId as number;
        } finally {
            stmt.free();
        }
    }

    listProjects(): readonly ProjectRow[] {
        return this.selectAll<ProjectRow>(
            `SELECT ProjectId, ProjectExternalId, Name, CreatedAt, UpdatedAt
             FROM Project ORDER BY Name COLLATE NOCASE ASC;`,
        );
    }

    /* -------------------- StepGroup ------------------------------- */

    listGroups(projectId: number): readonly StepGroupRow[] {
        return this.selectAll<StepGroupRow>(
            `SELECT StepGroupId, ProjectId, ParentStepGroupId, Name, Description,
                    OrderIndex, IsArchived, CreatedAt, UpdatedAt
             FROM StepGroup
             WHERE ProjectId = ?
             ORDER BY ParentStepGroupId IS NULL DESC,
                      ParentStepGroupId ASC,
                      OrderIndex ASC, Name COLLATE NOCASE ASC;`,
            [projectId],
        ).map(coerceGroupRow);
    }

    createGroup(input: {
        ProjectId: number;
        ParentStepGroupId: number | null;
        Name: string;
        Description?: string | null;
        OrderIndex?: number;
    }): number {
        const stmt = this.db.prepare(
            `INSERT INTO StepGroup
                (ProjectId, ParentStepGroupId, Name, Description, OrderIndex)
             VALUES (?, ?, ?, ?, ?)
             RETURNING StepGroupId;`,
        );
        try {
            stmt.bind([
                input.ProjectId,
                input.ParentStepGroupId,
                input.Name,
                input.Description ?? null,
                input.OrderIndex ?? 0,
            ]);
            if (!stmt.step()) {
                throw new Error("createGroup: RETURNING returned no row");
            }
            return stmt.getAsObject().StepGroupId as number;
        } finally {
            stmt.free();
        }
    }

    renameGroup(stepGroupId: number, newName: string): void {
        this.exec(
            `UPDATE StepGroup SET Name = ?, UpdatedAt = datetime('now')
             WHERE StepGroupId = ?;`,
            [newName, stepGroupId],
        );
    }

    moveGroup(stepGroupId: number, newParentId: number | null): void {
        this.exec(
            `UPDATE StepGroup SET ParentStepGroupId = ?, UpdatedAt = datetime('now')
             WHERE StepGroupId = ?;`,
            [newParentId, stepGroupId],
        );
    }

    deleteGroup(stepGroupId: number): void {
        this.exec(`DELETE FROM StepGroup WHERE StepGroupId = ?;`, [stepGroupId]);
    }

    /**
     * Reorder sibling groups under a single parent. Behaves like
     * `reorderSteps`: validates that every supplied id belongs to the
     * given (project, parent) bucket and that the count matches the
     * existing children — partial reorders are rejected to avoid
     * holes / duplicate OrderIndex values.
     *
     * `parentStepGroupId === null` reorders root-level groups.
     */
    reorderGroups(
        projectId: number,
        parentStepGroupId: number | null,
        orderedStepGroupIds: readonly number[],
    ): void {
        const owned = new Set(
            this.listGroups(projectId)
                .filter((g) => (g.ParentStepGroupId ?? null) === parentStepGroupId)
                .map((g) => g.StepGroupId),
        );
        for (const id of orderedStepGroupIds) {
            if (!owned.has(id)) {
                throw new Error(
                    `reorderGroups: StepGroupId ${id} is not a child of parent=${String(parentStepGroupId)} ` +
                    `in ProjectId=${projectId}. Refusing partial reorder — would corrupt OrderIndex.`,
                );
            }
        }
        if (orderedStepGroupIds.length !== owned.size) {
            throw new Error(
                `reorderGroups: expected ${owned.size} sibling ids, got ${orderedStepGroupIds.length}. ` +
                `Caller must pass the COMPLETE list of siblings under parent=${String(parentStepGroupId)}.`,
            );
        }

        this.db.exec("BEGIN;");
        try {
            const stmt = this.db.prepare(
                `UPDATE StepGroup SET OrderIndex = ?, UpdatedAt = datetime('now')
                 WHERE StepGroupId = ?;`,
            );
            try {
                for (let i = 0; i < orderedStepGroupIds.length; i++) {
                    stmt.run([i, orderedStepGroupIds[i]]);
                }
            } finally {
                stmt.free();
            }
            this.db.exec("COMMIT;");
        } catch (e) {
            this.db.exec("ROLLBACK;");
            throw e;
        }
    }

    /**
     * Toggle the `IsArchived` flag on a single group. Archiving does
     * NOT touch nested groups or steps — they remain queryable; the UI
     * is responsible for hiding archived subtrees behind a toggle.
     */
    setGroupArchived(stepGroupId: number, archived: boolean): void {
        this.exec(
            `UPDATE StepGroup SET IsArchived = ?, UpdatedAt = datetime('now')
             WHERE StepGroupId = ?;`,
            [archived ? 1 : 0, stepGroupId],
        );
    }

    /* -------------------- Step ------------------------------------ */

    listSteps(stepGroupId: number): readonly StepRow[] {
        return this.selectAll<StepRow>(
            `SELECT StepId, StepGroupId, OrderIndex, StepKindId, Label,
                    PayloadJson, TargetStepGroupId, IsDisabled, CreatedAt, UpdatedAt
             FROM Step
             WHERE StepGroupId = ?
             ORDER BY OrderIndex ASC, StepId ASC;`,
            [stepGroupId],
        ).map(coerceStepRow);
    }

    appendStep(input: {
        StepGroupId: number;
        StepKindId: StepKindId;
        Label?: string | null;
        PayloadJson?: string | null;
        TargetStepGroupId?: number | null;
    }): number {
        // Validate the RunGroup invariant in JS too — the CHECK
        // constraint catches it at the DB but a clear error is nicer.
        const isRunGroup = input.StepKindId === StepKindId.RunGroup;
        if (isRunGroup && (input.TargetStepGroupId === undefined || input.TargetStepGroupId === null)) {
            throw new Error(
                "appendStep: StepKind=RunGroup requires TargetStepGroupId. " +
                "Without a target the runner cannot resolve which group to invoke.",
            );
        }
        if (!isRunGroup && input.TargetStepGroupId !== undefined && input.TargetStepGroupId !== null) {
            throw new Error(
                "appendStep: TargetStepGroupId is only valid when StepKind=RunGroup.",
            );
        }

        const nextOrder = this.scalarNumber(
            `SELECT COALESCE(MAX(OrderIndex), -1) + 1 FROM Step WHERE StepGroupId = ?;`,
            [input.StepGroupId],
        );
        const stmt = this.db.prepare(
            `INSERT INTO Step
                (StepGroupId, OrderIndex, StepKindId, Label, PayloadJson, TargetStepGroupId)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING StepId;`,
        );
        try {
            stmt.bind([
                input.StepGroupId,
                nextOrder,
                input.StepKindId,
                input.Label ?? null,
                input.PayloadJson ?? null,
                input.TargetStepGroupId ?? null,
            ]);
            if (!stmt.step()) {
                throw new Error("appendStep: RETURNING returned no row");
            }
            return stmt.getAsObject().StepId as number;
        } finally {
            stmt.free();
        }
    }

    reorderSteps(stepGroupId: number, orderedStepIds: readonly number[]): void {
        // Verify all IDs belong to this group; reject mixed-group reorders.
        const owned = new Set(this.listSteps(stepGroupId).map((s) => s.StepId));
        for (const id of orderedStepIds) {
            if (!owned.has(id)) {
                throw new Error(
                    `reorderSteps: StepId ${id} does not belong to StepGroup ${stepGroupId}`,
                );
            }
        }
        if (orderedStepIds.length !== owned.size) {
            throw new Error(
                `reorderSteps: expected ${owned.size} step IDs, got ${orderedStepIds.length}`,
            );
        }
        this.db.exec("BEGIN;");
        try {
            const stmt = this.db.prepare(
                `UPDATE Step SET OrderIndex = ?, UpdatedAt = datetime('now')
                 WHERE StepId = ?;`,
            );
            try {
                for (let i = 0; i < orderedStepIds.length; i++) {
                    stmt.run([i, orderedStepIds[i]]);
                }
            } finally {
                stmt.free();
            }
            this.db.exec("COMMIT;");
        } catch (e) {
            this.db.exec("ROLLBACK;");
            throw e;
        }
    }

    deleteStep(stepId: number): void {
        this.exec(`DELETE FROM Step WHERE StepId = ?;`, [stepId]);
    }

    /**
     * Edit a single step in place. The (StepKindId, TargetStepGroupId)
     * invariant from `appendStep` applies here too: RunGroup steps
     * require a target, every other kind must have target=null.
     * `OrderIndex` is preserved — use `reorderSteps` to move a step.
     */
    updateStep(input: {
        StepId: number;
        StepKindId: StepKindId;
        Label?: string | null;
        PayloadJson?: string | null;
        TargetStepGroupId?: number | null;
    }): void {
        const isRunGroup = input.StepKindId === StepKindId.RunGroup;
        if (isRunGroup && (input.TargetStepGroupId === undefined || input.TargetStepGroupId === null)) {
            throw new Error(
                "updateStep: StepKind=RunGroup requires TargetStepGroupId.",
            );
        }
        if (!isRunGroup && input.TargetStepGroupId !== undefined && input.TargetStepGroupId !== null) {
            throw new Error(
                "updateStep: TargetStepGroupId is only valid when StepKind=RunGroup.",
            );
        }
        this.exec(
            `UPDATE Step
             SET StepKindId = ?, Label = ?, PayloadJson = ?, TargetStepGroupId = ?,
                 UpdatedAt = datetime('now')
             WHERE StepId = ?;`,
            [
                input.StepKindId,
                input.Label ?? null,
                input.PayloadJson ?? null,
                input.TargetStepGroupId ?? null,
                input.StepId,
            ],
        );
    }

    /**
     * Toggle the `IsDisabled` flag on a single step. The runner's
     * expansion phase (`expandRunGroups`) drops disabled steps from
     * the plan when `skipDisabled` is left at its default `true`, so
     * flipping this flag is the canonical way to test that a step is
     * skipped at runtime without having to delete + re-create it.
     */
    setStepDisabled(stepId: number, disabled: boolean): void {
        this.exec(
            `UPDATE Step SET IsDisabled = ?, UpdatedAt = datetime('now')
             WHERE StepId = ?;`,
            [disabled ? 1 : 0, stepId],
        );
    }

    /* -------------------- Snapshot -------------------------------- */

    /** Serialize the entire DB to bytes (for export). */
    exportDbBytes(): Uint8Array {
        return this.db.export();
    }

    /* -------------------- Private --------------------------------- */

    private exec(sql: string, params: ReadonlyArray<number | string | null>): void {
        const stmt = this.db.prepare(sql);
        try {
            stmt.run(params as Array<number | string | null>);
        } finally {
            stmt.free();
        }
    }

    private selectAll<T>(sql: string, params: ReadonlyArray<number | string | null> = []): T[] {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params as Array<number | string | null>);
            const rows: T[] = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject() as unknown as T);
            }
            return rows;
        } finally {
            stmt.free();
        }
    }

    private scalarNumber(sql: string, params: ReadonlyArray<number | string | null>): number {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params as Array<number | string | null>);
            if (!stmt.step()) return 0;
            const v = stmt.get()[0];
            return typeof v === "number" ? v : 0;
        } finally {
            stmt.free();
        }
    }
}

/** sql.js returns INTEGERs as numbers but TINYINT booleans need coercion. */
function coerceGroupRow(r: StepGroupRow): StepGroupRow {
    return { ...r, IsArchived: Boolean(r.IsArchived) };
}

function coerceStepRow(r: StepRow): StepRow {
    return { ...r, IsDisabled: Boolean(r.IsDisabled) };
}
