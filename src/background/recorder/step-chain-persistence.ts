/**
 * Marco Extension — Step Chain Persistence (Phase 14)
 *
 * CRUD for the Phase 14 chain extensions: editable per-step metadata
 * (Description / IsDisabled / RetryCount / TimeoutMs), tag set, and the
 * two cross-project link slots (OnSuccessProjectId / OnFailureProjectId).
 *
 * Pure DB-layer helpers take a `SqlJsDatabase` so they are unit-testable
 * with an in-memory schema; async wrappers route through `initProjectDb`
 * for production use, mirroring the pattern in `step-persistence.ts`.
 *
 * @see spec/31-macro-recorder/14-step-chaining-and-cross-project-links.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { initProjectDb } from "../project-db-manager";
import { readStepRow, type PersistedStep } from "./step-persistence";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface StepMetaPatch {
    readonly Label?: string;
    readonly Description?: string | null;
    readonly IsDisabled?: boolean;
    readonly RetryCount?: number;
    readonly TimeoutMs?: number | null;
}

export type StepLinkSlot = "OnSuccessProjectId" | "OnFailureProjectId";

/* ------------------------------------------------------------------ */
/*  Validation constants & helpers (Phase 14 spec constraints)         */
/* ------------------------------------------------------------------ */

/** Upper bound on RetryCount — prevents runaway replay loops. */
export const MAX_RETRY_COUNT = 50;
/** Upper bound on TimeoutMs — 10 minutes per step attempt. */
export const MAX_TIMEOUT_MS = 600_000;
/** Max length of Step.Label. */
export const MAX_LABEL_LENGTH = 200;
/** Max length of Step.Description. */
export const MAX_DESCRIPTION_LENGTH = 2_000;
/** Max number of tags attachable to a single step. */
export const MAX_TAGS_PER_STEP = 32;
/** Max length of a single tag name. */
export const MAX_TAG_LENGTH = 64;
/** Max length of a cross-project link slug. */
export const MAX_SLUG_LENGTH = 128;
/** Tag names: alphanumeric, dash, underscore, dot, space (1..MAX_TAG_LENGTH). */
const TAG_NAME_PATTERN = /^[A-Za-z0-9_\-. ]+$/;
/** Project slug: alphanumeric, dash, underscore, dot. */
const PROJECT_SLUG_PATTERN = /^[A-Za-z0-9_.-]+$/;

function assertRetry(n: number): void {
    if (!Number.isInteger(n) || n < 0) throw new Error(`RetryCount must be a non-negative integer; got ${n}`);
    if (n > MAX_RETRY_COUNT) throw new Error(`RetryCount exceeds ${MAX_RETRY_COUNT}; got ${n}`);
}

function assertTimeout(n: number | null): void {
    if (n === null) return;
    if (!Number.isInteger(n) || n <= 0) throw new Error(`TimeoutMs must be a positive integer or null; got ${n}`);
    if (n > MAX_TIMEOUT_MS) throw new Error(`TimeoutMs exceeds ${MAX_TIMEOUT_MS}ms; got ${n}`);
}

function assertLabel(s: string): void {
    if (typeof s !== "string") throw new Error("Label must be a string");
    const trimmed = s.trim();
    if (trimmed.length === 0) throw new Error("Label cannot be empty");
    if (trimmed.length > MAX_LABEL_LENGTH) {
        throw new Error(`Label exceeds ${MAX_LABEL_LENGTH} chars: ${trimmed.length}`);
    }
}

function assertDescription(s: string | null): void {
    if (s === null) return;
    if (typeof s !== "string") throw new Error("Description must be a string or null");
    if (s.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(`Description exceeds ${MAX_DESCRIPTION_LENGTH} chars: ${s.length}`);
    }
}

function assertTagName(s: string): void {
    if (typeof s !== "string") throw new Error("Tag name must be a string");
    const trimmed = s.trim();
    if (trimmed.length === 0) throw new Error("Tag name cannot be empty");
    if (trimmed.length > MAX_TAG_LENGTH) throw new Error(`Tag name exceeds ${MAX_TAG_LENGTH} chars: ${trimmed.length}`);
    if (!TAG_NAME_PATTERN.test(trimmed)) {
        throw new Error(`Tag name contains invalid characters (allowed: A-Z a-z 0-9 _ - . space): "${trimmed}"`);
    }
}

