/**
 * Step Group Bundle Export — unit tests.
 *
 * Covers:
 *   - selection resolution (with / without descendants, missing IDs,
 *     cross-project IDs, empty selection)
 *   - filtered snapshot integrity (only selected rows present, RunGroup
 *     dangling target rejected)
 *   - ZIP packaging round-trip (manifest checksum verifies; reopened DB
 *     contains exactly the selected rows)
 *
 * @see ../export-bundle.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import JSZip from "jszip";

import { StepLibraryDb } from "../db";
import { StepKindId } from "../schema";
import {
    buildFilteredSnapshot,
    resolveSelection,
    runStepGroupExport,
    sha256Hex,
    STEP_GROUP_BUNDLE_FORMAT_VERSION,
    type ExportFailure,
    type StepGroupExportSuccess,
} from "../export-bundle";

let SQL: SqlJsStatic;

beforeAll(async () => {
    const wasmPath = resolve(
        __dirname,
        "../../../../../node_modules/sql.js/dist/sql-wasm.wasm",
    );
    const wasmBinary = readFileSync(wasmPath);
    SQL = await initSqlJs({
        wasmBinary: wasmBinary.buffer.slice(
            wasmBinary.byteOffset,
            wasmBinary.byteOffset + wasmBinary.byteLength,
        ),
    });
});

/* ------------------------------------------------------------------ */
/*  Fixture                                                            */
/* ------------------------------------------------------------------ */

interface Fixture {
    readonly Lib: StepLibraryDb;
    readonly ProjectId: number;
    readonly OtherProjectId: number;
    readonly Root: number;
    readonly Child: number;
    readonly Grandchild: number;
    readonly Sibling: number;
    readonly OtherProjectGroup: number;
    readonly RootStep1: number;
    readonly RootRunGroupStep: number;
    readonly ChildStep1: number;
}

function makeFixture(): Fixture {
    const lib = new StepLibraryDb(new SQL.Database());
    const projectId = lib.upsertProject({
        ExternalId: "11111111-1111-1111-1111-111111111111",
        Name: "Onboarding Project",
    });
    const otherProjectId = lib.upsertProject({
        ExternalId: "22222222-2222-2222-2222-222222222222",
        Name: "Other Project",
    });
    const root = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: "Root",
    });
    const child = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: root,
        Name: "Child",
    });
    const grandchild = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: child,
        Name: "Grandchild",
    });
    const sibling = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: "Sibling",
    });
    const otherProjectGroup = lib.createGroup({
        ProjectId: otherProjectId,
        ParentStepGroupId: null,
        Name: "Other-Group",
    });
    const rootStep1 = lib.appendStep({
        StepGroupId: root,
        StepKindId: StepKindId.Click,
        Label: "Click submit",
        PayloadJson: JSON.stringify({ Selector: "#submit" }),
    });
    const rootRunGroupStep = lib.appendStep({
        StepGroupId: root,
        StepKindId: StepKindId.RunGroup,
        Label: "Invoke child",
        TargetStepGroupId: child,
    });
    const childStep1 = lib.appendStep({
        StepGroupId: child,
        StepKindId: StepKindId.Type,
        Label: "Type email",
        PayloadJson: JSON.stringify({ Selector: "#email", Value: "{{Email}}" }),
    });
    return {
        Lib: lib,
        ProjectId: projectId,
        OtherProjectId: otherProjectId,
        Root: root,
        Child: child,
        Grandchild: grandchild,
        Sibling: sibling,
        OtherProjectGroup: otherProjectGroup,
        RootStep1: rootStep1,
        RootRunGroupStep: rootRunGroupStep,
        ChildStep1: childStep1,
    };
}

/* ------------------------------------------------------------------ */
/*  resolveSelection                                                   */
/* ------------------------------------------------------------------ */

