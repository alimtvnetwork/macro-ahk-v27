/**
 * Phase 09 — Replay Determinism Verification
 *
 * Goal: prove that `resolveStepSelector(selectors)` produces an expression
 * which, when evaluated against the SAME DOM state twice in a row, lands
 * on the SAME element — and that this property holds across:
 *
 *   1. Repeat evaluation (idempotency)
 *   2. A clone of the original DOM (reproducibility on a fresh document)
 *   3. Selector input order shuffled (the resolver must not depend on
 *      array order, only on the IsPrimary flag + AnchorSelectorId chain)
 *   4. The full anchor chain (XPathRelative → XPathRelative → XPathFull)
 *
 * The DOM evaluator below is the same `document.evaluate` API the real
 * replay engine uses, so a green test here is a real behavioural proof
 * (not just a unit-level contract assertion) that recorded Steps replay
 * deterministically against the same page state.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import {
    RECORDER_DB_SCHEMA,
    SelectorKindId,
} from "../../recorder-db-schema";
import { insertStepRow, listSelectorsForStep } from "../step-persistence";
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

/** Render a deterministic checkout-form fixture. */
function renderFixture(): HTMLElement {
    document.body.innerHTML = `
        <main>
            <form id="checkout">
                <fieldset id="contact">
                    <label for="email">Email</label>
                    <input id="email" name="email" type="email" />
                    <label for="phone">Phone</label>
                    <input id="phone" name="phone" type="tel" />
                </fieldset>
                <button id="submit" type="submit" class="primary">Pay</button>
            </form>
            <button id="cancel" class="primary">Cancel</button>
        </main>
    `;
    return document.body;
}

beforeEach(() => {
    document.body.innerHTML = "";
});

/** Resolve an XPath against the live document. Throws if 0 or >1 hits. */
function evaluateXPath(expr: string): Element {
    const result = document.evaluate(
        expr,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
    );
    const length = result.snapshotLength;
    if (length !== 1) {
        throw new Error(
            `XPath "${expr}" matched ${length} nodes — replay expects exactly 1`,
        );
    }
    const node = result.snapshotItem(0);
    if (!(node instanceof Element)) {
        throw new Error(`XPath "${expr}" matched a non-Element node`);
    }
    return node;
}

/* ------------------------------------------------------------------ */
/*  1. Idempotency — same DOM, repeated evaluation                     */
/* ------------------------------------------------------------------ */

describe("replay determinism — same DOM state", () => {
    it("XPathFull resolves to the same node on repeated evaluation", () => {
        renderFixture();
        const db = freshDb();
        const step = insertStepRow(db, {
            StepKindId: 1,
            VariableName: "Submit",
            Label: "Click submit",
            InlineJs: null,
            IsBreakpoint: false,
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//button[@id='submit']",
                    AnchorSelectorId: null,
                    IsPrimary: true,
                },
            ],
        });
        const resolved = resolveStepSelector(listSelectorsForStep(db, step.StepId));
        const a = evaluateXPath(resolved.Expression);
        const b = evaluateXPath(resolved.Expression);
        expect(a).toBe(b);
        expect(a.id).toBe("submit");
    });

    it("XPathRelative anchored to a parent resolves to the same node", () => {
        renderFixture();
        const db = freshDb();

        const anchorStep = insertStepRow(db, {
            StepKindId: 1,
            VariableName: "ContactFieldset",
            Label: "Anchor: contact fieldset",
            InlineJs: null,
            IsBreakpoint: false,
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//fieldset[@id='contact']",
                    AnchorSelectorId: null,
                    IsPrimary: true,
                },
            ],
        });
        const anchorSel = listSelectorsForStep(db, anchorStep.StepId)[0];

        const relStep = insertStepRow(db, {
            StepKindId: 2,
            VariableName: "EmailInput",
            Label: "Type email",
            InlineJs: null,
            IsBreakpoint: false,
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathRelative,
                    Expression: ".//input[@name='email']",
                    AnchorSelectorId: anchorSel.SelectorId,
                    IsPrimary: true,
                },
            ],
        });
        const relSel = listSelectorsForStep(db, relStep.StepId);

        const resolved = resolveStepSelector([...relSel, anchorSel]);
        expect(resolved.Expression).toBe(
            "//fieldset[@id='contact']//input[@name='email']",
        );
        const node1 = evaluateXPath(resolved.Expression);
        const node2 = evaluateXPath(resolved.Expression);
        expect(node1).toBe(node2);
        expect((node1 as HTMLInputElement).name).toBe("email");
    });

    it("CSS-kind selector resolves to the same node via querySelector", () => {
        renderFixture();
        const selectors = [
            {
                SelectorId: 1,
                StepId: 1,
                SelectorKindId: SelectorKindId.Css,
                Expression: "form#checkout > button.primary",
                AnchorSelectorId: null,
                IsPrimary: 1,
            },
        ];
        const resolved = resolveStepSelector(selectors);
        const a = document.querySelector(resolved.Expression);
        const b = document.querySelector(resolved.Expression);
        expect(a).toBe(b);
        expect(a?.id).toBe("submit");
    });
});

