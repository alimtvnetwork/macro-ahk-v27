/**
 * Marco Extension — Database Manager
 *
 * OPFS-first SQLite persistence with chrome.storage.local fallback
 * and in-memory last resort.
 *
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — Persistence strategy
 * @see .lovable/memory/architecture/storage/sqlite-implementation.md — SQLite architecture
 * @see .lovable/memory/architecture/storage/db-manager-binding.md — Handler binding pattern
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "./sqljs-loader";
import { migrateSchema } from "./schema-migration";
import { FULL_LOGS_SCHEMA, FULL_ERRORS_SCHEMA } from "./db-schemas";
import {
    flushToStorage,
    loadFromStorage,
    loadOrCreateFromOpfs,
    saveToOpfs,
} from "./db-persistence";
import { wrapDatabaseWithBindSafety } from "./sqlite-bind-safety";
import { setWasmProbeResult, setWasmChecksumOutcome, type WasmProbeResult } from "./boot-diagnostics";
import { verifyWasmChecksum, summarizeChecksumOutcome } from "./wasm-integrity";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SqlJs = import("sql.js").SqlJsStatic;
type PersistenceMode = "opfs" | "storage" | "memory";

export interface DbManager {
    getLogsDb(): SqlJsDatabase;
    getErrorsDb(): SqlJsDatabase;
    getPersistenceMode(): PersistenceMode;
    flushIfDirty(): Promise<void>;
    markDirty(): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DB_NAMES = {
    logs: "marco-logs.db",
    errors: "marco-errors.db",
} as const;

const STORAGE_KEYS = {
    logs: "sqlite_logs_db",
    errors: "sqlite_errors_db",
} as const;

const FLUSH_DEBOUNCE_MS = 5000;

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let SQL: SqlJs | null = null;
let logsDb: SqlJsDatabase | null = null;
let errorsDb: SqlJsDatabase | null = null;
let persistenceMode: PersistenceMode = "memory";
let isDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/**
 * Performs a fast presence check on the bundled WASM asset before attempting
 * to fetch+initialize it. A HEAD request returns the file size in
 * `Content-Length` (when present) without downloading the body, letting us
 * surface a dedicated, unambiguous "WASM file missing" error path that the
 * popup banner classifies as `kind: "wasm-missing"`.
 *
 * Distinct from the in-flight errors in `loadSqlJs()` because:
 *   - The HEAD result is checked BEFORE we try to use the binary, so we can
 *     fail fast with a clearly-worded message that names the exact missing
 *     packaged path (`chrome-extension/wasm/sql-wasm.wasm`).
 *   - The error tag `WASM_FILE_MISSING_404` is detected verbatim by
 *     `classifyCause()` in BootFailureBanner.tsx, which selects the
 *     dedicated "WASM file missing" fix steps.
 */
const HEAD_PROBE_ATTEMPTS = 3;
const HEAD_PROBE_DELAY_MS = 200;

/**
 * Runs one HEAD attempt, records a structured trace into `probe.attempts`,
 * emits a `[wasm-probe]` debug line, and returns the Response (or null on
 * fetch error). Caller decides whether to retry or fail.
 */
async function runWasmHeadAttempt(
    wasmUrl: string,
    probe: WasmProbeResult,
    probeStartedAt: number,
    attempt: number,
): Promise<Response | null> {
    const attemptStart = performance.now();
    const attemptAtIso = new Date().toISOString();
    let response: Response | null = null;
    let attemptStatus: number | null = null;
    let attemptContentLength: string | null = null;
    let attemptError: string | null = null;
    try {
        response = await fetch(wasmUrl, { method: "HEAD" });
        attemptStatus = response.status;
        attemptContentLength = response.headers.get("content-length");
        probe.status = attemptStatus;
        probe.contentLength = attemptContentLength;
    } catch (err) {
        attemptError = err instanceof Error ? err.message : String(err);
    }
    const durationMs = Math.round(performance.now() - attemptStart);
    const atOffsetMs = Math.round(attemptStart - probeStartedAt);
    probe.attempts.push({
        attempt,
        at: attemptAtIso,
        atOffsetMs,
        durationMs,
        status: attemptStatus,
        contentLength: attemptContentLength,
        error: attemptError,
    });
    // Structured per-attempt log line — `[wasm-probe]` prefix lets you
    // grep boot timing across SW restarts (Service Worker DevTools console).
    console.debug(
        `[wasm-probe] attempt=${attempt}/${HEAD_PROBE_ATTEMPTS} url=${wasmUrl} ` +
        `status=${attemptStatus ?? "n/a"} contentLength=${attemptContentLength ?? "n/a"} ` +
        `durationMs=${durationMs} atOffsetMs=${atOffsetMs}` +
        (attemptError !== null ? ` error="${attemptError}"` : ""),
    );
    return response;
}

