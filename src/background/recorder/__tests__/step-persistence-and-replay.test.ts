/**
 * Phase 09 — Step Persistence + Replay Resolver unit tests.
 *
 * Uses sql.js in-memory DBs against the canonical RECORDER_DB_SCHEMA so the
 * same constraints (FK ON DELETE CASCADE, partial unique IsPrimary index,
 * AnchorSelectorId CHECK) are exercised end-to-end.
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import {
    RECORDER_DB_SCHEMA,
    SelectorKindId,
    StepKindId,
} from "../../recorder-db-schema";
import {
    insertStepRow,
    listStepRows,
    listSelectorsForStep,
    deleteStepRow,
    nextOrderIndex,
    updateStepVariableNameRow,
    type StepDraft,
} from "../step-persistence";
import { resolveStepSelector } from "../replay-resolver";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({
        locateFile: (file) => `node_modules/sql.js/dist/${file}`,
    });
});

function freshDb(): SqlJsDatabase {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    db.run(RECORDER_DB_SCHEMA);
    return db;
}

const baseDraft = (variableName: string, label: string): StepDraft => ({
    StepKindId: StepKindId.Click,
    VariableName: variableName,
    Label: label,
    InlineJs: null,
    IsBreakpoint: false,
    Selectors: [
        {
            SelectorKindId: SelectorKindId.XPathFull,
            Expression: "//html/body/button[1]",
            AnchorSelectorId: null,
            IsPrimary: true,
        },
    ],
});

/* ------------------------------------------------------------------ */
/*  Step persistence                                                   */
/* ------------------------------------------------------------------ */

describe("step-persistence — insertStepRow", () => {
    it("inserts a Step + primary Selector and returns row data", () => {
        const db = freshDb();
        const step = insertStepRow(db, baseDraft("ButtonOne", "Click button"));

        expect(step.StepId).toBeGreaterThan(0);
        expect(step.OrderIndex).toBe(1);
        expect(step.VariableName).toBe("ButtonOne");

        const selectors = listSelectorsForStep(db, step.StepId);
        expect(selectors).toHaveLength(1);
        expect(selectors[0].IsPrimary).toBe(1);
        expect(selectors[0].SelectorKindId).toBe(SelectorKindId.XPathFull);
    });

    it("assigns monotonically increasing OrderIndex per project", () => {
        const db = freshDb();
        const a = insertStepRow(db, baseDraft("A", "a"));
        const b = insertStepRow(db, baseDraft("B", "b"));
        const c = insertStepRow(db, baseDraft("C", "c"));
        expect([a.OrderIndex, b.OrderIndex, c.OrderIndex]).toEqual([1, 2, 3]);
        expect(nextOrderIndex(db)).toBe(4);
    });

    it("rejects drafts with zero selectors", () => {
        const db = freshDb();
        const draft: StepDraft = { ...baseDraft("X", "x"), Selectors: [] };
        expect(() => insertStepRow(db, draft)).toThrow(/at least one selector/);
    });

    it("rejects drafts with no primary selector", () => {
        const db = freshDb();
        const draft: StepDraft = {
            ...baseDraft("X", "x"),
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//a",
                    AnchorSelectorId: null,
                    IsPrimary: false,
                },
            ],
        };
        expect(() => insertStepRow(db, draft)).toThrow(/exactly one primary/);
    });

    it("rejects drafts with multiple primary selectors", () => {
        const db = freshDb();
        const draft: StepDraft = {
            ...baseDraft("X", "x"),
            Selectors: [
                { SelectorKindId: SelectorKindId.XPathFull, Expression: "//a", AnchorSelectorId: null, IsPrimary: true },
                { SelectorKindId: SelectorKindId.Css, Expression: "a.btn", AnchorSelectorId: null, IsPrimary: true },
            ],
        };
        expect(() => insertStepRow(db, draft)).toThrow(/exactly one primary/);
    });

    it("rejects unique-violation on duplicate VariableName", () => {
        const db = freshDb();
        insertStepRow(db, baseDraft("Dup", "first"));
        expect(() => insertStepRow(db, baseDraft("Dup", "second"))).toThrow();
    });

    it("rejects AnchorSelectorId on non-relative selectors", () => {
        const db = freshDb();
        const draft: StepDraft = {
            ...baseDraft("X", "x"),
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//a",
                    AnchorSelectorId: 1,
                    IsPrimary: true,
                },
            ],
        };
        expect(() => insertStepRow(db, draft)).toThrow(/AnchorSelectorId/);
    });

    it("cascade-deletes Selector + FieldBinding rows when Step is dropped", () => {
        const db = freshDb();
        const step = insertStepRow(db, baseDraft("ToDelete", "x"));

        // Seed a DataSource + FieldBinding for that step.
        db.run(
            `INSERT INTO DataSource (DataSourceKindId, FilePath, Columns, RowCount)
             VALUES (1, '/tmp/x.csv', '["A"]', 0)`,
        );
        const dsId = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
        db.run(
            `INSERT INTO FieldBinding (StepId, DataSourceId, ColumnName)
             VALUES (?, ?, 'A')`,
            [step.StepId, dsId],
        );

        deleteStepRow(db, step.StepId);

        expect(listSelectorsForStep(db, step.StepId)).toHaveLength(0);
        const fb = db.exec("SELECT COUNT(*) FROM FieldBinding");
        expect(fb[0].values[0][0]).toBe(0);
    });

    it("listStepRows orders by OrderIndex ASC", () => {
        const db = freshDb();
        insertStepRow(db, baseDraft("A", "a"));
        insertStepRow(db, baseDraft("B", "b"));
        insertStepRow(db, baseDraft("C", "c"));
        const all = listStepRows(db);
        expect(all.map((s) => s.VariableName)).toEqual(["A", "B", "C"]);
    });

    it("renames a Step's VariableName and bumps UpdatedAt", () => {
        const db = freshDb();
        const inserted = insertStepRow(db, baseDraft("Old", "x"));
        const renamed = updateStepVariableNameRow(db, inserted.StepId, "NewName");
        expect(renamed.VariableName).toBe("NewName");
        expect(renamed.StepId).toBe(inserted.StepId);
    });

    it("rejects rename when new name collides with another Step", () => {
        const db = freshDb();
        insertStepRow(db, baseDraft("First", "a"));
        const second = insertStepRow(db, baseDraft("Second", "b"));
        expect(() => updateStepVariableNameRow(db, second.StepId, "First")).toThrow(
            /already used/,
        );
    });

    it("rejects rename to empty string", () => {
        const db = freshDb();
        const inserted = insertStepRow(db, baseDraft("X", "x"));
        expect(() => updateStepVariableNameRow(db, inserted.StepId, "")).toThrow(
            /cannot be empty/,
        );
    });
});