function assertTagSetSize(n: number): void {
    if (n > MAX_TAGS_PER_STEP) throw new Error(`Tag set exceeds ${MAX_TAGS_PER_STEP} entries; got ${n}`);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — meta patch                                         */
/* ------------------------------------------------------------------ */

export function updateStepMetaRow(
    db: SqlJsDatabase,
    stepId: number,
    patch: StepMetaPatch,
): PersistedStep {
    if (patch.Label !== undefined) assertLabel(patch.Label);
    if (patch.Description !== undefined) assertDescription(patch.Description ?? null);
    if (patch.RetryCount !== undefined) assertRetry(patch.RetryCount);
    if (patch.TimeoutMs !== undefined) assertTimeout(patch.TimeoutMs);
    if (patch.IsDisabled !== undefined && typeof patch.IsDisabled !== "boolean") {
        throw new Error(`IsDisabled must be a boolean; got ${typeof patch.IsDisabled}`);
    }

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    pushIfDefined(patch.Label, "Label", sets, params);
    pushIfDefined(patch.Description ?? undefined, "Description", sets, params);
    pushIfDefinedBool(patch.IsDisabled, "IsDisabled", sets, params);
    pushIfDefined(patch.RetryCount, "RetryCount", sets, params);
    pushIfDefined(patch.TimeoutMs ?? undefined, "TimeoutMs", sets, params);

    if (sets.length === 0) return readStepRow(db, stepId);
    sets.push("UpdatedAt = datetime('now')");
    params.push(stepId);
    db.run(`UPDATE Step SET ${sets.join(", ")} WHERE StepId = ?`, params);
    return readStepRow(db, stepId);
}

function pushIfDefined(
    value: string | number | null | undefined,
    column: string,
    sets: string[],
    params: Array<string | number | null>,
): void {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    params.push(value);
}

function pushIfDefinedBool(
    value: boolean | undefined,
    column: string,
    sets: string[],
    params: Array<string | number | null>,
): void {
    if (value === undefined) return;
    sets.push(`${column} = ?`);
    params.push(value ? 1 : 0);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — tags                                               */
/* ------------------------------------------------------------------ */

export function setStepTagsRow(
    db: SqlJsDatabase,
    stepId: number,
    names: ReadonlyArray<string>,
): ReadonlyArray<string> {
    const unique = dedupeTags(names);
    assertTagSetSize(unique.length);
    db.run("DELETE FROM StepTag WHERE StepId = ?", [stepId]);
    for (const name of unique) {
        db.run("INSERT INTO StepTag (StepId, Name) VALUES (?, ?)", [stepId, name]);
    }
    return listStepTagsRow(db, stepId);
}

function dedupeTags(names: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of names) {
        assertTagName(raw);
        const trimmed = raw.trim();
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

export function listStepTagsRow(
    db: SqlJsDatabase,
    stepId: number,
): ReadonlyArray<string> {
    const result = db.exec(
        "SELECT Name FROM StepTag WHERE StepId = ? ORDER BY Name ASC",
        [stepId],
    );
    const values = result[0]?.values ?? [];
    return values.map((row) => row[0] as string);
}

/* ------------------------------------------------------------------ */
/*  Pure DB-layer — cross-project links                                */
/* ------------------------------------------------------------------ */

export function setStepLinkRow(
    db: SqlJsDatabase,
    stepId: number,
    slot: StepLinkSlot,
    projectSlug: string | null,
): PersistedStep {
    const value = normaliseProjectSlug(projectSlug);
    db.run(
        `UPDATE Step SET ${slot} = ?, UpdatedAt = datetime('now') WHERE StepId = ?`,
        [value, stepId],
    );
    return readStepRow(db, stepId);
}

function normaliseProjectSlug(raw: string | null): string | null {
    if (raw === null) return null;
    if (typeof raw !== "string") throw new Error("Project slug must be a string or null");
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > MAX_SLUG_LENGTH) {
        throw new Error(`Project slug exceeds ${MAX_SLUG_LENGTH} chars: ${trimmed.length}`);
    }
    if (!PROJECT_SLUG_PATTERN.test(trimmed)) {
        throw new Error(`Project slug contains invalid characters (allowed: A-Z a-z 0-9 _ - .): "${trimmed}"`);
    }
    return trimmed;
}

/* ------------------------------------------------------------------ */
/*  Async facade — production wrappers                                 */
/* ------------------------------------------------------------------ */

export async function updateStepMeta(
    projectSlug: string,
    stepId: number,
    patch: StepMetaPatch,
): Promise<PersistedStep> {
    const mgr = await initProjectDb(projectSlug);
    const step = updateStepMetaRow(mgr.getDb(), stepId, patch);
    mgr.markDirty();
    return step;
}

export async function setStepTags(
    projectSlug: string,
    stepId: number,
    names: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
    const mgr = await initProjectDb(projectSlug);
    const tags = setStepTagsRow(mgr.getDb(), stepId, names);
    mgr.markDirty();
    return tags;
}

export async function listStepTags(
    projectSlug: string,
    stepId: number,
): Promise<ReadonlyArray<string>> {
    const mgr = await initProjectDb(projectSlug);
    return listStepTagsRow(mgr.getDb(), stepId);
}

export async function setStepLink(
    projectSlug: string,
    stepId: number,
    slot: StepLinkSlot,
    targetProjectSlug: string | null,
): Promise<PersistedStep> {
    const mgr = await initProjectDb(projectSlug);
    const step = setStepLinkRow(mgr.getDb(), stepId, slot, targetProjectSlug);
    mgr.markDirty();
    return step;
}
