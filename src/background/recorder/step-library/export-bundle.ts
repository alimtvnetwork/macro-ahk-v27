/**
 * Marco Extension — Step Group Bundle Export
 *
 * Packages a user-selected subset of `StepGroup` rows (and their `Step`
 * children, optionally including descendants) into a downloadable ZIP
 * containing:
 *
 *   manifest.json     — selection metadata, schema version, checksums.
 *   step-groups.db    — a fresh sql.js database with only the selected
 *                       Project + StepGroup + Step rows + the canonical
 *                       StepKind seed. Schema is identical to the live
 *                       DB so it can be re-opened with `StepLibraryDb`.
 *   readme.txt        — plain-text human description of the bundle.
 *
 * The module is **pure** — no chrome.*, no DOM, no file-system. It
 * accepts the live `StepLibraryDb` plus a sql.js factory, and returns
 * the bytes of a finished ZIP. The caller decides how to surface the
 * download (popup `<a download>`, options page, background → blob URL).
 *
 * Failures are returned as structured `ExportFailure` objects that
 * conform to the verbose-logging-and-failure-diagnostics contract — a
 * `Reason`, optional `Detail`, and the offending IDs. Nothing is
 * thrown to the caller after `runStepGroupExport` returns.
 *
 * @see spec/31-macro-recorder/16-step-group-library.md  §8.4 (export)
 * @see mem://standards/verbose-logging-and-failure-diagnostics
 */

import type { Database, SqlJsStatic } from "sql.js";
import type JSZipType from "jszip";

import { applySchema, StepKindId } from "./schema";
import { StepLibraryDb, type StepGroupRow, type StepRow } from "./db";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export const STEP_GROUP_BUNDLE_FORMAT_VERSION = 1;

export interface StepGroupExportInput {
    /** Source DB to read from. */
    readonly Source: StepLibraryDb;
    /** Project that owns every selected group. */
    readonly ProjectId: number;
    /** Group IDs the user explicitly ticked in the UI. */
    readonly SelectedStepGroupIds: ReadonlyArray<number>;
    /** When true, all transitive descendants of each selection are included. */
    readonly IncludeDescendants?: boolean;
    /** Free-form label persisted in the manifest (e.g. "Q2 onboarding macros"). */
    readonly BundleName?: string;
    /** Optional override for the timestamp baked into the manifest. */
    readonly NowIso?: () => string;
}

export type ExportReason =
    | "Ok"
    | "ProjectNotFound"
    | "GroupNotFound"
    | "GroupOutsideProject"
    | "EmptySelection"
    | "RunGroupTargetMissing"
    | "InternalError";

export interface ExportFailure {
    readonly Reason: Exclude<ExportReason, "Ok">;
    readonly Detail: string;
    readonly OffendingIds: ReadonlyArray<number>;
}

export interface StepGroupExportManifest {
    readonly FormatVersion: number;
    readonly GeneratedAt: string;
    readonly BundleName: string;
    readonly Project: {
        readonly ProjectId: number;
        readonly ProjectExternalId: string;
        readonly Name: string;
    };
    readonly Selection: {
        readonly SelectedStepGroupIds: ReadonlyArray<number>;
        readonly IncludeDescendants: boolean;
        readonly EffectiveStepGroupIds: ReadonlyArray<number>;
    };
    readonly Counts: {
        readonly StepGroups: number;
        readonly Steps: number;
        readonly RunGroupRefs: number;
    };
    readonly DbFileName: string;
    readonly DbByteLength: number;
    readonly DbSha256: string;
}

export interface StepGroupExportSuccess {
    readonly Reason: "Ok";
    readonly ZipBytes: Uint8Array;
    readonly ZipFileName: string;
    readonly Manifest: StepGroupExportManifest;
}

export type StepGroupExportResult = StepGroupExportSuccess | ExportFailure;

