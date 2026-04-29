/**
 * Marco Extension — Step Group Bundle Import
 *
 * Symmetric counterpart to `./export-bundle.ts`. Accepts the bytes of a
 * ZIP produced by `runStepGroupExport`, validates every layer, and
 * merges the contained `StepGroup` + `Step` rows into a destination
 * `StepLibraryDb` under a caller-chosen project.
 *
 * Pure module — no chrome.*, no DOM, no file-system. The caller
 * supplies the ZIP bytes (typically read from an `<input type="file">`
 * via `arrayBuffer()`).
 *
 * Failure handling: this module never throws after `runStepGroupImport`
 * returns; every reachable failure surfaces as a structured
 * `ImportFailure` per mem://standards/verbose-logging-and-failure-diagnostics.
 *
 * Atomicity: all writes happen inside a single `BEGIN`/`COMMIT` on the
 * destination DB. A failure mid-merge rolls back, leaving the
 * destination identical to its pre-import state.
 *
 * @see ./export-bundle.ts
 * @see spec/31-macro-recorder/16-step-group-library.md  §8.4 (import)
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

import type { Database, SqlJsStatic } from "sql.js";
import type JSZipType from "jszip";

import { applySchema, StepKindId } from "./schema";
import {
    StepLibraryDb,
    type StepGroupRow,
    type StepRow,
} from "./db";
import {
    sha256Hex,
    STEP_GROUP_BUNDLE_FORMAT_VERSION,
    type StepGroupExportManifest,
} from "./export-bundle";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type ConflictPolicy = "Skip" | "Rename" | "Fail";

export interface RunStepGroupImportInit {
    /** Raw ZIP bytes (e.g. from `await file.arrayBuffer()` then `new Uint8Array(buf)`). */
    readonly ZipBytes: Uint8Array;
    /** Destination DB to merge into. */
    readonly Destination: StepLibraryDb;
    /** Project that will own every imported group. */
    readonly DestinationProjectId: number;
    /**
     * Where to attach the imported tree's roots:
     *   - `null` (default) → at the top level of the destination project,
     *   - a `StepGroupId` → all imported roots become children of it.
     * The given parent MUST belong to `DestinationProjectId`.
     */
    readonly AttachUnderStepGroupId?: number | null;
    /** What to do when an imported root collides with an existing sibling name. */
    readonly OnNameConflict?: ConflictPolicy;
    /** sql.js factory — typically the lazily-initialised singleton. */
    readonly SqlJs: SqlJsStatic;
    /** JSZip constructor — passed in so this module stays tree-shakeable. */
    readonly JsZip: typeof JSZipType;
}

export type ImportReason =
    | "Ok"
    | "BundleNotZip"
    | "ManifestMissing"
    | "ManifestMalformed"
    | "ManifestVersionUnsupported"
    | "DbFileMissing"
    | "DbChecksumMismatch"
    | "DbSchemaIncompatible"
    | "DbCorrupt"
    | "DestinationProjectMissing"
    | "AttachParentMissing"
    | "AttachParentWrongProject"
    | "NameConflict"
    | "RunGroupTargetMissing"
    | "InternalError";

export interface ImportFailure {
    readonly Reason: Exclude<ImportReason, "Ok">;
    readonly Detail: string;
    readonly OffendingNames?: ReadonlyArray<string>;
    readonly OffendingIds?: ReadonlyArray<number>;
}

export interface ImportSummary {
    readonly Reason: "Ok";
    readonly Manifest: StepGroupExportManifest;
    readonly DestinationProjectId: number;
    readonly AttachedUnderStepGroupId: number | null;
    readonly RootStepGroupIds: ReadonlyArray<number>;
    readonly IdMap: ReadonlyArray<{ readonly OldId: number; readonly NewId: number }>;
    readonly RenamedRoots: ReadonlyArray<{ readonly OldName: string; readonly NewName: string }>;
    readonly Counts: { readonly StepGroups: number; readonly Steps: number; readonly RunGroupRefs: number };
}

export type StepGroupImportResult = ImportSummary | ImportFailure;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MANIFEST_FILE = "manifest.json";
const RENAME_MAX_ATTEMPTS = 256;

/* ------------------------------------------------------------------ */
/*  ZIP unpacking + validation                                         */
/* ------------------------------------------------------------------ */

interface UnpackedBundle {
    readonly Manifest: StepGroupExportManifest;
    readonly DbBytes: Uint8Array;
}