describe("resolveSelection", () => {
    it("rejects an empty selection", () => {
        const fx = makeFixture();
        const r = resolveSelection(fx.Lib, fx.ProjectId, [], false);
        if (!("Reason" in r)) throw new Error("expected failure");
        expect(r.Reason).toBe("EmptySelection");
    });

    it("rejects unknown StepGroupIds", () => {
        const fx = makeFixture();
        const r = resolveSelection(fx.Lib, fx.ProjectId, [fx.Root, 9999], false);
        if (!("Reason" in r)) throw new Error("expected failure");
        expect(r.Reason).toBe("GroupNotFound");
        expect(r.OffendingIds).toEqual([9999]);
    });

    it("rejects groups belonging to another project", () => {
        const fx = makeFixture();
        const r = resolveSelection(
            fx.Lib,
            fx.ProjectId,
            [fx.Root, fx.OtherProjectGroup],
            false,
        );
        if (!("Reason" in r)) throw new Error("expected failure");
        // Cross-project groups are simply absent from listGroups(projectId),
        // so they surface as GroupNotFound — that is the user-facing
        // contract and is acceptable.
        expect(["GroupNotFound", "GroupOutsideProject"]).toContain(r.Reason);
        expect(r.OffendingIds).toContain(fx.OtherProjectGroup);
    });

    it("returns just the selected ids when descendants disabled", () => {
        const fx = makeFixture();
        const r = resolveSelection(fx.Lib, fx.ProjectId, [fx.Root], false);
        if ("Reason" in r) throw new Error("expected ok");
        expect(r.Ids).toEqual([fx.Root]);
    });

    it("includes the full descendant tree when enabled", () => {
        const fx = makeFixture();
        const r = resolveSelection(fx.Lib, fx.ProjectId, [fx.Root], true);
        if ("Reason" in r) throw new Error("expected ok");
        expect(r.Ids).toEqual([fx.Root, fx.Child, fx.Grandchild].sort((a, b) => a - b));
    });

    it("dedupes overlapping descendant trees", () => {
        const fx = makeFixture();
        const r = resolveSelection(fx.Lib, fx.ProjectId, [fx.Root, fx.Child], true);
        if ("Reason" in r) throw new Error("expected ok");
        expect(r.Ids).toEqual([fx.Root, fx.Child, fx.Grandchild].sort((a, b) => a - b));
    });
});

/* ------------------------------------------------------------------ */
/*  buildFilteredSnapshot                                              */
/* ------------------------------------------------------------------ */

describe("buildFilteredSnapshot", () => {
    it("rejects RunGroup steps whose target is outside the bundle", () => {
        const fx = makeFixture();
        // Only root selected — but root has a RunGroup step that points
        // to `child`, which is NOT in the bundle.
        const result = buildFilteredSnapshot(fx.Lib, SQL, fx.ProjectId, [fx.Root]);
        if (!("Reason" in result)) throw new Error("expected failure");
        expect(result.Reason).toBe("RunGroupTargetMissing");
        expect(result.OffendingIds).toEqual([fx.RootRunGroupStep]);
    });

    it("snapshots only the selected groups + their steps", () => {
        const fx = makeFixture();
        const result = buildFilteredSnapshot(
            fx.Lib,
            SQL,
            fx.ProjectId,
            [fx.Root, fx.Child, fx.Grandchild],
        );
        if ("Reason" in result) throw new Error(`unexpected failure: ${result.Detail}`);
        expect(result.Counts).toEqual({ StepGroups: 3, Steps: 3, RunGroupRefs: 1 });

        const reopened = new SQL.Database(result.DbBytes);
        try {
            const lib = new StepLibraryDb(reopened);
            const groups = lib.listGroups(fx.ProjectId);
            expect(groups.map((g) => g.Name).sort()).toEqual(
                ["Child", "Grandchild", "Root"],
            );
            // Sibling group must NOT be in the snapshot.
            expect(groups.find((g) => g.Name === "Sibling")).toBeUndefined();

            const rootSteps = lib.listSteps(fx.Root);
            expect(rootSteps.map((s) => s.Label)).toEqual(["Click submit", "Invoke child"]);
            const childSteps = lib.listSteps(fx.Child);
            expect(childSteps.map((s) => s.Label)).toEqual(["Type email"]);
        } finally {
            reopened.close();
        }
    });
});

/* ------------------------------------------------------------------ */
/*  runStepGroupExport — full ZIP round-trip                           */
/* ------------------------------------------------------------------ */

async function expectSuccess(
    p: Promise<StepGroupExportSuccess | ExportFailure>,
): Promise<StepGroupExportSuccess> {
    const r = await p;
    if (r.Reason !== "Ok") {
        throw new Error(`export failed: ${r.Reason} — ${(r as ExportFailure).Detail}`);
    }
    return r;
}