/**
 * Validates a successful HEAD response. Throws a tagged
 * `[WASM_FILE_MISSING_404]` error for 404, non-2xx, or empty file.
 */
function validateWasmHeadResponse(wasmUrl: string, response: Response, probe: WasmProbeResult): void {
    if (response.status === 404) {
        setWasmProbeResult(probe);
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} returned 404. ` +
            `The packaged extension is missing "wasm/sql-wasm.wasm" — rebuild with ` +
            `".\\run.ps1 -d" so viteStaticCopy regenerates it from node_modules/sql.js/dist/, ` +
            `then reload the extension from chrome://extensions.`,
        );
    }
    if (!response.ok) {
        setWasmProbeResult(probe);
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} returned HTTP ${response.status}. ` +
            `Confirm "wasm/sql-wasm.wasm" is listed in manifest.web_accessible_resources and ` +
            `present at chrome-extension/wasm/sql-wasm.wasm.`,
        );
    }
    if (probe.contentLength !== null && Number(probe.contentLength) === 0) {
        setWasmProbeResult(probe);
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} reports Content-Length: 0. ` +
            `The packaged WASM file exists but is empty — rebuild the extension to regenerate it.`,
        );
    }
}

function throwAllAttemptsFailed(wasmUrl: string, probe: WasmProbeResult): never {
    const lastError = probe.attempts[probe.attempts.length - 1]?.error ?? null;
    probe.headError = lastError;
    setWasmProbeResult(probe);
    throw new Error(
        `[WASM_FILE_MISSING_404] HEAD request failed for "${wasmUrl}" after ` +
        `${HEAD_PROBE_ATTEMPTS} attempts (~${HEAD_PROBE_ATTEMPTS * HEAD_PROBE_DELAY_MS}ms). ` +
        `The file "wasm/sql-wasm.wasm" appears to be missing from the packaged ` +
        `chrome-extension/ output OR is not listed in manifest.web_accessible_resources. ` +
        `Original error: ${lastError}`,
    );
}

async function verifyWasmPresence(wasmUrl: string): Promise<void> {
    const probeStartedAt = performance.now();
    const probe: WasmProbeResult = {
        url: wasmUrl,
        status: null,
        contentLength: null,
        headError: null,
        ok: false,
        at: new Date().toISOString(),
        attempts: [],
        totalDurationMs: 0,
    };
    // Bounded sequential re-probe ONLY for transient `fetch threw` failures
    // ("Failed to fetch") during service-worker cold start. NOT a recursive
    // retry — fixed 3-attempt budget (~600ms) per the no-retry policy.
    let headResponse: Response | null = null;
    for (let attempt = 1; attempt <= HEAD_PROBE_ATTEMPTS; attempt += 1) {
        headResponse = await runWasmHeadAttempt(wasmUrl, probe, probeStartedAt, attempt);
        if (headResponse !== null) { break; }
        if (attempt < HEAD_PROBE_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, HEAD_PROBE_DELAY_MS));
        }
    }
    probe.totalDurationMs = Math.round(performance.now() - probeStartedAt);
    if (headResponse === null) { throwAllAttemptsFailed(wasmUrl, probe); }
    validateWasmHeadResponse(wasmUrl, headResponse, probe);
    probe.ok = true;
    setWasmProbeResult(probe);
    // Final summary line — useful when triaging "boot took N seconds" reports.
    console.debug(
        `[wasm-probe] OK url=${wasmUrl} status=${probe.status} ` +
        `contentLength=${probe.contentLength ?? "n/a"} attempts=${probe.attempts.length} ` +
        `totalDurationMs=${probe.totalDurationMs}`,
    );
}