export interface RunStepGroupExportInit extends StepGroupExportInput {
    /** sql.js factory — typically the lazily-initialised singleton. */
    readonly SqlJs: SqlJsStatic;
    /** JSZip constructor — passed in so this module stays tree-shakeable. */
    readonly JsZip: typeof JSZipType;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MANIFEST_FILE = "manifest.json";
const DB_FILE = "step-groups.db";
const README_FILE = "readme.txt";

/* ------------------------------------------------------------------ */
/*  Selection resolution                                               */
/* ------------------------------------------------------------------ */

/**
 * Expand the user selection into the effective set of group IDs that
 * will be copied into the bundle. Returns either the resolved set or a
 * structured failure (project mismatch, missing IDs, empty selection).
 *
 * Pure — does not mutate the source DB.
 */
export function resolveSelection(
    src: StepLibraryDb,
    projectId: number,
    selected: ReadonlyArray<number>,
    includeDescendants: boolean,
): { readonly Ok: true; readonly Ids: ReadonlyArray<number> } | ExportFailure {
    if (selected.length === 0) {
        return {
            Reason: "EmptySelection",
            Detail: "SelectedStepGroupIds was empty — nothing to export.",
            OffendingIds: [],
        };
    }

    const allInProject = src.listGroups(projectId);
    const byId = new Map<number, StepGroupRow>(
        allInProject.map((g) => [g.StepGroupId, g]),
    );
    const childrenOf = new Map<number, number[]>();
    for (const g of allInProject) {
        if (g.ParentStepGroupId !== null) {
            const arr = childrenOf.get(g.ParentStepGroupId) ?? [];
            arr.push(g.StepGroupId);
            childrenOf.set(g.ParentStepGroupId, arr);
        }
    }

    const missing: number[] = [];
    const wrongProject: number[] = [];
    const seedIds: number[] = [];
    for (const id of selected) {
        const row = byId.get(id);
        if (row === undefined) {
            // Could be in another project, or not exist at all.
            missing.push(id);
            continue;
        }
        if (row.ProjectId !== projectId) {
            wrongProject.push(id);
            continue;
        }
        seedIds.push(id);
    }
    if (wrongProject.length > 0) {
        return {
            Reason: "GroupOutsideProject",
            Detail: `StepGroupId(s) ${wrongProject.join(", ")} do not belong to ProjectId=${projectId}.`,
            OffendingIds: wrongProject,
        };
    }
    if (missing.length > 0) {
        return {
            Reason: "GroupNotFound",
            Detail: `StepGroupId(s) ${missing.join(", ")} not found in project ${projectId}.`,
            OffendingIds: missing,
        };
    }

    if (!includeDescendants) {
        return { Ok: true, Ids: dedupeSorted(seedIds) };
    }

    // BFS through descendants; cap visited to len(allInProject) to defend
    // against pathological cycles (the schema triggers should already
    // forbid them, but defensive coding keeps export deterministic).
    const visited = new Set<number>();
    const queue: number[] = [...seedIds];
    const ceiling = allInProject.length + 1;
    let iter = 0;
    while (queue.length > 0) {
        if (iter++ > ceiling) {
            return {
                Reason: "InternalError",
                Detail: "Descendant traversal exceeded ceiling — possible cycle in StepGroup tree.",
                OffendingIds: Array.from(visited),
            };
        }
        const id = queue.shift() as number;
        if (visited.has(id)) continue;
        visited.add(id);
        const kids = childrenOf.get(id);
        if (kids !== undefined) {
            for (const k of kids) queue.push(k);
        }
    }
    return { Ok: true, Ids: dedupeSorted(Array.from(visited)) };
}

function dedupeSorted(ids: ReadonlyArray<number>): ReadonlyArray<number> {
    return Array.from(new Set(ids)).sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ */
/*  Preview (dry-run)                                                  */
/* ------------------------------------------------------------------ */

/**
 * A single RunGroup invocation whose target StepGroup is **not** part
 * of the effective export selection. Surfaced as a warning in the
 * pre-download preview dialog so the user can either widen their
 * selection (or tick "Include descendants") before they ship a bundle
 * that would fail import-time integrity checks.
 */
export interface DanglingRunGroupRef {
    readonly StepId: number;
    readonly StepLabel: string | null;
    readonly OwnerStepGroupId: number;
    readonly OwnerStepGroupName: string;
    readonly TargetStepGroupId: number | null;
}

export interface StepGroupExportPreview {
    readonly Reason: "Ok";
    /** Effective set after descendant resolution — what will ship. */
    readonly EffectiveStepGroupIds: ReadonlyArray<number>;
    readonly Counts: {
        readonly StepGroups: number;
        readonly Steps: number;
        readonly RunGroupRefs: number;
    };
    /**
     * RunGroup steps whose target lives outside the effective selection.
     * Non-empty means a real export would fail with `RunGroupTargetMissing`
     * — the UI uses this list to warn the user before they click download.
     */
    readonly DanglingRunGroupRefs: ReadonlyArray<DanglingRunGroupRef>;
}

export type StepGroupExportPreviewResult = StepGroupExportPreview | ExportFailure;

export interface PreviewStepGroupExportInput {
    readonly Source: StepLibraryDb;
    readonly ProjectId: number;
    readonly SelectedStepGroupIds: ReadonlyArray<number>;
    readonly IncludeDescendants?: boolean;
}

/**
 * Compute the same selection / counts / RunGroup-ref analysis the real
 * export would, **without** building a sql.js snapshot or hashing.
 *
 * This is the data source for the pre-download preview dialog: it
 * always succeeds with counts when the selection itself is valid, and
 * returns dangling RunGroup refs as soft warnings (not failures) so
 * the user can decide whether to widen the selection or proceed.
 *
 * Pure — no DOM, no I/O, safe to call on every selection change.
 */
export function previewStepGroupExport(
    init: PreviewStepGroupExportInput,
): StepGroupExportPreviewResult {
    const resolved = resolveSelection(
        init.Source,
        init.ProjectId,
        init.SelectedStepGroupIds,
        init.IncludeDescendants ?? false,
    );
    if ("Reason" in resolved) return resolved;

    const includedSet = new Set(resolved.Ids);
    const groupNameById = new Map<number, string>();
    for (const g of init.Source.listGroups(init.ProjectId)) {
        groupNameById.set(g.StepGroupId, g.Name);
    }

    let stepCount = 0;
    let runGroupRefs = 0;
    const dangling: DanglingRunGroupRef[] = [];
    for (const id of resolved.Ids) {
        for (const s of init.Source.listSteps(id)) {
            stepCount += 1;
            if (s.StepKindId === StepKindId.RunGroup) {
                runGroupRefs += 1;
                if (s.TargetStepGroupId === null || !includedSet.has(s.TargetStepGroupId)) {
                    dangling.push({
                        StepId: s.StepId,
                        StepLabel: s.Label,
                        OwnerStepGroupId: id,
                        OwnerStepGroupName: groupNameById.get(id) ?? `#${id}`,
                        TargetStepGroupId: s.TargetStepGroupId,
                    });
                }
            }
        }
    }

    return {
        Reason: "Ok",
        EffectiveStepGroupIds: resolved.Ids,
        Counts: {
            StepGroups: resolved.Ids.length,
            Steps: stepCount,
            RunGroupRefs: runGroupRefs,
        },
        DanglingRunGroupRefs: dangling,
    };
}

/* ------------------------------------------------------------------ */
/*  Filtered snapshot                                                  */
/* ------------------------------------------------------------------ */

interface SnapshotResult {
    readonly DbBytes: Uint8Array;
    readonly Counts: { readonly StepGroups: number; readonly Steps: number; readonly RunGroupRefs: number };
}

/**
 * Build a fresh sql.js database whose schema matches the live one and
 * whose data is restricted to:
 *   - the parent Project row,
 *   - the resolved StepGroup rows,
 *   - every Step row owned by those groups.
 *
 * RunGroup steps whose `TargetStepGroupId` is NOT in the effective set
 * fail the export with `RunGroupTargetMissing` — the bundle would
 * otherwise be unusable on import (broken FK).
 */
export function buildFilteredSnapshot(
    src: StepLibraryDb,
    sqlJs: SqlJsStatic,
    projectId: number,
    effectiveIds: ReadonlyArray<number>,
): SnapshotResult | ExportFailure {
    const projectRow = src.listProjects().find((p) => p.ProjectId === projectId);
    if (projectRow === undefined) {
        return {
            Reason: "ProjectNotFound",
            Detail: `ProjectId=${projectId} not present in source DB.`,
            OffendingIds: [projectId],
        };
    }

    // Pre-flight: collect all steps for the selected groups + verify
    // RunGroup targets stay inside the bundle.
    const includedSet = new Set(effectiveIds);
    const allSteps: StepRow[] = [];
    const danglingRunGroup: number[] = [];
    let runGroupRefs = 0;
    for (const id of effectiveIds) {
        for (const s of src.listSteps(id)) {
            allSteps.push(s);
            if (s.StepKindId === StepKindId.RunGroup) {
                runGroupRefs += 1;
                if (s.TargetStepGroupId === null || !includedSet.has(s.TargetStepGroupId)) {
                    danglingRunGroup.push(s.StepId);
                }
            }
        }
    }
    if (danglingRunGroup.length > 0) {
        return {
            Reason: "RunGroupTargetMissing",
            Detail:
                `Step(s) ${danglingRunGroup.join(", ")} are RunGroup invocations whose target ` +
                `StepGroup is not in the export selection. Re-run with IncludeDescendants=true ` +
                `or add the missing groups manually.`,
            OffendingIds: danglingRunGroup,
        };
    }

    // Build a fresh DB with the same schema. We disable foreign keys
    // for the bulk insert and re-enable PRAGMA at the end so the
    // re-opened bundle stays consistent.
    const dst = new sqlJs.Database();
    try {
        applySchema(dst);
        dst.exec("PRAGMA foreign_keys = OFF;");
        dst.exec("BEGIN;");

        copyProject(dst, {
            ProjectId: projectRow.ProjectId,
            ProjectExternalId: projectRow.ProjectExternalId,
            Name: projectRow.Name,
            CreatedAt: projectRow.CreatedAt,
            UpdatedAt: projectRow.UpdatedAt,
        });

        // Insert StepGroups in dependency order (parents before
        // children) so the FK reference is always satisfied even if
        // the user later turns foreign_keys back on.
        const orderedGroups = orderGroupsByAncestry(
            effectiveIds.map((id) => requireRow(src.listGroups(projectId), id)),
        );
        for (const g of orderedGroups) {
            insertGroup(dst, g);
        }
        for (const s of allSteps) {
            insertStep(dst, s);
        }

        dst.exec("COMMIT;");
        dst.exec("PRAGMA foreign_keys = ON;");
        const bytes = dst.export();
        return {
            DbBytes: bytes,
            Counts: {
                StepGroups: orderedGroups.length,
                Steps: allSteps.length,
                RunGroupRefs: runGroupRefs,
            },
        };
    } catch (err) {
        try {
            dst.exec("ROLLBACK;");
        } catch {
            /* ignore */
        }
        return {
            Reason: "InternalError",
            Detail: err instanceof Error ? err.message : "snapshot build failed",
            OffendingIds: Array.from(includedSet),
        };
    } finally {
        dst.close();
    }
}

function requireRow(rows: ReadonlyArray<StepGroupRow>, id: number): StepGroupRow {
    const row = rows.find((r) => r.StepGroupId === id);
    if (row === undefined) {
        throw new Error(`buildFilteredSnapshot: StepGroupId ${id} disappeared mid-export`);
    }
    return row;
}

function orderGroupsByAncestry(rows: ReadonlyArray<StepGroupRow>): StepGroupRow[] {
    // Topological sort: a group can only be inserted after its parent
    // (when the parent is also part of the selection).
    const ids = new Set(rows.map((r) => r.StepGroupId));
    const remaining = new Map(rows.map((r) => [r.StepGroupId, r]));
    const out: StepGroupRow[] = [];
    while (remaining.size > 0) {
        let progressed = false;
        for (const [id, r] of remaining) {
            const parent = r.ParentStepGroupId;
            if (parent === null || !ids.has(parent) || out.some((o) => o.StepGroupId === parent)) {
                out.push(r);
                remaining.delete(id);
                progressed = true;
                break;
            }
        }
        if (!progressed) {
            // Should be impossible — depth triggers prevent cycles —
            // but make it deterministic in case the DB was hand-edited.
            for (const r of remaining.values()) out.push(r);
            break;
        }
    }
    return out;
}

function copyProject(
    db: Database,
    p: {
        readonly ProjectId: number;
        readonly ProjectExternalId: string;
        readonly Name: string;
        readonly CreatedAt: string;
        readonly UpdatedAt: string;
    },
): void {
    const stmt = db.prepare(
        `INSERT INTO Project (ProjectId, ProjectExternalId, Name, CreatedAt, UpdatedAt)
         VALUES (?, ?, ?, ?, ?);`,
    );
    try {
        stmt.run([p.ProjectId, p.ProjectExternalId, p.Name, p.CreatedAt, p.UpdatedAt]);
    } finally {
        stmt.free();
    }
}

function insertGroup(db: Database, g: StepGroupRow): void {
    const stmt = db.prepare(
        `INSERT INTO StepGroup (
            StepGroupId, ProjectId, ParentStepGroupId, Name, Description,
            OrderIndex, IsArchived, CreatedAt, UpdatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    );
    try {
        stmt.run([
            g.StepGroupId,
            g.ProjectId,
            g.ParentStepGroupId,
            g.Name,
            g.Description,
            g.OrderIndex,
            g.IsArchived ? 1 : 0,
            g.CreatedAt,
            g.UpdatedAt,
        ]);
    } finally {
        stmt.free();
    }
}

function insertStep(db: Database, s: StepRow): void {
    const stmt = db.prepare(
        `INSERT INTO Step (
            StepId, StepGroupId, OrderIndex, StepKindId, Label,
            PayloadJson, TargetStepGroupId, IsDisabled, CreatedAt, UpdatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    );
    try {
        stmt.run([
            s.StepId,
            s.StepGroupId,
            s.OrderIndex,
            s.StepKindId,
            s.Label,
            s.PayloadJson,
            s.TargetStepGroupId,
            s.IsDisabled ? 1 : 0,
            s.CreatedAt,
            s.UpdatedAt,
        ]);
    } finally {
        stmt.free();
    }
}

/* ------------------------------------------------------------------ */
/*  Hashing & ZIP packaging                                            */
/* ------------------------------------------------------------------ */

/**
 * SHA-256 hash returned as lowercase hex. Uses Web Crypto so it works
 * in the service worker, popup, options, and Vitest's jsdom env.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    if (typeof globalThis.crypto?.subtle?.digest !== "function") {
        throw new Error("sha256Hex: globalThis.crypto.subtle.digest unavailable");
    }
    // Copy into a fresh ArrayBuffer — Node's webcrypto rejects Uint8Array and SharedArrayBuffer.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
    const arr = new Uint8Array(digest);
    let out = "";
    for (let i = 0; i < arr.length; i++) {
        out += arr[i].toString(16).padStart(2, "0");
    }
    return out;
}

function buildReadme(manifest: StepGroupExportManifest): string {
    return [
        "Marco Step Group Bundle",
        "=======================",
        "",
        `Bundle:        ${manifest.BundleName}`,
        `Generated:     ${manifest.GeneratedAt}`,
        `Project:       ${manifest.Project.Name} (#${manifest.Project.ProjectId})`,
        `Step groups:   ${manifest.Counts.StepGroups}`,
        `Steps:         ${manifest.Counts.Steps}`,
        `RunGroup refs: ${manifest.Counts.RunGroupRefs}`,
        `DB filename:   ${manifest.DbFileName} (${manifest.DbByteLength} bytes)`,
        `DB SHA-256:    ${manifest.DbSha256}`,
        "",
        "Open `step-groups.db` with any SQLite client, or import via",
        "the Marco extension's Step Group Library panel.",
        "",
    ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Top-level entrypoint                                               */
/* ------------------------------------------------------------------ */

/**
 * Resolve the selection, snapshot the DB, hash it, and package the
 * three files into a ZIP. Returns either a complete success payload
 * (bytes ready to download) or a structured failure.
 */
export async function runStepGroupExport(
    init: RunStepGroupExportInit,
): Promise<StepGroupExportResult> {
    const nowIso = init.NowIso ?? (() => new Date().toISOString());

    const resolved = resolveSelection(
        init.Source,
        init.ProjectId,
        init.SelectedStepGroupIds,
        init.IncludeDescendants ?? false,
    );
    if ("Reason" in resolved) return resolved;

    const snapshot = buildFilteredSnapshot(
        init.Source,
        init.SqlJs,
        init.ProjectId,
        resolved.Ids,
    );
    if ("Reason" in snapshot) return snapshot;

    const projectRow = init.Source.listProjects().find((p) => p.ProjectId === init.ProjectId);
    if (projectRow === undefined) {
        return {
            Reason: "ProjectNotFound",
            Detail: `ProjectId=${init.ProjectId} disappeared mid-export.`,
            OffendingIds: [init.ProjectId],
        };
    }

    const sha = await sha256Hex(snapshot.DbBytes);

    const manifest: StepGroupExportManifest = {
        FormatVersion: STEP_GROUP_BUNDLE_FORMAT_VERSION,
        GeneratedAt: nowIso(),
        BundleName: init.BundleName ?? `${projectRow.Name} step groups`,
        Project: {
            ProjectId: projectRow.ProjectId,
            ProjectExternalId: projectRow.ProjectExternalId,
            Name: projectRow.Name,
        },
        Selection: {
            SelectedStepGroupIds: [...init.SelectedStepGroupIds].sort((a, b) => a - b),
            IncludeDescendants: init.IncludeDescendants ?? false,
            EffectiveStepGroupIds: resolved.Ids,
        },
        Counts: snapshot.Counts,
        DbFileName: DB_FILE,
        DbByteLength: snapshot.DbBytes.length,
        DbSha256: sha,
    };

    const zip = new init.JsZip();
    zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    zip.file(DB_FILE, snapshot.DbBytes);
    zip.file(README_FILE, buildReadme(manifest));

    let zipBytes: Uint8Array;
    try {
        zipBytes = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        });
    } catch (err) {
        return {
            Reason: "InternalError",
            Detail: err instanceof Error ? err.message : "JSZip.generateAsync failed",
            OffendingIds: [],
        };
    }

    const safeName = projectRow.Name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "")
        || `project-${projectRow.ProjectId}`;
    const stamp = manifest.GeneratedAt.replace(/[:.]/g, "-");
    const zipFileName = `step-groups-${safeName}-${stamp}.zip`;

    return {
        Reason: "Ok",
        ZipBytes: zipBytes,
        ZipFileName: zipFileName,
        Manifest: manifest,
    };
}