async function unpackBundle(
    zipBytes: Uint8Array,
    jsZip: typeof JSZipType,
): Promise<UnpackedBundle | ImportFailure> {
    let zip: JSZipType;
    try {
        zip = await jsZip.loadAsync(zipBytes);
    } catch (err) {
        return {
            Reason: "BundleNotZip",
            Detail: err instanceof Error ? err.message : "JSZip.loadAsync rejected the bundle",
        };
    }

    const manifestEntry = zip.file(MANIFEST_FILE);
    if (manifestEntry === null) {
        return {
            Reason: "ManifestMissing",
            Detail: `Bundle has no ${MANIFEST_FILE}.`,
        };
    }
    let manifestText: string;
    try {
        manifestText = await manifestEntry.async("string");
    } catch (err) {
        return {
            Reason: "ManifestMalformed",
            Detail: err instanceof Error ? err.message : "manifest.json could not be decoded",
        };
    }
    let manifest: StepGroupExportManifest;
    try {
        manifest = JSON.parse(manifestText) as StepGroupExportManifest;
    } catch (err) {
        return {
            Reason: "ManifestMalformed",
            Detail: err instanceof Error ? err.message : "manifest.json is not valid JSON",
        };
    }

    const validation = validateManifestShape(manifest);
    if (validation !== null) return validation;

    if (manifest.FormatVersion > STEP_GROUP_BUNDLE_FORMAT_VERSION) {
        return {
            Reason: "ManifestVersionUnsupported",
            Detail:
                `Bundle FormatVersion=${manifest.FormatVersion} is newer than this build supports ` +
                `(${STEP_GROUP_BUNDLE_FORMAT_VERSION}). Please update the extension.`,
        };
    }

    const dbEntry = zip.file(manifest.DbFileName);
    if (dbEntry === null) {
        return {
            Reason: "DbFileMissing",
            Detail: `Bundle declares DbFileName="${manifest.DbFileName}" but the file is absent from the ZIP.`,
        };
    }
    let dbBytes: Uint8Array;
    try {
        dbBytes = await dbEntry.async("uint8array");
    } catch (err) {
        return {
            Reason: "DbCorrupt",
            Detail: err instanceof Error ? err.message : "embedded DB could not be decoded",
        };
    }
    if (dbBytes.length !== manifest.DbByteLength) {
        return {
            Reason: "DbChecksumMismatch",
            Detail:
                `Embedded DB is ${dbBytes.length} bytes but manifest claims ${manifest.DbByteLength}. ` +
                "Bundle was tampered with or truncated.",
        };
    }
    const observedSha = await sha256Hex(dbBytes);
    if (observedSha !== manifest.DbSha256) {
        return {
            Reason: "DbChecksumMismatch",
            Detail:
                `Embedded DB SHA-256 ${observedSha} does not match manifest ${manifest.DbSha256}. ` +
                "Bundle was tampered with or truncated.",
        };
    }
    return { Manifest: manifest, DbBytes: dbBytes };
}

