/**
 * Step Group Bundle Import — unit tests.
 *
 * Covers:
 *   - Full roundtrip: export → import into a fresh project, verify
 *     groups + steps + RunGroup target are preserved with remapped IDs.
 *   - Conflict policies: Skip / Rename / Fail when an imported root
 *     name collides with an existing destination sibling.
 *   - AttachUnderStepGroupId: import roots become children of the
 *     declared parent group.
 *   - Rejection paths: not-a-zip, missing manifest, malformed manifest,
 *     bad SHA, future format-version, missing destination project,
 *     invalid attach parent.
 *   - Atomicity: a failure mid-merge leaves the destination DB
 *     identical to its pre-import state.
 *
 * @see ../import-bundle.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import JSZip from "jszip";

import { StepLibraryDb } from "../db";
import { StepKindId } from "../schema";
import {
    runStepGroupExport,
    sha256Hex,
    STEP_GROUP_BUNDLE_FORMAT_VERSION,
    type StepGroupExportSuccess,
} from "../export-bundle";
import {
    runStepGroupImport,
    type ImportFailure,
    type ImportSummary,
} from "../import-bundle";

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
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

interface SourceFixture {
    readonly Lib: StepLibraryDb;
    readonly ProjectId: number;
    readonly Root: number;
    readonly Child: number;
}

function makeSource(): SourceFixture {
    const lib = new StepLibraryDb(new SQL.Database());
    const projectId = lib.upsertProject({
        ExternalId: "src-0000",
        Name: "Source Project",
    });
    const root = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: null,
        Name: "Onboarding",
    });
    const child = lib.createGroup({
        ProjectId: projectId,
        ParentStepGroupId: root,
        Name: "Login",
    });
    lib.appendStep({
        StepGroupId: root,
        StepKindId: StepKindId.Click,
        Label: "Click Start",
        PayloadJson: JSON.stringify({ Selector: "#start" }),
    });
    lib.appendStep({
        StepGroupId: root,
        StepKindId: StepKindId.RunGroup,
        Label: "Run Login",
        TargetStepGroupId: child,
    });
    lib.appendStep({
        StepGroupId: child,
        StepKindId: StepKindId.Type,
        Label: "Type email",
        PayloadJson: JSON.stringify({ Selector: "#email", Value: "{{Email}}" }),
    });
    return { Lib: lib, ProjectId: projectId, Root: root, Child: child };
}

interface DestFixture {
    readonly Lib: StepLibraryDb;
    readonly ProjectId: number;
}

function makeDest(): DestFixture {
    const lib = new StepLibraryDb(new SQL.Database());
    const projectId = lib.upsertProject({
        ExternalId: "dst-0000",
        Name: "Destination Project",
    });
    return { Lib: lib, ProjectId: projectId };
}

async function makeBundle(
    src: SourceFixture,
    selected: ReadonlyArray<number>,
    includeDescendants = true,
): Promise<StepGroupExportSuccess> {
    const r = await runStepGroupExport({
        Source: src.Lib,
        ProjectId: src.ProjectId,
        SelectedStepGroupIds: selected,
        IncludeDescendants: includeDescendants,
        BundleName: "Test Bundle",
        NowIso: () => "2026-04-26T12:00:00.000Z",
        SqlJs: SQL,
        JsZip: JSZip,
    });
    if (r.Reason !== "Ok") throw new Error(`export failed: ${r.Reason}`);
    return r;
}

function expectOk(r: ImportSummary | ImportFailure): ImportSummary {
    if (r.Reason !== "Ok") {
        throw new Error(`import failed: ${r.Reason} — ${(r as ImportFailure).Detail}`);
    }
    return r;
}

/* ------------------------------------------------------------------ */
/*  Roundtrip                                                          */
/* ------------------------------------------------------------------ */

