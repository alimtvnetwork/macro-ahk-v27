/**
 * Phase 06↔09 — Capture-to-Step Bridge unit tests.
 *
 * Verifies XPATH_CAPTURED payloads convert to a valid StepDraft + the
 * resulting Selector rows persist with the correct AnchorSelectorId
 * linkage.
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import { RECORDER_DB_SCHEMA, SelectorKindId, StepKindId } from "../../recorder-db-schema";
import {
    buildLabel,
    buildStepDraftFromCapture,
    deriveUrlTabClickParams,
    findAnchorSelectorId,
    inferStepKind,
    type XPathCapturePayload,
} from "../capture-to-step-bridge";
import { insertStepRow, listSelectorsForStep } from "../step-persistence";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: (f) => `node_modules/sql.js/dist/${f}` });
});

function freshDb(): SqlJsDatabase {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    db.run(RECORDER_DB_SCHEMA);
    return db;
}

const capture = (overrides: Partial<XPathCapturePayload> = {}): XPathCapturePayload => ({
    XPathFull: "//html/body/form/button[1]",
    XPathRelative: null,
    AnchorXPath: null,
    SuggestedVariableName: "SubmitButton",
    TagName: "button",
    Text: "Submit",
    ...overrides,
});

describe("inferStepKind", () => {
    it("maps input/textarea → Type", () => {
        expect(inferStepKind("INPUT")).toBe(StepKindId.Type);
        expect(inferStepKind("textarea")).toBe(StepKindId.Type);
    });
    it("maps select → Select", () => {
        expect(inferStepKind("SELECT")).toBe(StepKindId.Select);
    });
    it("defaults to Click", () => {
        expect(inferStepKind("button")).toBe(StepKindId.Click);
        expect(inferStepKind("a")).toBe(StepKindId.Click);
    });
});

describe("buildLabel", () => {
    it("uses tag + truncated text", () => {
        const label = buildLabel(capture({ TagName: "button", Text: "Hello" }));
        expect(label).toBe("<button> Hello");
    });
    it("falls back to bare tag when text is empty", () => {
        expect(buildLabel(capture({ Text: "" }))).toBe("<button>");
    });
    it("truncates text past 60 chars with ellipsis", () => {
        const long = "x".repeat(80);
        const label = buildLabel(capture({ Text: long }));
        expect(label.length).toBeLessThanOrEqual(80);
        expect(label.endsWith("…")).toBe(true);
    });
});

describe("buildStepDraftFromCapture", () => {
    it("emits a single primary XPathFull selector when no relative xpath", () => {
        const draft = buildStepDraftFromCapture(capture(), null);
        expect(draft.Selectors.length).toBe(1);
        expect(draft.Selectors[0].SelectorKindId).toBe(SelectorKindId.XPathFull);
        expect(draft.Selectors[0].IsPrimary).toBe(true);
        expect(draft.Selectors[0].AnchorSelectorId).toBeNull();
    });

    it("emits a second XPathRelative row when an anchor SelectorId is supplied", () => {
        const draft = buildStepDraftFromCapture(
            capture({
                XPathRelative: "./button[1]",
                AnchorXPath: "//html/body/form",
            }),
            42,
        );
        expect(draft.Selectors.length).toBe(2);
        const rel = draft.Selectors[1];
        expect(rel.SelectorKindId).toBe(SelectorKindId.XPathRelative);
        expect(rel.Expression).toBe("./button[1]");
        expect(rel.AnchorSelectorId).toBe(42);
        expect(rel.IsPrimary).toBe(false);
    });

    it("drops the relative selector silently when anchor is unknown", () => {
        const draft = buildStepDraftFromCapture(
            capture({
                XPathRelative: "./button[1]",
                AnchorXPath: "//html/body/form",
            }),
            null,
        );
        expect(draft.Selectors.length).toBe(1);
        expect(draft.Selectors[0].SelectorKindId).toBe(SelectorKindId.XPathFull);
    });

    it("rejects empty XPathFull and missing variable name", () => {
        expect(() =>
            buildStepDraftFromCapture(capture({ XPathFull: "" }), null),
        ).toThrow(/XPathFull/);
        expect(() =>
            buildStepDraftFromCapture(capture({ SuggestedVariableName: "" }), null),
        ).toThrow(/SuggestedVariableName/);
    });
});

describe("findAnchorSelectorId", () => {
    it("returns null when no matching primary XPathFull row exists", () => {
        const db = freshDb();
        expect(findAnchorSelectorId(db, "//html/body/form")).toBeNull();
    });

    it("returns the SelectorId of the most recent primary XPathFull match", () => {
        const db = freshDb();
        insertStepRow(db, {
            StepKindId: StepKindId.Click,
            VariableName: "FormAnchor",
            Label: "<form>",
            InlineJs: null,
            IsBreakpoint: false,
            Selectors: [
                {
                    SelectorKindId: SelectorKindId.XPathFull,
                    Expression: "//html/body/form",
                    AnchorSelectorId: null,
                    IsPrimary: true,
                },
            ],
        });
        const id = findAnchorSelectorId(db, "//html/body/form");
        expect(id).not.toBeNull();
        expect(typeof id).toBe("number");
    });
});

describe("end-to-end capture → persist", () => {
    it("anchored relative selector links to its anchor row in DB", () => {
        const db = freshDb();
        // 1. First capture establishes the anchor.
        const anchorStep = insertStepRow(
            db,
            buildStepDraftFromCapture(
                capture({
                    XPathFull: "//html/body/form",
                    SuggestedVariableName: "FormRoot",
                    TagName: "form",
                    Text: "",
                }),
                null,
            ),
        );
        const anchorSelectors = listSelectorsForStep(db, anchorStep.StepId);
        expect(anchorSelectors.length).toBe(1);
        const anchorId = anchorSelectors[0].SelectorId;

        // 2. Second capture references it.
        const anchorIdLookup = findAnchorSelectorId(db, "//html/body/form");
        expect(anchorIdLookup).toBe(anchorId);

        const childStep = insertStepRow(
            db,
            buildStepDraftFromCapture(
                capture({
                    XPathFull: "//html/body/form/button[1]",
                    XPathRelative: "./button[1]",
                    AnchorXPath: "//html/body/form",
                    SuggestedVariableName: "SubmitButton",
                }),
                anchorIdLookup,
            ),
        );

        const childSelectors = listSelectorsForStep(db, childStep.StepId);
        expect(childSelectors.length).toBe(2);
        const primary = childSelectors.find((s) => s.IsPrimary === 1);
        const relative = childSelectors.find(
            (s) => s.SelectorKindId === SelectorKindId.XPathRelative,
        );
        expect(primary?.Expression).toBe("//html/body/form/button[1]");
        expect(relative?.AnchorSelectorId).toBe(anchorId);
        expect(relative?.IsPrimary).toBe(0);
    });
});

describe("Spec 19.1 — UrlTabClick capture branch", () => {
    it("returns null when no UrlTabClickHint is supplied (plain Click)", () => {
        const params = deriveUrlTabClickParams(capture({ TagName: "a" }));
        expect(params).toBeNull();
    });

    it("derives Glob params from a target=_blank anchor click", () => {
        const params = deriveUrlTabClickParams(
            capture({
                TagName: "a",
                UrlTabClickHint: {
                    Tag: "a",
                    Target: "_blank",
                    Href: "https://app.example.com/orders/42",
                    LocationOrigin: "https://app.example.com",
                    WindowOpenCalled: false,
                },
            }),
        );
        expect(params).not.toBeNull();
        expect(params?.Mode).toBe("OpenNew");
        expect(params?.UrlMatch).toBe("Glob");
        expect(params?.UrlPattern).toBe("https://app.example.com/orders/*");
    });

    it("returns null when shouldRecordAsUrlTabClick says no (same-origin, no _blank, no window.open)", () => {
        const params = deriveUrlTabClickParams(
            capture({
                TagName: "a",
                UrlTabClickHint: {
                    Tag: "a",
                    Href: "https://app.example.com/orders/42",
                    LocationOrigin: "https://app.example.com",
                    WindowOpenCalled: false,
                },
            }),
        );
        expect(params).toBeNull();
    });

    it("buildStepDraftFromCapture promotes to StepKindId.UrlTabClick + ParamsJson", () => {
        const draft = buildStepDraftFromCapture(
            capture({
                TagName: "a",
                XPathFull: "//a[@id='order-42']",
                SuggestedVariableName: "OpenOrder42",
                UrlTabClickHint: {
                    Tag: "a",
                    Target: "_blank",
                    Href: "https://app.example.com/orders/42",
                    LocationOrigin: "https://app.example.com",
                    WindowOpenCalled: false,
                },
            }),
            null,
        );
        expect(draft.StepKindId).toBe(StepKindId.UrlTabClick);
        expect(draft.ParamsJson).not.toBeNull();
        const parsed = JSON.parse(draft.ParamsJson ?? "{}");
        expect(parsed.Mode).toBe("OpenNew");
        expect(parsed.Selector).toBe("//a[@id='order-42']");
        expect(parsed.SelectorKind).toBe("XPath");
    });

    it("persisted UrlTabClick row round-trips ParamsJson via listStepRows", () => {
        const db = freshDb();
        const draft = buildStepDraftFromCapture(
            capture({
                TagName: "a",
                XPathFull: "//a[@id='order-42']",
                SuggestedVariableName: "OpenOrder42",
                UrlTabClickHint: {
                    Tag: "a",
                    Target: "_blank",
                    Href: "https://app.example.com/orders/42",
                    LocationOrigin: "https://app.example.com",
                    WindowOpenCalled: false,
                },
            }),
            null,
        );
        const row = insertStepRow(db, draft);
        expect(row.StepKindId).toBe(StepKindId.UrlTabClick);
        expect(row.ParamsJson).not.toBeNull();
        const parsed = JSON.parse(row.ParamsJson ?? "{}");
        expect(parsed.UrlPattern).toBe("https://app.example.com/orders/*");
    });
});