function validateManifestShape(m: unknown): ImportFailure | null {
    if (m === null || typeof m !== "object") {
        return { Reason: "ManifestMalformed", Detail: "manifest.json is not an object." };
    }
    const required: ReadonlyArray<keyof StepGroupExportManifest> = [
        "FormatVersion",
        "GeneratedAt",
        "BundleName",
        "Project",
        "Selection",
        "Counts",
        "DbFileName",
        "DbByteLength",
        "DbSha256",
    ];
    const obj = m as Record<string, unknown>;
    for (const k of required) {
        if (!(k in obj)) {
            return {
                Reason: "ManifestMalformed",
                Detail: `manifest.json missing required field "${String(k)}".`,
            };
        }
    }
    if (typeof obj.FormatVersion !== "number" || !Number.isInteger(obj.FormatVersion)) {
        return { Reason: "ManifestMalformed", Detail: "FormatVersion must be an integer." };
    }
    if (typeof obj.DbByteLength !== "number" || obj.DbByteLength < 0) {
        return { Reason: "ManifestMalformed", Detail: "DbByteLength must be a non-negative integer." };
    }
    if (typeof obj.DbSha256 !== "string" || !/^[0-9a-f]{64}$/.test(obj.DbSha256)) {
        return { Reason: "ManifestMalformed", Detail: "DbSha256 must be 64 lowercase hex chars." };
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Conflict resolution                                                */
/* ------------------------------------------------------------------ */

function uniqueRenameFor(
    desired: string,
    existingLower: ReadonlySet<string>,
): string | null {
    if (!existingLower.has(desired.toLowerCase())) return desired;
    for (let n = 1; n <= RENAME_MAX_ATTEMPTS; n++) {
        const candidate = n === 1 ? `${desired} (imported)` : `${desired} (imported ${n})`;
        if (!existingLower.has(candidate.toLowerCase())) return candidate;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Source-DB readers (sql.js raw)                                     */
/* ------------------------------------------------------------------ */

function readGroupsFromSource(db: Database): StepGroupRow[] {
    const stmt = db.prepare(
        `SELECT StepGroupId, ProjectId, ParentStepGroupId, Name, Description,
                OrderIndex, IsArchived, CreatedAt, UpdatedAt
         FROM StepGroup
         ORDER BY ParentStepGroupId IS NULL DESC, ParentStepGroupId ASC,
                  OrderIndex ASC, StepGroupId ASC;`,
    );
    try {
        const rows: StepGroupRow[] = [];
        while (stmt.step()) {
            const r = stmt.getAsObject() as unknown as StepGroupRow;
            rows.push({ ...r, IsArchived: Boolean(r.IsArchived) });
        }
        return rows;
    } finally {
        stmt.free();
    }
}

function readStepsForGroup(db: Database, stepGroupId: number): StepRow[] {
    const stmt = db.prepare(
        `SELECT StepId, StepGroupId, OrderIndex, StepKindId, Label,
                PayloadJson, TargetStepGroupId, IsDisabled, CreatedAt, UpdatedAt
         FROM Step
         WHERE StepGroupId = ?
         ORDER BY OrderIndex ASC, StepId ASC;`,
    );
    try {
        stmt.bind([stepGroupId]);
        const rows: StepRow[] = [];
        while (stmt.step()) {
            const r = stmt.getAsObject() as unknown as StepRow;
            rows.push({ ...r, IsDisabled: Boolean(r.IsDisabled) });
        }
        return rows;
    } finally {
        stmt.free();
    }
}

/* ------------------------------------------------------------------ */
/*  Topological order (parents before children)                        */
/* ------------------------------------------------------------------ */

function orderByAncestry(rows: ReadonlyArray<StepGroupRow>): StepGroupRow[] {
    const ids = new Set(rows.map((r) => r.StepGroupId));
    const remaining = new Map(rows.map((r) => [r.StepGroupId, r]));
    const out: StepGroupRow[] = [];
    const placed = new Set<number>();
    while (remaining.size > 0) {
        let progressed = false;
        for (const [id, r] of remaining) {
            const parent = r.ParentStepGroupId;
            const parentReady =
                parent === null || !ids.has(parent) || placed.has(parent);
            if (parentReady) {
                out.push(r);
                placed.add(id);
                remaining.delete(id);
                progressed = true;
                break;
            }
        }
        if (!progressed) {
            for (const r of remaining.values()) out.push(r);
            break;
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Top-level entrypoint                                               */
/* ------------------------------------------------------------------ */

export async function runStepGroupImport(
    init: RunStepGroupImportInit,
): Promise<StepGroupImportResult> {
    const conflict: ConflictPolicy = init.OnNameConflict ?? "Rename";
    const attachUnder = init.AttachUnderStepGroupId ?? null;

    /* --- Step 1: unzip + manifest + SHA verification --- */
    const unpacked = await unpackBundle(init.ZipBytes, init.JsZip);
    if ("Reason" in unpacked) return unpacked;
    const { Manifest: manifest, DbBytes: dbBytes } = unpacked;

    /* --- Step 2: open the source DB and apply schema (catches version/corrupt) --- */
    let sourceDb: Database;
    try {
        sourceDb = new init.SqlJs.Database(dbBytes);
    } catch (err) {
        return {
            Reason: "DbCorrupt",
            Detail: err instanceof Error ? err.message : "sql.js refused to open embedded DB",
        };
    }

    try {
        try {
            applySchema(sourceDb);
        } catch (err) {
            return {
                Reason: "DbSchemaIncompatible",
                Detail: err instanceof Error ? err.message : "applySchema rejected embedded DB",
            };
        }

        /* --- Step 3: validate destination project + attach parent --- */
        const destLib = init.Destination;
        const destProject = destLib.listProjects()
            .find((p) => p.ProjectId === init.DestinationProjectId);
        if (destProject === undefined) {
            return {
                Reason: "DestinationProjectMissing",
                Detail: `DestinationProjectId=${init.DestinationProjectId} not found in destination DB.`,
                OffendingIds: [init.DestinationProjectId],
            };
        }
        const destGroups = destLib.listGroups(init.DestinationProjectId);
        if (attachUnder !== null) {
            const parent = destGroups.find((g) => g.StepGroupId === attachUnder);
            if (parent === undefined) {
                return {
                    Reason: "AttachParentMissing",
                    Detail: `AttachUnderStepGroupId=${attachUnder} not found in destination project.`,
                    OffendingIds: [attachUnder],
                };
            }
            if (parent.ProjectId !== init.DestinationProjectId) {
                return {
                    Reason: "AttachParentWrongProject",
                    Detail: `AttachUnderStepGroupId=${attachUnder} belongs to a different project.`,
                    OffendingIds: [attachUnder],
                };
            }
        }

        /* --- Step 4: build the import plan against in-memory state --- */
        const sourceGroups = orderByAncestry(readGroupsFromSource(sourceDb));
        const sourceIdSet = new Set(sourceGroups.map((g) => g.StepGroupId));

        // Pre-flight RunGroup target check — every RunGroup step in the
        // bundle must point at a group that is also in the bundle.
        const allSourceSteps: StepRow[] = [];
        const dangling: number[] = [];
        let runGroupRefs = 0;
        for (const g of sourceGroups) {
            for (const s of readStepsForGroup(sourceDb, g.StepGroupId)) {
                allSourceSteps.push(s);
                if (s.StepKindId === StepKindId.RunGroup) {
                    runGroupRefs += 1;
                    if (s.TargetStepGroupId === null || !sourceIdSet.has(s.TargetStepGroupId)) {
                        dangling.push(s.StepId);
                    }
                }
            }
        }
        if (dangling.length > 0) {
            return {
                Reason: "RunGroupTargetMissing",
                Detail:
                    `Step(s) ${dangling.join(", ")} are RunGroup invocations whose target ` +
                    `is not present in the bundle. The bundle is corrupt.`,
                OffendingIds: dangling,
            };
        }

        // Resolve name conflicts for the import roots (groups whose
        // parent is null in the source OR whose parent is outside the
        // bundle — both will land under `attachUnder` in the
        // destination). We compare against the destination siblings of
        // `attachUnder` (case-insensitive).
        const destSiblingNamesLower = new Set(
            destGroups
                .filter((g) => (g.ParentStepGroupId ?? null) === attachUnder)
                .map((g) => g.Name.toLowerCase()),
        );
        const renamedRoots: Array<{ OldName: string; NewName: string }> = [];
        const effectiveName = new Map<number, string>();
        const collisions: string[] = [];
        for (const g of sourceGroups) {
            const isRoot =
                g.ParentStepGroupId === null || !sourceIdSet.has(g.ParentStepGroupId);
            if (!isRoot) continue;
            if (destSiblingNamesLower.has(g.Name.toLowerCase())) {
                if (conflict === "Fail") {
                    collisions.push(g.Name);
                    continue;
                }
                if (conflict === "Skip") {
                    // Mark the whole subtree as skipped via empty name.
                    effectiveName.set(g.StepGroupId, "");
                    continue;
                }
                const renamed = uniqueRenameFor(g.Name, destSiblingNamesLower);
                if (renamed === null) {
                    return {
                        Reason: "NameConflict",
                        Detail:
                            `Could not find a free rename slot for "${g.Name}" after ` +
                            `${RENAME_MAX_ATTEMPTS} attempts.`,
                        OffendingNames: [g.Name],
                    };
                }
                renamedRoots.push({ OldName: g.Name, NewName: renamed });
                destSiblingNamesLower.add(renamed.toLowerCase());
                effectiveName.set(g.StepGroupId, renamed);
            } else {
                effectiveName.set(g.StepGroupId, g.Name);
                destSiblingNamesLower.add(g.Name.toLowerCase());
            }
        }
        if (conflict === "Fail" && collisions.length > 0) {
            return {
                Reason: "NameConflict",
                Detail:
                    `OnNameConflict='Fail' and the following root group name(s) already exist ` +
                    `in the destination: ${collisions.join(", ")}.`,
                OffendingNames: collisions,
            };
        }

        // If Skip removed every root, surface that as a no-op success
        // rather than silently committing an empty transaction.
        const skippedRootIds = new Set<number>();
        for (const [id, name] of effectiveName) {
            if (name === "") skippedRootIds.add(id);
        }
        const skippedSubtree = collectSubtree(sourceGroups, skippedRootIds);

        /* --- Step 5: atomic merge --- */
        const idMap = new Map<number, number>();
        const rawDest = destLib.raw;
        rawDest.exec("BEGIN;");
        try {
            const importedGroups: number[] = [];
            const rootStepGroupIds: number[] = [];

            for (const g of sourceGroups) {
                if (skippedSubtree.has(g.StepGroupId)) continue;
                const isRoot =
                    g.ParentStepGroupId === null || !sourceIdSet.has(g.ParentStepGroupId);
                const newParent = isRoot
                    ? attachUnder
                    : (idMap.get(g.ParentStepGroupId as number) ?? null);
                const name = isRoot
                    ? (effectiveName.get(g.StepGroupId) ?? g.Name)
                    : g.Name;
                const newId = destLib.createGroup({
                    ProjectId: init.DestinationProjectId,
                    ParentStepGroupId: newParent,
                    Name: name,
                    Description: g.Description,
                    OrderIndex: g.OrderIndex,
                });
                idMap.set(g.StepGroupId, newId);
                importedGroups.push(newId);
                if (isRoot) rootStepGroupIds.push(newId);
            }

            // Insert steps in two passes: non-RunGroup first, then
            // RunGroup with rewritten TargetStepGroupId. This avoids
            // depending on insertion order of group IDs (the runtime
            // CHECK constraint requires a non-null target for
            // RunGroup steps, so we cannot defer FK validation).
            let stepCount = 0;
            const runGroupSteps: StepRow[] = [];
            for (const s of allSourceSteps) {
                const newGroupId = idMap.get(s.StepGroupId);
                if (newGroupId === undefined) continue; // skipped subtree
                if (s.StepKindId === StepKindId.RunGroup) {
                    runGroupSteps.push(s);
                    continue;
                }
                destLib.appendStep({
                    StepGroupId: newGroupId,
                    StepKindId: s.StepKindId,
                    Label: s.Label,
                    PayloadJson: s.PayloadJson,
                });
                stepCount += 1;
            }
            for (const s of runGroupSteps) {
                const newGroupId = idMap.get(s.StepGroupId);
                if (newGroupId === undefined) continue;
                const oldTarget = s.TargetStepGroupId;
                const newTarget = oldTarget === null ? null : (idMap.get(oldTarget) ?? null);
                if (newTarget === null) {
                    // Target was in a skipped subtree → bail and roll back.
                    throw new Error(
                        `RunGroup StepId=${s.StepId} targets a group that was skipped due to ` +
                        `name conflict policy. Re-run with OnNameConflict='Rename' or 'Fail'.`,
                    );
                }
                destLib.appendStep({
                    StepGroupId: newGroupId,
                    StepKindId: StepKindId.RunGroup,
                    Label: s.Label,
                    TargetStepGroupId: newTarget,
                });
                stepCount += 1;
            }

            rawDest.exec("COMMIT;");

            return {
                Reason: "Ok",
                Manifest: manifest,
                DestinationProjectId: init.DestinationProjectId,
                AttachedUnderStepGroupId: attachUnder,
                RootStepGroupIds: rootStepGroupIds,
                IdMap: Array.from(idMap.entries()).map(([OldId, NewId]) => ({ OldId, NewId })),
                RenamedRoots: renamedRoots,
                Counts: {
                    StepGroups: importedGroups.length,
                    Steps: stepCount,
                    RunGroupRefs: runGroupRefs,
                },
            };
        } catch (err) {
            try {
                rawDest.exec("ROLLBACK;");
            } catch {
                /* ignore — rollback failure is secondary to the original error */
            }
            return {
                Reason: "InternalError",
                Detail: err instanceof Error ? err.message : "merge transaction failed",
            };
        }
    } finally {
        sourceDb.close();
    }
}

function collectSubtree(
    rows: ReadonlyArray<StepGroupRow>,
    rootIds: ReadonlySet<number>,
): Set<number> {
    if (rootIds.size === 0) return new Set();
    const out = new Set<number>(rootIds);
    let changed = true;
    while (changed) {
        changed = false;
        for (const r of rows) {
            if (r.ParentStepGroupId !== null && out.has(r.ParentStepGroupId) && !out.has(r.StepGroupId)) {
                out.add(r.StepGroupId);
                changed = true;
            }
        }
    }
    return out;
}