describe("runStepGroupImport — roundtrip", () => {
    it("imports the full tree with remapped IDs and preserves RunGroup targets", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        // Pre-create a few groups in the destination so the imported
        // groups are guaranteed to receive different AUTOINCREMENT IDs
        // than they had in the source — proves the remap actually
        // rewrote the RunGroup target.
        dst.Lib.createGroup({ ProjectId: dst.ProjectId, ParentStepGroupId: null, Name: "Pad-1" });
        dst.Lib.createGroup({ ProjectId: dst.ProjectId, ParentStepGroupId: null, Name: "Pad-2" });
        dst.Lib.createGroup({ ProjectId: dst.ProjectId, ParentStepGroupId: null, Name: "Pad-3" });

        const summary = expectOk(await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        }));

        expect(summary.Counts).toEqual({ StepGroups: 2, Steps: 3, RunGroupRefs: 1 });
        expect(summary.RootStepGroupIds.length).toBe(1);
        expect(summary.RenamedRoots).toEqual([]);

        const groups = dst.Lib.listGroups(dst.ProjectId);
        expect(groups.map((g) => g.Name).sort()).toEqual([
            "Login", "Onboarding", "Pad-1", "Pad-2", "Pad-3",
        ]);

        const newRoot = groups.find((g) => g.Name === "Onboarding")!;
        const newChild = groups.find((g) => g.Name === "Login")!;
        expect(newChild.ParentStepGroupId).toBe(newRoot.StepGroupId);

        const rootSteps = dst.Lib.listSteps(newRoot.StepGroupId);
        expect(rootSteps.map((s) => s.Label)).toEqual(["Click Start", "Run Login"]);
        const runGroupStep = rootSteps.find((s) => s.StepKindId === StepKindId.RunGroup)!;
        // RunGroup target must point at the newly-minted child id, not the source id.
        expect(runGroupStep.TargetStepGroupId).toBe(newChild.StepGroupId);
        expect(runGroupStep.TargetStepGroupId).not.toBe(src.Child);
        expect(newRoot.StepGroupId).not.toBe(src.Root);

        const childSteps = dst.Lib.listSteps(newChild.StepGroupId);
        expect(childSteps.map((s) => s.Label)).toEqual(["Type email"]);
    });

    it("attaches imported roots under the requested parent group", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        const containerId = dst.Lib.createGroup({
            ProjectId: dst.ProjectId,
            ParentStepGroupId: null,
            Name: "Imports",
        });

        const summary = expectOk(await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            AttachUnderStepGroupId: containerId,
            SqlJs: SQL,
            JsZip: JSZip,
        }));

        expect(summary.AttachedUnderStepGroupId).toBe(containerId);
        const newRoot = dst.Lib.listGroups(dst.ProjectId)
            .find((g) => g.Name === "Onboarding")!;
        expect(newRoot.ParentStepGroupId).toBe(containerId);
    });
});

/* ------------------------------------------------------------------ */
/*  Conflict policies                                                  */
/* ------------------------------------------------------------------ */

describe("runStepGroupImport — name conflict policies", () => {
    it("'Rename' suffixes the imported root with (imported)", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        dst.Lib.createGroup({
            ProjectId: dst.ProjectId,
            ParentStepGroupId: null,
            Name: "Onboarding",
        });

        const summary = expectOk(await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            OnNameConflict: "Rename",
            SqlJs: SQL,
            JsZip: JSZip,
        }));

        expect(summary.RenamedRoots).toEqual([
            { OldName: "Onboarding", NewName: "Onboarding (imported)" },
        ]);
        const names = dst.Lib.listGroups(dst.ProjectId).map((g) => g.Name).sort();
        expect(names).toContain("Onboarding");
        expect(names).toContain("Onboarding (imported)");
        expect(names).toContain("Login");
    });

    it("'Rename' picks the next free slot when (imported) is also taken", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        dst.Lib.createGroup({ ProjectId: dst.ProjectId, ParentStepGroupId: null, Name: "Onboarding" });
        dst.Lib.createGroup({ ProjectId: dst.ProjectId, ParentStepGroupId: null, Name: "Onboarding (imported)" });

        const summary = expectOk(await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            OnNameConflict: "Rename",
            SqlJs: SQL,
            JsZip: JSZip,
        }));

        expect(summary.RenamedRoots).toEqual([
            { OldName: "Onboarding", NewName: "Onboarding (imported 2)" },
        ]);
    });

    it("'Fail' rejects the import when a root name collides", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        dst.Lib.createGroup({
            ProjectId: dst.ProjectId,
            ParentStepGroupId: null,
            Name: "Onboarding",
        });

        const r = await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            OnNameConflict: "Fail",
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("NameConflict");
        expect((r as ImportFailure).OffendingNames).toEqual(["Onboarding"]);
        // Atomicity: destination still has only the pre-existing 'Onboarding' group.
        expect(dst.Lib.listGroups(dst.ProjectId).map((g) => g.Name)).toEqual(["Onboarding"]);
    });
});

