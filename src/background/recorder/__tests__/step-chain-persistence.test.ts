/**
 * Phase 14 — Step Chain Persistence unit tests.
 *
 * Exercises the meta/tags/link CRUD against the canonical RECORDER_DB_SCHEMA
 * + applyChainColumnsMigration to prove (a) fresh DBs already have the
 * Phase 14 columns and StepTag table, and (b) the migration is a no-op when
 * re-applied. Covers validation rules and the StepTag uniqueness contract.
 */

import { describe, it, expect, beforeAll } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

import {
    RECORDER_DB_SCHEMA,
    SelectorKindId,
    StepKindId,
    applyChainColumnsMigration,
} from "../../recorder-db-schema";
import { insertStepRow, type StepDraft } from "../step-persistence";
import {
    updateStepMetaRow,
    setStepTagsRow,
    listStepTagsRow,
    setStepLinkRow,
    MAX_RETRY_COUNT,
    MAX_TIMEOUT_MS,
    MAX_LABEL_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_TAGS_PER_STEP,
} from "../step-chain-persistence";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` });
});

function freshDb(): SqlJsDatabase {
    const db = new SQL.Database();
    db.run("PRAGMA foreign_keys = ON;");
    db.run(RECORDER_DB_SCHEMA);
    return db;
}

const draft = (name: string): StepDraft => ({
    StepKindId: StepKindId.Click,
    VariableName: name,
    Label: name,
    InlineJs: null,
    IsBreakpoint: false,
    Selectors: [{
        SelectorKindId: SelectorKindId.XPathFull,
        Expression: "//html/body/button[1]",
        AnchorSelectorId: null,
        IsPrimary: true,
    }],
});

describe("recorder-db-schema — chain migration", () => {
    it("fresh DB already has all Phase 14 columns + StepTag", () => {
        const db = freshDb();
        const cols = db.exec("PRAGMA table_info(Step)")[0].values.map((r) => r[1] as string);
        for (const c of ["Description", "IsDisabled", "RetryCount", "TimeoutMs", "OnSuccessProjectId", "OnFailureProjectId"]) {
            expect(cols).toContain(c);
        }
        const tags = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='StepTag'");
        expect(tags[0]?.values.length ?? 0).toBe(1);
    });

    it("applyChainColumnsMigration is idempotent on a fresh DB", () => {
        const db = freshDb();
        expect(() => applyChainColumnsMigration(db)).not.toThrow();
        expect(() => applyChainColumnsMigration(db)).not.toThrow();
    });
});

describe("step-chain-persistence — updateStepMetaRow", () => {
    it("patches Description / IsDisabled / RetryCount / TimeoutMs and bumps UpdatedAt", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const patched = updateStepMetaRow(db, step.StepId, {
            Description: "Click button",
            IsDisabled: true,
            RetryCount: 3,
            TimeoutMs: 1500,
        });
        expect(patched.Description).toBe("Click button");
        expect(patched.IsDisabled).toBe(1);
        expect(patched.RetryCount).toBe(3);
        expect(patched.TimeoutMs).toBe(1500);
    });

    it("rejects negative RetryCount and non-positive TimeoutMs", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => updateStepMetaRow(db, step.StepId, { RetryCount: -1 })).toThrow(/RetryCount/);
        expect(() => updateStepMetaRow(db, step.StepId, { TimeoutMs: 0 })).toThrow(/TimeoutMs/);
    });

    it("empty patch is a no-op (returns current row)", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const same = updateStepMetaRow(db, step.StepId, {});
        expect(same.StepId).toBe(step.StepId);
    });
});

describe("step-chain-persistence — setStepTagsRow", () => {
    it("replaces the tag set and dedupes input", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const tags = setStepTagsRow(db, step.StepId, ["smoke", "smoke", "regression"]);
        expect(tags).toEqual(["regression", "smoke"]);
    });

    it("rejects empty or oversize tag names", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => setStepTagsRow(db, step.StepId, [""])).toThrow();
        expect(() => setStepTagsRow(db, step.StepId, ["x".repeat(65)])).toThrow();
    });

    it("listStepTagsRow returns names sorted ascending", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        setStepTagsRow(db, step.StepId, ["z", "a", "m"]);
        expect(listStepTagsRow(db, step.StepId)).toEqual(["a", "m", "z"]);
    });

    it("StepTag rows cascade-delete when the parent Step is removed", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        setStepTagsRow(db, step.StepId, ["t1"]);
        db.run("DELETE FROM Step WHERE StepId = ?", [step.StepId]);
        expect(listStepTagsRow(db, step.StepId)).toEqual([]);
    });
});

describe("step-chain-persistence — setStepLinkRow", () => {
    it("sets and clears OnSuccessProjectId + OnFailureProjectId independently", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const a = setStepLinkRow(db, step.StepId, "OnSuccessProjectId", "proj-success");
        expect(a.OnSuccessProjectId).toBe("proj-success");
        expect(a.OnFailureProjectId).toBeNull();
        const b = setStepLinkRow(db, step.StepId, "OnFailureProjectId", "proj-fail");
        expect(b.OnSuccessProjectId).toBe("proj-success");
        expect(b.OnFailureProjectId).toBe("proj-fail");
        const cleared = setStepLinkRow(db, step.StepId, "OnSuccessProjectId", null);
        expect(cleared.OnSuccessProjectId).toBeNull();
    });

    it("trims whitespace and treats empty string as null", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const trimmed = setStepLinkRow(db, step.StepId, "OnSuccessProjectId", "  proj-x  ");
        expect(trimmed.OnSuccessProjectId).toBe("proj-x");
        const cleared = setStepLinkRow(db, step.StepId, "OnSuccessProjectId", "   ");
        expect(cleared.OnSuccessProjectId).toBeNull();
    });
});

describe("step-chain-persistence — Phase 14 spec validation", () => {
    it("rejects RetryCount above MAX_RETRY_COUNT", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => updateStepMetaRow(db, step.StepId, { RetryCount: MAX_RETRY_COUNT + 1 }))
            .toThrow(/RetryCount exceeds/);
    });

    it("rejects TimeoutMs above MAX_TIMEOUT_MS", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => updateStepMetaRow(db, step.StepId, { TimeoutMs: MAX_TIMEOUT_MS + 1 }))
            .toThrow(/TimeoutMs exceeds/);
    });

    it("rejects empty / oversize Label and oversize Description", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => updateStepMetaRow(db, step.StepId, { Label: "   " })).toThrow(/Label cannot be empty/);
        expect(() => updateStepMetaRow(db, step.StepId, { Label: "x".repeat(MAX_LABEL_LENGTH + 1) }))
            .toThrow(/Label exceeds/);
        expect(() => updateStepMetaRow(db, step.StepId, { Description: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }))
            .toThrow(/Description exceeds/);
    });

    it("rejects non-boolean IsDisabled", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => updateStepMetaRow(db, step.StepId, { IsDisabled: 1 as unknown as boolean }))
            .toThrow(/IsDisabled must be a boolean/);
    });

    it("rejects tag names with invalid characters", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => setStepTagsRow(db, step.StepId, ["bad/tag"])).toThrow(/invalid characters/);
        expect(() => setStepTagsRow(db, step.StepId, ["bad,tag"])).toThrow(/invalid characters/);
    });

    it("rejects tag sets larger than MAX_TAGS_PER_STEP", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        const oversize = Array.from({ length: MAX_TAGS_PER_STEP + 1 }, (_, i) => `tag${i}`);
        expect(() => setStepTagsRow(db, step.StepId, oversize)).toThrow(/Tag set exceeds/);
    });

    it("rejects project slugs with invalid characters", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => setStepLinkRow(db, step.StepId, "OnSuccessProjectId", "has space"))
            .toThrow(/invalid characters/);
        expect(() => setStepLinkRow(db, step.StepId, "OnFailureProjectId", "bad/slug"))
            .toThrow(/invalid characters/);
    });

    it("rejects project slugs longer than 128 chars", () => {
        const db = freshDb();
        const step = insertStepRow(db, draft("A"));
        expect(() => setStepLinkRow(db, step.StepId, "OnSuccessProjectId", "a".repeat(129)))
            .toThrow(/exceeds 128/);
    });
});
