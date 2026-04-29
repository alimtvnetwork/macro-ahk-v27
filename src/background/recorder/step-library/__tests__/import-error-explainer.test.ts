/**
 * import-error-explainer.test.ts — every `ImportReason` maps to a
 * non-empty user-facing explanation, severities are correctly bucketed,
 * and the underlying failure is preserved for the technical-detail
 * disclosure.
 */

import { describe, it, expect } from "vitest";
import { explainImportFailure } from "../import-error-explainer";
import type { ImportFailure, ImportReason } from "../import-bundle";

const ALL_REASONS: ReadonlyArray<Exclude<ImportReason, "Ok">> = [
    "BundleNotZip",
    "ManifestMissing",
    "ManifestMalformed",
    "ManifestVersionUnsupported",
    "DbFileMissing",
    "DbChecksumMismatch",
    "DbSchemaIncompatible",
    "DbCorrupt",
    "DestinationProjectMissing",
    "AttachParentMissing",
    "AttachParentWrongProject",
    "NameConflict",
    "RunGroupTargetMissing",
    "InternalError",
];

describe("explainImportFailure", () => {
    it("produces non-empty title/summary/suggestion for every known reason", () => {
        for (const reason of ALL_REASONS) {
            const failure: ImportFailure = { Reason: reason, Detail: "raw detail" };
            const ex = explainImportFailure(failure);
            expect(ex.Title.length).toBeGreaterThan(0);
            expect(ex.Title.length).toBeLessThanOrEqual(60);
            expect(ex.Summary.length).toBeGreaterThan(20);
            expect(ex.Suggestion.length).toBeGreaterThan(20);
            expect(ex.Failure).toBe(failure);
        }
    });

    it("buckets bundle-shape reasons under Severity=Bundle", () => {
        const bundleReasons: Array<Exclude<ImportReason, "Ok">> = [
            "BundleNotZip",
            "ManifestMissing",
            "ManifestMalformed",
            "ManifestVersionUnsupported",
            "DbFileMissing",
            "DbChecksumMismatch",
            "DbSchemaIncompatible",
            "DbCorrupt",
            "RunGroupTargetMissing",
        ];
        for (const r of bundleReasons) {
            expect(explainImportFailure({ Reason: r, Detail: "" }).Severity).toBe("Bundle");
        }
    });

    it("buckets destination/state reasons under Severity=Conflict", () => {
        const conflictReasons: Array<Exclude<ImportReason, "Ok">> = [
            "DestinationProjectMissing",
            "AttachParentMissing",
            "AttachParentWrongProject",
            "NameConflict",
        ];
        for (const r of conflictReasons) {
            expect(explainImportFailure({ Reason: r, Detail: "" }).Severity).toBe("Conflict");
        }
    });

    it("falls back to InternalError for an unrecognised reason", () => {
        const failure = {
            Reason: "SomethingBrandNew",
            Detail: "future runner",
        } as unknown as ImportFailure;
        const ex = explainImportFailure(failure);
        expect(ex.Severity).toBe("Internal");
        expect(ex.Title.length).toBeGreaterThan(0);
    });
});