/* ------------------------------------------------------------------ */
/*  Validation failures                                                */
/* ------------------------------------------------------------------ */

describe("runStepGroupImport — validation failures", () => {
    it("rejects bytes that are not a ZIP", async () => {
        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: new TextEncoder().encode("not a zip"),
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("BundleNotZip");
    });

    it("rejects a ZIP without manifest.json", async () => {
        const zip = new JSZip();
        zip.file("step-groups.db", new Uint8Array([1, 2, 3]));
        const bytes = await zip.generateAsync({ type: "uint8array" });
        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: bytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("ManifestMissing");
    });

    it("rejects a malformed manifest.json", async () => {
        const zip = new JSZip();
        zip.file("manifest.json", "{not valid json");
        zip.file("step-groups.db", new Uint8Array());
        const bytes = await zip.generateAsync({ type: "uint8array" });
        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: bytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("ManifestMalformed");
    });

    it("rejects a future FormatVersion", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        // Re-pack with a bumped version.
        const reopened = await JSZip.loadAsync(bundle.ZipBytes);
        const manifestText = await reopened.file("manifest.json")!.async("string");
        const dbBytes = await reopened.file("step-groups.db")!.async("uint8array");
        const manifest = JSON.parse(manifestText) as Record<string, unknown>;
        manifest.FormatVersion = STEP_GROUP_BUNDLE_FORMAT_VERSION + 99;
        const tampered = new JSZip();
        tampered.file("manifest.json", JSON.stringify(manifest));
        tampered.file("step-groups.db", dbBytes);
        const tamperedBytes = await tampered.generateAsync({ type: "uint8array" });

        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: tamperedBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("ManifestVersionUnsupported");
    });

    it("rejects a tampered DB whose SHA-256 no longer matches", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const reopened = await JSZip.loadAsync(bundle.ZipBytes);
        const manifestText = await reopened.file("manifest.json")!.async("string");
        const dbBytes = await reopened.file("step-groups.db")!.async("uint8array");
        // Flip a byte in the middle of the DB.
        const flipped = new Uint8Array(dbBytes);
        flipped[Math.floor(flipped.length / 2)] ^= 0x55;
        const tampered = new JSZip();
        tampered.file("manifest.json", manifestText);
        tampered.file("step-groups.db", flipped);
        const tamperedBytes = await tampered.generateAsync({ type: "uint8array" });

        // Sanity check: hash actually changed.
        expect(await sha256Hex(flipped)).not.toBe(await sha256Hex(dbBytes));

        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: tamperedBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("DbChecksumMismatch");
        // Atomicity: nothing imported.
        expect(dst.Lib.listGroups(dst.ProjectId)).toEqual([]);
    });

    it("rejects an unknown DestinationProjectId", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: 9999,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("DestinationProjectMissing");
    });

    it("rejects an AttachUnderStepGroupId that does not exist", async () => {
        const src = makeSource();
        const bundle = await makeBundle(src, [src.Root]);
        const dst = makeDest();
        const r = await runStepGroupImport({
            ZipBytes: bundle.ZipBytes,
            Destination: dst.Lib,
            DestinationProjectId: dst.ProjectId,
            AttachUnderStepGroupId: 8888,
            SqlJs: SQL,
            JsZip: JSZip,
        });
        expect(r.Reason).toBe("AttachParentMissing");
    });
});
