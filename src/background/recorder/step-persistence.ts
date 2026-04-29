/**
 * Marco Extension — Step + Selector Persistence
 *
 * Phase 09 — Macro Recorder.
 *
 * Persists `Step` rows and their child `Selector` rows in the per-project
 * SQLite database created by `recorder-db-schema.ts`.
 *
 * Contract:
 *   - One `Step` per recorded interaction (Click/Type/Select/Wait/JsInline).
 *   - 1..N `Selector` rows per Step. Exactly one MUST have `IsPrimary = 1`
 *     (enforced by the partial unique index `IxSelectorPrimaryPerStep`).
 *   - A `XPathRelative` selector MAY reference an `AnchorSelectorId` pointing
 *     to a previously-persisted selector row (CHECK enforces SelectorKindId=2).
 *   - `OrderIndex` is monotonically increasing per project; gaps are allowed
 *     after deletes; `nextOrderIndex` returns max+1.
 *
 * The pure DB-layer functions accept a `SqlJsDatabase` so they are testable
 * with an in-memory schema. The async wrappers route through `initProjectDb`
 * for production use.
 *
 * @see spec/31-macro-recorder/03-data-model.md  — Authoritative schema
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";
import {
    SelectorKindId,
    StepStatusId,
    type StepKindId,
} from "../recorder-db-schema";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface PersistedStep {
    readonly StepId: number;
    readonly StepKindId: number;
    readonly StepStatusId: number;
    readonly OrderIndex: number;
    readonly VariableName: string;
    readonly Label: string;
    readonly Description: string | null;
    readonly InlineJs: string | null;
    readonly ParamsJson: string | null;
    readonly IsBreakpoint: number;
    readonly IsDisabled: number;
    readonly RetryCount: number;
    readonly TimeoutMs: number | null;
    readonly OnSuccessProjectId: string | null;
    readonly OnFailureProjectId: string | null;
    readonly CapturedAt: string;
    readonly UpdatedAt: string;
}

export interface PersistedSelector {
    readonly SelectorId: number;
    readonly StepId: number;
    readonly SelectorKindId: number;
    readonly Expression: string;
    readonly AnchorSelectorId: number | null;
    readonly IsPrimary: number;
}

export interface SelectorDraft {
    readonly SelectorKindId: number;
    readonly Expression: string;
    readonly AnchorSelectorId: number | null;
    readonly IsPrimary: boolean;
}

export interface StepDraft {
    readonly StepKindId: (typeof StepKindId)[keyof typeof StepKindId];
    readonly VariableName: string;
    readonly Label: string;
    readonly InlineJs: string | null;
    /** JSON-serialised step-kind-specific params (e.g. UrlTabClickParams). */
    readonly ParamsJson?: string | null;
    readonly IsBreakpoint: boolean;
    readonly Selectors: ReadonlyArray<SelectorDraft>;
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer helpers (used by tests + async wrappers)             */
/* ------------------------------------------------------------------ */

export function nextOrderIndex(db: SqlJsDatabase): number {
    const result = db.exec("SELECT COALESCE(MAX(OrderIndex), 0) FROM Step");
    const max = (result[0]?.values[0]?.[0] as number | undefined) ?? 0;
    return max + 1;
}