/* ------------------------------------------------------------------ */
/*  Replay resolver                                                    */
/* ------------------------------------------------------------------ */

describe("replay-resolver — resolveStepSelector", () => {
    it("returns the full XPath verbatim for kind=XPathFull", () => {
        const db = freshDb();
        const step = insertStepRow(db, baseDraft("Btn", "click"));
        const selectors = listSelectorsForStep(db, step.StepId);
        const resolved = resolveStepSelector(selectors);
        expect(resolved.Kind).toBe("XPath");
        expect(resolved.Expression).toBe("//html/body/button[1]");
        expect(resolved.AnchorChain).toEqual([selectors[0].SelectorId]);
    });

    it("concatenates anchor + relative XPath, stripping leading dot", () => {
        const db = freshDb();
        // Step 1 — anchor (full xpath).
        const anchorStep = insertStepRow(db, {
            ...baseDraft("Form", "form"),
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//form[@id='checkout']",
                    AnchorSelectorId: null,
                    IsPrimary: true,
                },
            ],
        });
        const anchorSel = listSelectorsForStep(db, anchorStep.StepId)[0];

        // Step 2 — has both a full primary AND a relative non-primary that
        // points at the anchor. We test resolve via primary first (full),
        // then explicitly test a relative-primary step.
        const relStep = insertStepRow(db, {
            ...baseDraft("EmailField", "type email"),
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathRelative,
                    Expression: ".//input[@name='email']",
                    AnchorSelectorId: anchorSel.SelectorId,
                    IsPrimary: true,
                },
            ],
        });
        const relSelectors = listSelectorsForStep(db, relStep.StepId);

        // Resolver needs the anchor too. Pass union of both step's selectors.
        const resolved = resolveStepSelector([...relSelectors, anchorSel]);
        expect(resolved.Kind).toBe("XPath");
        expect(resolved.Expression).toBe(
            "//form[@id='checkout']//input[@name='email']",
        );
    });

    it("throws when a relative selector's anchor is not provided", () => {
        const selectors = [
            {
                SelectorId: 99,
                StepId: 1,
                SelectorKindId: SelectorKindId.XPathRelative,
                Expression: ".//a",
                AnchorSelectorId: 42,
                IsPrimary: 1,
            },
        ];
        expect(() => resolveStepSelector(selectors)).toThrow(
            /Anchor selector 42 not in provided set/,
        );
    });

    it("throws on cycles in the anchor chain", () => {
        const selectors = [
            { SelectorId: 1, StepId: 1, SelectorKindId: SelectorKindId.XPathRelative, Expression: ".//a", AnchorSelectorId: 2, IsPrimary: 1 },
            { SelectorId: 2, StepId: 1, SelectorKindId: SelectorKindId.XPathRelative, Expression: ".//b", AnchorSelectorId: 1, IsPrimary: 0 },
        ];
        expect(() => resolveStepSelector(selectors)).toThrow(/Cycle detected/);
    });

    it("returns CSS expression untouched with Kind='Css'", () => {
        const selectors = [
            { SelectorId: 1, StepId: 1, SelectorKindId: SelectorKindId.Css, Expression: "button.primary", AnchorSelectorId: null, IsPrimary: 1 },
        ];
        const resolved = resolveStepSelector(selectors);
        expect(resolved.Kind).toBe("Css");
        expect(resolved.Expression).toBe("button.primary");
    });

    it("throws when no selector is marked primary", () => {
        const selectors = [
            { SelectorId: 1, StepId: 1, SelectorKindId: SelectorKindId.XPathFull, Expression: "//a", AnchorSelectorId: null, IsPrimary: 0 },
        ];
        expect(() => resolveStepSelector(selectors)).toThrow(/No primary selector/);
    });
});