/** Loads sql.js WASM binary from the extension bundle. */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- WASM loader: locate-file shim + integrity verify + cache + fallback all need shared closure
async function loadSqlJs(): Promise<SqlJs> {
    // Service workers have no `document`, so sql.js's default locateFile
    // (which uses document.currentScript) throws ReferenceError.
    // We fetch the WASM binary ourselves and pass it directly.
    const wasmUrl = chrome.runtime.getURL("wasm/sql-wasm.wasm");

    // Fast upfront presence check — produces a distinctive
    // "[WASM_FILE_MISSING_404]" tagged error that the popup banner
    // classifies as `kind: "wasm-missing"` with dedicated fix steps.
    await verifyWasmPresence(wasmUrl);

    let wasmResponse: Response;
    try {
        wasmResponse = await fetch(wasmUrl);
    } catch (err) {
        throw new Error(
            `Failed to fetch WASM binary at "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" exists in the chrome-extension/ build output ` +
            `(viteStaticCopy target in vite.config.extension.ts copies it from node_modules/sql.js/dist). ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (!wasmResponse.ok) {
        throw new Error(
            `WASM fetch returned HTTP ${wasmResponse.status} for "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" is listed in manifest.web_accessible_resources ` +
            `and the file was copied to chrome-extension/wasm/ during the build.`,
        );
    }

    let wasmBinary: ArrayBuffer;
    try {
        wasmBinary = await wasmResponse.arrayBuffer();
    } catch (err) {
        throw new Error(
            `Failed to read WASM binary as ArrayBuffer from "${wasmUrl}". ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (wasmBinary.byteLength === 0) {
        throw new Error(
            `WASM binary at "${wasmUrl}" is empty (0 bytes). ` +
            `The file exists but has no content — rebuild the extension to regenerate it.`,
        );
    }

    // ──────────────────────────────────────────────────────────────
    // Integrity verification — compute SHA-256 of the live bytes and
    // compare against the build-time sidecar
    // (chrome-extension/wasm/sql-wasm.wasm.checksum.json). The outcome
    // is ALWAYS persisted into boot diagnostics so the BootFailureBanner
    // support report shows whether the WASM was actually corrupted vs
    // intact-but-blocked-by-CSP. See src/background/wasm-integrity.ts.
    // ──────────────────────────────────────────────────────────────
    const checksumOutcome = await verifyWasmChecksum(wasmBinary);
    setWasmChecksumOutcome(checksumOutcome);

    if (checksumOutcome.status === "mismatch") {
        // DEFINITIVE corruption diagnosis — the bundled file does not match
        // the build-time hash, so the bytes themselves are wrong. No need to
        // hedge with "this usually means" any more.
        throw new Error(
            `[WASM_CHECKSUM_MISMATCH] sql.js WASM binary at "${wasmUrl}" is corrupted ` +
            `or stale. ` +
            `Expected SHA-256=${checksumOutcome.expectedHash} (${checksumOutcome.expectedByteLength} bytes, ` +
            `built against sql.js@${checksumOutcome.sqlJsVersion} on ${checksumOutcome.generatedAt}). ` +
            `Got SHA-256=${checksumOutcome.actualHash} (${checksumOutcome.actualByteLength} bytes). ` +
            `Delete chrome-extension/wasm/sql-wasm.wasm and rerun \`pnpm run build:extension\` ` +
            `(verify-wasm-asset will recopy from node_modules/sql.js/dist/), then reload the extension.`,
        );
    }

    if (checksumOutcome.status === "compute-failed") {
        console.warn(
            `[db-manager] WASM checksum compute step failed (${summarizeChecksumOutcome(checksumOutcome)}); ` +
            `proceeding with initSqlJs — corruption diagnosis will be unavailable for this boot.`,
        );
    } else if (checksumOutcome.status === "manifest-missing" || checksumOutcome.status === "manifest-malformed") {
        console.warn(
            `[db-manager] WASM checksum sidecar unavailable (${summarizeChecksumOutcome(checksumOutcome)}); ` +
            `extension may have been built before v2.187.0 — corruption vs CSP cannot be distinguished automatically.`,
        );
    } else {
        console.log(`[db-manager] WASM checksum ${summarizeChecksumOutcome(checksumOutcome)}`);
    }

    try {
        return await initSqlJs({ wasmBinary });
    } catch (err) {
        // Compose a precise post-mortem based on whether the integrity check
        // ruled out corruption.
        const originalMessage = err instanceof Error ? err.message : String(err);
        const isCspError = /Content Security Policy|wasm-eval|wasm-unsafe-eval/i.test(originalMessage);

        if (checksumOutcome.status === "match") {
            // WASM is provably intact, so the failure cannot be corruption.
            // Most common cause in MV3: missing 'wasm-unsafe-eval' in CSP.
            const cspHint = isCspError
                ? `The error message names a CSP violation directly — add 'wasm-unsafe-eval' to manifest.json content_security_policy.extension_pages script-src and reload the extension. See readme.md "MV3 CSP & sql.js" for the canonical fix and \`pnpm run check:built-csp\` to verify.`
                : `The WASM binary itself is intact (sha256 verified against the build-time manifest). Most likely causes are: (1) missing 'wasm-unsafe-eval' in manifest.json CSP — run \`pnpm run check:built-csp\`; (2) sql.js JS shim version skew vs the bundled WASM (rerun \`pnpm install\` then rebuild); (3) browser OOM or service-worker resource limits.`;

            throw new Error(
                `[WASM_INSTANTIATE_FAILED_CHECKSUM_OK] sql.js initSqlJs() failed AFTER the ${wasmBinary.byteLength}-byte WASM passed integrity check ` +
                `(SHA-256=${checksumOutcome.hash}, sql.js@${checksumOutcome.sqlJsVersion}). ` +
                `The binary is NOT corrupted. ${cspHint} ` +
                `Original error: ${originalMessage}`,
            );
        }

        // Sidecar missing/malformed/compute-failed — keep the historical
        // ambiguous wording but mark it clearly so the popup classifier can
        // tell the support report writer that integrity could not be proven.
        throw new Error(
            `[WASM_INSTANTIATE_FAILED_INTEGRITY_UNKNOWN] sql.js initSqlJs() factory failed after ${wasmBinary.byteLength}-byte WASM was fetched successfully, ` +
            `but the integrity sidecar was unavailable (${checksumOutcome.status}) so we cannot distinguish corruption from a CSP/shim issue. ` +
            `Run \`pnpm run build:extension\` to regenerate wasm/sql-wasm.wasm.checksum.json, ` +
            `then reload the extension and reproduce. ` +
            `Original error: ${originalMessage}`,
        );
    }
}

/** Attempts to load or create a DB from OPFS. */
async function tryOpfsInit(): Promise<boolean> {
    try {
        const root = await navigator.storage.getDirectory();

        logsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.errors, FULL_ERRORS_SCHEMA);
        persistenceMode = "opfs";

        console.log("[db-manager] OPFS persistence active");
        return true;
    } catch (err) {
        console.error(`[db-manager] OPFS unavailable\n  Path: navigator.storage.getDirectory() → OPFS root\n  Missing: SQLite database files (logs + errors)\n  Reason: ${err instanceof Error ? err.message : String(err)} — OPFS may not be supported or quota exceeded`, err);
        return false;
    }
}

/** Attempts to load or create a DB from chrome.storage.local. */
async function tryStorageInit(): Promise<boolean> {
    try {
        logsDb = await loadFromStorage(SQL!, STORAGE_KEYS.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadFromStorage(SQL!, STORAGE_KEYS.errors, FULL_ERRORS_SCHEMA);
        persistenceMode = "storage";

        console.log("[db-manager] storage.local persistence active");
        return true;
    } catch (err) {
        console.error(`[db-manager] storage.local persistence failed\n  Path: chrome.storage.local → SQLite serialized blobs\n  Missing: Deserialized SQLite database instances\n  Reason: ${err instanceof Error ? err.message : String(err)}`, err);
        return false;
    }
}

/**
 * Runs a multi-statement schema bootstrap, splitting on `;` so a single
 * failing statement can be reported (instead of the opaque whole-blob
 * error sql.js gives back from `db.run(FULL_LOGS_SCHEMA)`).
 *
 * Throws a tagged `[SCHEMA_INIT_FAILURE scope="<scope>"] … SQL: …` error
 * so `setBootError()` can extract the failing statement text into
 * `bootErrorContext.sql` for the popup banner.
 */
function runSchemaWithIsolation(
    db: SqlJsDatabase,
    schema: string,
    scope: string,
): void {
    const statements = schema
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    for (const stmt of statements) {
        try {
            db.run(stmt + ";");
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
                `[SCHEMA_INIT_FAILURE scope="${scope}"] SQL: ${stmt};\n  Reason: ${reason}`,
            );
        }
    }
}

/** Creates in-memory databases as a last resort. */
function initInMemory(): void {
    logsDb = new SQL!.Database();
    runSchemaWithIsolation(logsDb, FULL_LOGS_SCHEMA, "logs:memory");

    errorsDb = new SQL!.Database();
    runSchemaWithIsolation(errorsDb, FULL_ERRORS_SCHEMA, "errors:memory");
    persistenceMode = "memory";

    console.log("[db-manager] In-memory only (no persistence)");
}

/** Initializes databases with OPFS → storage → memory fallback. */
export async function initDatabases(): Promise<DbManager> {
    if (isInitialized) {
        return buildManager();
    }

    SQL = await loadSqlJs();
    await initWithFallback();
    await migrateSchema(logsDb!, errorsDb!);

    isInitialized = true;
    return buildManager();
}

/** Tries OPFS, then storage, then in-memory. */
async function initWithFallback(): Promise<void> {
    const isOpfsReady = await tryOpfsInit();

    if (isOpfsReady) {
        return;
    }

    const isStorageReady = await tryStorageInit();
    const isFallbackNeeded = isStorageReady === false;

    if (isFallbackNeeded) {
        initInMemory();
    }
}

/* ------------------------------------------------------------------ */
/*  Flush Logic                                                        */
/* ------------------------------------------------------------------ */

/** Marks databases as needing a flush, debounced. */
function markDirty(): void {
    isDirty = true;
    const hasExistingTimer = flushTimer !== null;

    if (hasExistingTimer) {
        clearTimeout(flushTimer!);
    }
    flushTimer = setTimeout(() => void flushIfDirty(), FLUSH_DEBOUNCE_MS);
}

/** Flushes databases to persistent storage if dirty. */
async function flushIfDirty(): Promise<void> {
    const isClean = isDirty === false;

    if (isClean) {
        return;
    }
    isDirty = false;

    await flushByMode();
}

/** Dispatches flush to the correct persistence backend. */
async function flushByMode(): Promise<void> {
    const isOpfs = persistenceMode === "opfs";

    if (isOpfs) {
        return flushToOpfs();
    }

    const isStorage = persistenceMode === "storage";

    if (isStorage) {
        await flushToStorage({
            logsDb: logsDb!,
            errorsDb: errorsDb!,
            logsKey: STORAGE_KEYS.logs,
            errorsKey: STORAGE_KEYS.errors,
        });
    }
}

/** Flushes both databases to OPFS. */
async function flushToOpfs(): Promise<void> {
    const root = await navigator.storage.getDirectory();

    await saveToOpfs(root, DB_NAMES.logs, logsDb!);
    await saveToOpfs(root, DB_NAMES.errors, errorsDb!);
}

/* ------------------------------------------------------------------ */
/*  Public Manager                                                     */
/* ------------------------------------------------------------------ */

/** Builds the public DbManager interface. */
function buildManager(): DbManager {
    // Wrap the live DB handles so every handler call routes through
    // assertBindable() before reaching sql.js. Wrapping happens at the
    // accessor boundary so direct internal references (flush, export)
    // continue to operate on the raw instance.
    const wrappedLogs = wrapDatabaseWithBindSafety(logsDb!);
    const wrappedErrors = wrapDatabaseWithBindSafety(errorsDb!);
    return {
        getLogsDb: () => wrappedLogs,
        getErrorsDb: () => wrappedErrors,
        getPersistenceMode: () => persistenceMode,
        flushIfDirty,
        markDirty,
    };
}
