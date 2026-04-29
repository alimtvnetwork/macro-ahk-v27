/**
 * Marco Extension — Verbose Logging Store
 *
 * Per-project boolean toggle that gates whether failure logs persist the
 * full untruncated outerHTML/textContent of the captured target element
 * and a top-level `CapturedHtml` payload.
 *
 * Conformance: `mem://standards/verbose-logging-and-failure-diagnostics`
 *   - **Setting**: `Project.VerboseLogging: boolean`
 *   - **Default**: `false`
 *   - **Read path**: every log site MUST resolve via this single helper —
 *     never sprinkle direct settings reads.
 *
 * Backing store: in-memory `Map<projectId, boolean>`. Callers (project
 * settings UI, persistence layer) own the chrome.storage round-trip and
 * call `setVerboseLogging` after rehydration. Pure & sync — fully
 * unit-testable in node without jsdom.
 */

const FALLBACK_PROJECT_ID = "<no-active-project>";
const store = new Map<string, boolean>();

/**
 * Read the current verbose flag for a project. Returns `false` for any
 * unknown project id and for the no-active-project case (per spec — never
 * default to verbose; the user must opt in).
 */
export function resolveVerboseLogging(projectId: string | null | undefined): boolean {
    const key = normalizeId(projectId);
    return store.get(key) === true;
}

/** Mutate the toggle for a project. Idempotent; safe to call repeatedly. */
export function setVerboseLogging(projectId: string | null | undefined, on: boolean): void {
    const key = normalizeId(projectId);
    if (on) {
        store.set(key, true);
    } else {
        store.delete(key);
    }
}

/** Test seam — clears the entire store. Production callers do not use this. */
export function _resetVerboseLoggingStore(): void {
    store.clear();
}

/** Snapshot of the current toggle map, for diagnostics export. */
export function snapshotVerboseLoggingStore(): ReadonlyArray<{ ProjectId: string; Verbose: boolean }> {
    const out: Array<{ ProjectId: string; Verbose: boolean }> = [];
    for (const [k, v] of store.entries()) {
        out.push({ ProjectId: k, Verbose: v });
    }
    return out;
}

function normalizeId(projectId: string | null | undefined): string {
    if (projectId === null || projectId === undefined || projectId.length === 0) {
        return FALLBACK_PROJECT_ID;
    }
    return projectId;
}