/* ------------------------------------------------------------------ */
/*  2. Reproducibility — DOM rebuilt from the same source              */
/* ------------------------------------------------------------------ */

describe("replay determinism — DOM rebuilt", () => {
    it("same expression hits the same logical element after document reset", () => {
        renderFixture();
        const expr = "//form[@id='checkout']//input[@name='phone']";
        const idBefore = evaluateXPath(expr).id;

        // Tear down + re-render — simulates a page reload.
        document.body.innerHTML = "";
        renderFixture();

        const idAfter = evaluateXPath(expr).id;
        expect(idAfter).toBe(idBefore);
        expect(idAfter).toBe("phone");
    });
});

/* ------------------------------------------------------------------ */
/*  3. Selector input-order independence                               */
/* ------------------------------------------------------------------ */

describe("replay determinism — selector array order", () => {
    it("produces the same Expression when input array is shuffled", () => {
        const anchor = {
            SelectorId: 10,
            StepId: 1,
            SelectorKindId: SelectorKindId.XPathFull,
            Expression: "//main",
            AnchorSelectorId: null,
            IsPrimary: 0,
        };
        const primary = {
            SelectorId: 11,
            StepId: 1,
            SelectorKindId: SelectorKindId.XPathRelative,
            Expression: ".//button[@id='cancel']",
            AnchorSelectorId: 10,
            IsPrimary: 1,
        };

        const r1 = resolveStepSelector([anchor, primary]);
        const r2 = resolveStepSelector([primary, anchor]);
        expect(r1.Expression).toBe(r2.Expression);
        expect(r1.Expression).toBe("//main//button[@id='cancel']");
    });
});

/* ------------------------------------------------------------------ */
/*  4. Full anchor chain — Relative → Relative → Full                  */
/* ------------------------------------------------------------------ */

describe("replay determinism — multi-hop anchor chain", () => {
    it("resolves a 3-deep relative chain and the result lands on the right node", () => {
        renderFixture();

        const root = {
            SelectorId: 1,
            StepId: 1,
            SelectorKindId: SelectorKindId.XPathFull,
            Expression: "//main",
            AnchorSelectorId: null,
            IsPrimary: 0,
        };
        const form = {
            SelectorId: 2,
            StepId: 2,
            SelectorKindId: SelectorKindId.XPathRelative,
            Expression: ".//form[@id='checkout']",
            AnchorSelectorId: 1,
            IsPrimary: 0,
        };
        const fieldset = {
            SelectorId: 3,
            StepId: 3,
            SelectorKindId: SelectorKindId.XPathRelative,
            Expression: ".//fieldset[@id='contact']",
            AnchorSelectorId: 2,
            IsPrimary: 0,
        };
        const target = {
            SelectorId: 4,
            StepId: 4,
            SelectorKindId: SelectorKindId.XPathRelative,
            Expression: ".//input[@name='email']",
            AnchorSelectorId: 3,
            IsPrimary: 1,
        };

        const resolved = resolveStepSelector([target, fieldset, form, root]);
        expect(resolved.Expression).toBe(
            "//main//form[@id='checkout']//fieldset[@id='contact']//input[@name='email']",
        );
        expect(resolved.AnchorChain).toEqual([4, 3, 2, 1]);

        // Evaluate twice → same node.
        const n1 = evaluateXPath(resolved.Expression);
        const n2 = evaluateXPath(resolved.Expression);
        expect(n1).toBe(n2);
        expect((n1 as HTMLInputElement).id).toBe("email");
    });
});
