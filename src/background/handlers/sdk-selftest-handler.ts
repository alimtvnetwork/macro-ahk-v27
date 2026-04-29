/**
 * Marco Extension — SDK Self-Test Result Handler
 *
 * Persists the latest run of `runSdkSelfTest()` (and its three async round-trips
 * — KV, FILES, GKV) so the popup can render a ✅/❌ panel with the last-run
 * timestamp on every open.
 *
 * Storage layout — `chrome.storage.local["marco_sdk_selftest"]`:
 *   {
 *     sync:  { surface, pass, failures[], at, version } | null,
 *     kv:    { ... }                                   | null,
 *     files: { ... }                                   | null,
 *     gkv:   { ... }                                   | null,
 *     updatedAt: <ISO>,
 *   }
 *
 * Each surface row is overwritten on every report so the popup always reflects
 * the most recent boot of the SDK on any tab. We do NOT keep history — that is
 * what the SQLite logs/errors DBs already do via `NamespaceLogger`.
 *
 * @see standalone-scripts/marco-sdk/src/self-test.ts — the producer
 * @see src/components/popup/SdkSelfTestPanel.tsx       — the consumer
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "marco_sdk_selftest";

const VALID_SURFACES = ["sync", "kv", "files", "gkv"] as const;
type Surface = (typeof VALID_SURFACES)[number];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SdkSelfTestRow {
    surface: Surface;
    pass: boolean;
    failures: string[];
    at: string;
    version: string;
}

export interface SdkSelfTestSnapshot {
    sync: SdkSelfTestRow | null;
    kv: SdkSelfTestRow | null;
    files: SdkSelfTestRow | null;
    gkv: SdkSelfTestRow | null;
    updatedAt: string | null;
}

const EMPTY_SNAPSHOT: SdkSelfTestSnapshot = {
    sync: null,
    kv: null,
    files: null,
    gkv: null,
    updatedAt: null,
};

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

async function readSnapshot(): Promise<SdkSelfTestSnapshot> {
    try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        const raw = stored[STORAGE_KEY] as Partial<SdkSelfTestSnapshot> | undefined;
        if (!raw || typeof raw !== "object") {
            return { ...EMPTY_SNAPSHOT };
        }
        return {
            sync: normalizeRow(raw.sync),
            kv: normalizeRow(raw.kv),
            files: normalizeRow(raw.files),
            gkv: normalizeRow(raw.gkv),
            updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
        };
    } catch {
        return { ...EMPTY_SNAPSHOT };
    }
}

function normalizeRow(value: unknown): SdkSelfTestRow | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const r = value as Partial<SdkSelfTestRow>;
    if (typeof r.surface !== "string" || !VALID_SURFACES.includes(r.surface as Surface)) {
        return null;
    }
    return {
        surface: r.surface as Surface,
        pass: r.pass === true,
        failures: Array.isArray(r.failures)
            ? r.failures.filter((f) => typeof f === "string") as string[]
            : [],
        at: typeof r.at === "string" ? r.at : "",
        version: typeof r.version === "string" ? r.version : "",
    };
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

interface SdkSelfTestReportRequest {
    surface?: unknown;
    pass?: unknown;
    failures?: unknown;
    version?: unknown;
}

/**
 * SDK_SELFTEST_REPORT — accepts one row from the SDK self-test, writes it
 * into the snapshot, and returns `{ isOk: true }`.
 *
 * Invalid payloads (missing/unknown surface) are dropped silently with
 * `{ isOk: false, errorMessage }` so a future SDK refactor that adds a new
 * surface can't corrupt the popup's view of the existing four.
 */
export async function handleSdkSelfTestReport(
    msg: MessageRequest,
): Promise<OkResponse | { isOk: false; errorMessage: string }> {
    const raw = msg as MessageRequest & SdkSelfTestReportRequest;
    const surface = typeof raw.surface === "string" ? raw.surface : "";
    if (!VALID_SURFACES.includes(surface as Surface)) {
        return {
            isOk: false,
            errorMessage: `[sdk-selftest] unknown surface "${surface}" — expected one of ${VALID_SURFACES.join(", ")}`,
        };
    }

    const failures = Array.isArray(raw.failures)
        ? raw.failures.filter((f): f is string => typeof f === "string")
        : [];

    const row: SdkSelfTestRow = {
        surface: surface as Surface,
        pass: raw.pass === true,
        failures,
        at: new Date().toISOString(),
        version: typeof raw.version === "string" ? raw.version : "",
    };

    const snapshot = await readSnapshot();
    snapshot[surface as Surface] = row;
    snapshot.updatedAt = row.at;

    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
    } catch (err) {
        return {
            isOk: false,
            errorMessage: `[sdk-selftest] storage.set failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    return { isOk: true };
}

/**
 * GET_SDK_SELFTEST — popup query. Always returns the snapshot envelope
 * (rows may be null when no SDK page has reported yet).
 */
export async function handleGetSdkSelfTest(): Promise<{ snapshot: SdkSelfTestSnapshot }> {
    const snapshot = await readSnapshot();
    return { snapshot };
}

/* ------------------------------------------------------------------ */
/*  Test seam                                                          */
/* ------------------------------------------------------------------ */

/** Test-only — clears the persisted snapshot. Not wired to any message. */
export async function __resetSdkSelfTestForTests(): Promise<void> {
    try {
        await chrome.storage.local.remove(STORAGE_KEY);
    } catch {
        /* tests provide a stub; failure is benign */
    }
}