describe("runStepGroupExport", () => {
    it("packages manifest + db + readme into a deterministic ZIP", async () => {
        const fx = makeFixture();
        const success = await expectSuccess(
            runStepGroupExport({
                Source: fx.Lib,
                ProjectId: fx.ProjectId,
                SelectedStepGroupIds: [fx.Root],
                IncludeDescendants: true,
                BundleName: "Q2 onboarding",
                NowIso: () => "2026-04-26T10:00:00.000Z",
                SqlJs: SQL,
                JsZip: JSZip,
            }),
        );

        expect(success.ZipFileName).toBe(
            "step-groups-Onboarding-Project-2026-04-26T10-00-00-000Z.zip",
        );
        expect(success.Manifest.FormatVersion).toBe(STEP_GROUP_BUNDLE_FORMAT_VERSION);
        expect(success.Manifest.Counts).toEqual({
            StepGroups: 3,
            Steps: 3,
            RunGroupRefs: 1,
        });
        expect(success.Manifest.Selection.IncludeDescendants).toBe(true);
        expect(success.Manifest.Selection.EffectiveStepGroupIds).toEqual(
            [fx.Root, fx.Child, fx.Grandchild].sort((a, b) => a - b),
        );

        // Reopen the ZIP and verify entries + checksum.
        const reopened = await JSZip.loadAsync(success.ZipBytes);
        const fileNames = Object.keys(reopened.files).sort();
        expect(fileNames).toEqual(["manifest.json", "readme.txt", "step-groups.db"]);

        const manifestJson = await reopened.file("manifest.json")!.async("string");
        const dbBytes = await reopened.file("step-groups.db")!.async("uint8array");
        const readme = await reopened.file("readme.txt")!.async("string");

        expect(JSON.parse(manifestJson)).toEqual(success.Manifest);
        const checksum = await sha256Hex(dbBytes);
        expect(checksum).toBe(success.Manifest.DbSha256);
        expect(dbBytes.length).toBe(success.Manifest.DbByteLength);
        expect(readme).toContain("Marco Step Group Bundle");
        expect(readme).toContain("Onboarding-Project".replace("-", " ")); // Project name appears
        expect(readme).toContain(success.Manifest.DbSha256);

        // Reopen the embedded DB through StepLibraryDb — full integration check.
        const reopenedDb = new SQL.Database(dbBytes);
        try {
            const lib = new StepLibraryDb(reopenedDb);
            expect(lib.listGroups(fx.ProjectId).map((g) => g.Name).sort()).toEqual([
                "Child",
                "Grandchild",
                "Root",
            ]);
        } finally {
            reopenedDb.close();
        }
    });

    it("surfaces selection failures without producing a ZIP", async () => {
        const fx = makeFixture();
        const r = await runStepGroupExport({
            Source: fx.Lib,
            ProjectId: fx.ProjectId,
            SelectedStepGroupIds: [],
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("EmptySelection");
        expect((r as ExportFailure).Detail).toContain("nothing to export");
    });

    it("exports a sibling group with its own descendants without dragging Root", async () => {
        const fx = makeFixture();
        const success = await expectSuccess(
            runStepGroupExport({
                Source: fx.Lib,
                ProjectId: fx.ProjectId,
                SelectedStepGroupIds: [fx.Sibling],
                IncludeDescendants: true,
                NowIso: () => "2026-04-26T11:00:00.000Z",
                SqlJs: SQL,
                JsZip: JSZip,
            }),
        );
        expect(success.Manifest.Counts.StepGroups).toBe(1);
        expect(success.Manifest.Counts.Steps).toBe(0);
        expect(success.Manifest.Counts.RunGroupRefs).toBe(0);

        const reopened = await JSZip.loadAsync(success.ZipBytes);
        const dbBytes = await reopened.file("step-groups.db")!.async("uint8array");
        const reopenedDb = new SQL.Database(dbBytes);
        try {
            const lib = new StepLibraryDb(reopenedDb);
            expect(lib.listGroups(fx.ProjectId).map((g) => g.Name)).toEqual(["Sibling"]);
        } finally {
            reopenedDb.close();
        }
    });
});