export function insertStepRow(
    db: SqlJsDatabase,
    draft: StepDraft,
): PersistedStep {
    validateStepDraft(draft);

    const orderIndex = nextOrderIndex(db);

    db.run(
        `INSERT INTO Step
            (StepKindId, StepStatusId, OrderIndex, VariableName, Label, InlineJs, ParamsJson, IsBreakpoint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            draft.StepKindId,
            StepStatusId.Active,
            orderIndex,
            draft.VariableName,
            draft.Label,
            draft.InlineJs,
            draft.ParamsJson ?? null,
            draft.IsBreakpoint ? 1 : 0,
        ],
    );

    const stepId = lastInsertId(db);
    const step = readStepRow(db, stepId);

    insertSelectorsForStep(db, stepId, draft.Selectors);

    return step;
}

export function insertSelectorsForStep(
    db: SqlJsDatabase,
    stepId: number,
    drafts: ReadonlyArray<SelectorDraft>,
): ReadonlyArray<PersistedSelector> {
    if (drafts.length === 0) {
        throw new Error(`Step ${stepId} requires at least one selector`);
    }

    const primaryCount = drafts.filter((d) => d.IsPrimary).length;
    if (primaryCount !== 1) {
        throw new Error(
            `Step ${stepId} requires exactly one primary selector — got ${primaryCount}`,
        );
    }

    const inserted: PersistedSelector[] = [];
    for (const draft of drafts) {
        if (draft.AnchorSelectorId !== null && draft.SelectorKindId !== SelectorKindId.XPathRelative) {
            throw new Error(
                "AnchorSelectorId is only valid on XPathRelative selectors (SelectorKindId=2)",
            );
        }

        db.run(
            `INSERT INTO Selector
                (StepId, SelectorKindId, Expression, AnchorSelectorId, IsPrimary)
             VALUES (?, ?, ?, ?, ?)`,
            [
                stepId,
                draft.SelectorKindId,
                draft.Expression,
                draft.AnchorSelectorId,
                draft.IsPrimary ? 1 : 0,
            ],
        );
        inserted.push(readSelector(db, lastInsertId(db)));
    }
    return inserted;
}

const STEP_SELECT_COLUMNS =
    `StepId, StepKindId, StepStatusId, OrderIndex, VariableName,
     Label, Description, InlineJs, ParamsJson, IsBreakpoint,
     IsDisabled, RetryCount, TimeoutMs, OnSuccessProjectId, OnFailureProjectId,
     CapturedAt, UpdatedAt`;

export function listStepRows(db: SqlJsDatabase): ReadonlyArray<PersistedStep> {
    const result = db.exec(
        `SELECT ${STEP_SELECT_COLUMNS} FROM Step ORDER BY OrderIndex ASC`,
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToStep);
}

export function listSelectorsForStep(
    db: SqlJsDatabase,
    stepId: number,
): ReadonlyArray<PersistedSelector> {
    const result = db.exec(
        `SELECT SelectorId, StepId, SelectorKindId, Expression, AnchorSelectorId, IsPrimary
         FROM Selector
         WHERE StepId = ?
         ORDER BY IsPrimary DESC, SelectorId ASC`,
        [stepId],
    );
    const values = result[0]?.values ?? [];
    return values.map(rowToSelector);
}

export function deleteStepRow(db: SqlJsDatabase, stepId: number): void {
    // Selector + FieldBinding rows cascade via FK ON DELETE CASCADE.
    db.run("DELETE FROM Step WHERE StepId = ?", [stepId]);
}

/**
 * Renames a Step's `VariableName`. Throws if the new name collides with an
 * existing Step (the partial unique index `IxStepVariableNameUnique` would
 * also reject it, but we surface a friendly error first). Touches
 * `UpdatedAt`.
 */
export function updateStepVariableNameRow(
    db: SqlJsDatabase,
    stepId: number,
    newVariableName: string,
): PersistedStep {
    if (!newVariableName || newVariableName.trim().length === 0) {
        throw new Error("VariableName cannot be empty");
    }

    const conflict = db.exec(
        "SELECT StepId FROM Step WHERE VariableName = ? AND StepId != ?",
        [newVariableName, stepId],
    );
    if ((conflict[0]?.values.length ?? 0) > 0) {
        throw new Error(
            `VariableName "${newVariableName}" already used by another Step`,
        );
    }

    db.run(
        `UPDATE Step
         SET VariableName = ?, UpdatedAt = datetime('now')
         WHERE StepId = ?`,
        [newVariableName, stepId],
    );

    return readStepRow(db, stepId);
}

/* ------------------------------------------------------------------ */
/*  Async facade — the production callers                              */
/* ------------------------------------------------------------------ */

export async function insertStep(
    projectSlug: string,
    draft: StepDraft,
): Promise<{ step: PersistedStep; selectors: ReadonlyArray<PersistedSelector> }> {
    const mgr = await initProjectDb(projectSlug);
    const db = mgr.getDb();
    const step = insertStepRow(db, draft);
    const selectors = listSelectorsForStep(db, step.StepId);
    mgr.markDirty();
    return { step, selectors };
}

export async function listSteps(
    projectSlug: string,
): Promise<ReadonlyArray<PersistedStep>> {
    const mgr = await initProjectDb(projectSlug);
    return listStepRows(mgr.getDb());
}

export async function listSelectors(
    projectSlug: string,
    stepId: number,
): Promise<ReadonlyArray<PersistedSelector>> {
    const mgr = await initProjectDb(projectSlug);
    return listSelectorsForStep(mgr.getDb(), stepId);
}

export async function deleteStep(
    projectSlug: string,
    stepId: number,
): Promise<void> {
    const mgr = await initProjectDb(projectSlug);
    deleteStepRow(mgr.getDb(), stepId);
    mgr.markDirty();
}

export async function updateStepVariableName(
    projectSlug: string,
    stepId: number,
    newVariableName: string,
): Promise<PersistedStep> {
    const mgr = await initProjectDb(projectSlug);
    const step = updateStepVariableNameRow(mgr.getDb(), stepId, newVariableName);
    mgr.markDirty();
    return step;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function validateStepDraft(draft: StepDraft): void {
    if (!draft.VariableName) throw new Error("Step.VariableName is required");
    if (!draft.Label) throw new Error("Step.Label is required");
    if (draft.Selectors.length === 0) {
        throw new Error("Step requires at least one selector draft");
    }
}

function lastInsertId(db: SqlJsDatabase): number {
    const result = db.exec("SELECT last_insert_rowid()");
    return result[0].values[0][0] as number;
}

/**
 * Reads a single Step row by id. Exported so the Phase 14 chain helpers in
 * `step-chain-persistence.ts` can return the canonical PersistedStep shape
 * after a meta/link patch instead of duplicating column lists.
 */
export function readStepRow(db: SqlJsDatabase, stepId: number): PersistedStep {
    const result = db.exec(
        `SELECT ${STEP_SELECT_COLUMNS} FROM Step WHERE StepId = ?`,
        [stepId],
    );
    const row = result[0]?.values[0];
    if (row === undefined) {
        throw new Error(`Step row missing for StepId ${stepId}`);
    }
    return rowToStep(row);
}

function readSelector(db: SqlJsDatabase, selectorId: number): PersistedSelector {
    const result = db.exec(
        `SELECT SelectorId, StepId, SelectorKindId, Expression, AnchorSelectorId, IsPrimary
         FROM Selector WHERE SelectorId = ?`,
        [selectorId],
    );
    const row = result[0]?.values[0];
    if (row === undefined) {
        throw new Error(`Selector row missing for SelectorId ${selectorId}`);
    }
    return rowToSelector(row);
}

function rowToStep(row: ReadonlyArray<unknown>): PersistedStep {
    return {
        StepId: row[0] as number,
        StepKindId: row[1] as number,
        StepStatusId: row[2] as number,
        OrderIndex: row[3] as number,
        VariableName: row[4] as string,
        Label: row[5] as string,
        Description: (row[6] as string | null) ?? null,
        InlineJs: (row[7] as string | null) ?? null,
        ParamsJson: (row[8] as string | null) ?? null,
        IsBreakpoint: row[9] as number,
        IsDisabled: row[10] as number,
        RetryCount: row[11] as number,
        TimeoutMs: (row[12] as number | null) ?? null,
        OnSuccessProjectId: (row[13] as string | null) ?? null,
        OnFailureProjectId: (row[14] as string | null) ?? null,
        CapturedAt: row[15] as string,
        UpdatedAt: row[16] as string,
    };
}

function rowToSelector(row: ReadonlyArray<unknown>): PersistedSelector {
    return {
        SelectorId: row[0] as number,
        StepId: row[1] as number,
        SelectorKindId: row[2] as number,
        Expression: row[3] as string,
        AnchorSelectorId: (row[4] as number | null) ?? null,
        IsPrimary: row[5] as number,
    };
}
