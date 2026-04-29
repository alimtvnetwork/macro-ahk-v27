/**
 * Marco Extension — Boot Diagnostics
 *
 * Tracks the latest boot step, persistence mode, per-step timing metrics,
 * structured error context (SQL/migration details), the WASM HEAD probe
 * snapshot, and the WASM checksum verification outcome — all surfaced in
 * the popup BootFailureBanner support report.
 */

import type { WasmChecksumOutcome } from "./wasm-integrity";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BootTiming {
    step: string;
    durationMs: number;
}

/**
 * Structured context describing the *exact* operation that triggered the
 * boot failure. Populated by `setBootError()` when the underlying Error
 * carries one of the recognised tagged prefixes (parsed by
 * parseBootErrorContext below).
 *
 * Surfaced in `GET_STATUS.bootErrorContext` and rendered as a dedicated
 * "Failing operation" copyable code block in BootFailureBanner.
 */
export interface BootErrorContext {
    /** SQL statement (verbatim) that threw, when applicable. */
    sql: string | null;
    /** Schema migration version (e.g. `8`) when the failure was inside a migration. */
    migrationVersion: number | null;
    /** Human-readable migration step description. */
    migrationDescription: string | null;
    /** Free-form scope label, e.g. "schema-init:logs" or "migration-up". */
    scope: string | null;
}

/**
 * Per-attempt trace recorded by the bounded HEAD-probe loop in
 * `verifyWasmPresence()`. Always populated (success AND failure) so cold-start
 * timing issues — e.g. attempt #1 throws "Failed to fetch" then attempt #2
 * returns 200 — are visible in the popup support report and the SW console
 * without needing to repro live.
 *
 * @since v2.190.0
 */
export interface WasmProbeAttempt {
    /** 1-based attempt index. */
    attempt: number;
    /** ISO timestamp when this attempt started. */
    at: string;
    /** Milliseconds since the parent probe started (attempt #1 ≈ 0). */
    atOffsetMs: number;
    /** Wall-clock duration of this attempt's HEAD request, in ms. */
    durationMs: number;
    /** HTTP status returned, or null if the fetch itself threw. */
    status: number | null;
    /** `Content-Length` header (raw string), or null when not reported. */
    contentLength: string | null;
    /** Error thrown by `fetch(..., { method: "HEAD" })`, or null on success. */
    error: string | null;
}

/**
 * Result of the upfront HEAD probe against the bundled WASM asset
 * (`chrome-extension/wasm/sql-wasm.wasm`). Captured by `verifyWasmPresence()`
 * regardless of outcome — when boot fails, this snapshot is persisted into
 * `marco_last_boot_failure.wasmProbe` and rendered in BootFailureBanner so
 * users can see *why* the file was rejected (404 vs 0-byte vs network error)
 * without needing the SW console.
 */
export interface WasmProbeResult {
    /** The packaged extension URL probed (chrome-extension://…/wasm/sql-wasm.wasm). */
    url: string;
    /** HTTP status returned by the HEAD request, or null if HEAD itself threw. */
    status: number | null;
    /** `Content-Length` header value (raw string), or null when not present. */
    contentLength: string | null;
    /** Error message thrown by `fetch(..., { method: "HEAD" })` itself, or null on success. */
    headError: string | null;
    /** True when the probe completed with status 2xx and non-zero Content-Length. */
    ok: boolean;
    /** ISO timestamp of when the probe ran (start of attempt #1). */
    at: string;
    /** Per-attempt trace (always present, even on first-try success). @since v2.190.0 */
    attempts: WasmProbeAttempt[];
    /** Total wall-clock duration of the probe across all attempts, in ms. @since v2.190.0 */
    totalDurationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let bootStep = "pre-init";
let bootPersistenceMode: "opfs" | "storage" | "memory" = "memory";
const bootTimings: BootTiming[] = [];
let stepStartTime = performance.now();
let totalBootMs = 0;
let bootErrorMessage: string | null = null;
let bootErrorStack: string | null = null;
let bootErrorContext: BootErrorContext | null = null;
let wasmProbeResult: WasmProbeResult | null = null;
let wasmChecksumOutcome: WasmChecksumOutcome | null = null;

/* ------------------------------------------------------------------ */
/*  Boot Step                                                          */
/* ------------------------------------------------------------------ */

/** Returns the latest boot step label. */
export function getBootStep(): string {
    return bootStep;
}

/** Updates the current boot step and records timing for the previous step. */
export function setBootStep(step: string): void {
    const now = performance.now();
    const isFirstStep = bootStep === "pre-init" && step === "pre-init";

    if (!isFirstStep) {
        const durationMs = Math.round(now - stepStartTime);
        bootTimings.push({ step: bootStep, durationMs });
    }

    bootStep = step;
    stepStartTime = now;
}

/** Marks boot as complete and records the final step timing. */
export function finalizeBoot(): void {
    const now = performance.now();
    const durationMs = Math.round(now - stepStartTime);
    bootTimings.push({ step: bootStep, durationMs });
    totalBootMs = bootTimings.reduce((sum, t) => sum + t.durationMs, 0);
}

/* ------------------------------------------------------------------ */
/*  Persistence Mode                                                   */
/* ------------------------------------------------------------------ */

/** Returns the persistence mode resolved during boot. */
export function getBootPersistenceMode(): "opfs" | "storage" | "memory" {
    return bootPersistenceMode;
}

/** Updates the persistence mode resolved during boot. */
export function setBootPersistenceMode(mode: "opfs" | "storage" | "memory"): void {
    bootPersistenceMode = mode;
}

/* ------------------------------------------------------------------ */
/*  Timings                                                            */
/* ------------------------------------------------------------------ */

/** Returns a copy of all recorded boot timings. */
export function getBootTimings(): BootTiming[] {
    return [...bootTimings];
}

/** Returns total boot duration in milliseconds. */
export function getTotalBootMs(): number {
    return totalBootMs;
}

/* ------------------------------------------------------------------ */
/*  Boot Error                                                         */
/* ------------------------------------------------------------------ */

/**
 * Records the underlying error that caused boot to fail.
 *
 * Also extracts structured context from tagged prefixes embedded in the
 * error message (set by schema-migration / db-manager wrapper helpers):
 *
 *   [MIGRATION_FAILURE v=8 step="Add AssetVersion table"] CREATE TABLE …
 *   [SCHEMA_INIT_FAILURE scope="logs:opfs"] CREATE INDEX …
 *
 * The leading SQL (or full message after the tag) is captured into
 * `bootErrorContext.sql` so the popup banner can render it as a dedicated
 * copyable code block.
 */
export function setBootError(error: unknown): void {
    if (error instanceof Error) {
        bootErrorMessage = error.message;
        bootErrorStack = error.stack ?? null;
    } else {
        bootErrorMessage = String(error);
        bootErrorStack = null;
    }
    bootErrorContext = parseBootErrorContext(bootErrorMessage);
}

/** Returns the human-readable boot error message, or null if boot succeeded. */
export function getBootErrorMessage(): string | null {
    return bootErrorMessage;
}

/** Returns the boot error stack trace, or null if unavailable. */
export function getBootErrorStack(): string | null {
    return bootErrorStack;
}

/** Returns structured context (sql/migration step) for the boot error, if any. */
export function getBootErrorContext(): BootErrorContext | null {
    return bootErrorContext;
}

/* ------------------------------------------------------------------ */
/*  WASM Probe Result                                                  */
/* ------------------------------------------------------------------ */

/**
 * Records the outcome of the upfront HEAD probe against the packaged WASM
 * asset. Always called by `verifyWasmPresence()` — on success AND failure —
 * so the popup can render the captured details (status code, content-length,
 * head error) in the BootFailureBanner's expanded WASM diagnostics block.
 */
export function setWasmProbeResult(result: WasmProbeResult): void {
    wasmProbeResult = result;
}

/** Returns the captured WASM HEAD probe result, or null if the probe never ran. */
export function getWasmProbeResult(): WasmProbeResult | null {
    return wasmProbeResult;
}

/* ------------------------------------------------------------------ */
/*  WASM Checksum Outcome                                              */
/* ------------------------------------------------------------------ */

/**
 * Records the result of `verifyWasmChecksum()` against the bundled
 * sql-wasm.wasm.checksum.json sidecar. Captured on every boot attempt
 * (success and failure) so the BootFailureBanner can show whether the
 * WASM was actually corrupted (mismatch) vs intact-but-CSP-blocked
 * (match) vs an old build with no sidecar (manifest-missing).
 */
export function setWasmChecksumOutcome(outcome: WasmChecksumOutcome): void {
    wasmChecksumOutcome = outcome;
}

/** Returns the captured WASM checksum outcome, or null if it was never computed. */
export function getWasmChecksumOutcome(): WasmChecksumOutcome | null {
    return wasmChecksumOutcome;
}

/* ------------------------------------------------------------------ */
/*  Tagged-error parsing                                               */
/* ------------------------------------------------------------------ */

const MIGRATION_TAG_RE = /^\[MIGRATION_FAILURE\s+v=(\d+)\s+step="([^"]*)"\]\s*([\s\S]*)$/;
const SCHEMA_INIT_TAG_RE = /^\[SCHEMA_INIT_FAILURE\s+scope="([^"]*)"\]\s*([\s\S]*)$/;
const SQL_LINE_RE = /\bSQL:\s*([\s\S]+?)(?:\n\s*Reason:|\n\s*$|$)/;

/**
 * Extracts structured context from a tagged error message. Returns `null`
 * when no recognised tag is present so the banner falls back to the
 * generic stack-trace presentation.
 */
function parseBootErrorContext(message: string | null): BootErrorContext | null {
    if (message === null || message.length === 0) {
        return null;
    }

    const migrationMatch = MIGRATION_TAG_RE.exec(message);
    if (migrationMatch !== null) {
        return {
            sql: extractSql(migrationMatch[3]),
            migrationVersion: Number(migrationMatch[1]),
            migrationDescription: migrationMatch[2],
            scope: "migration-up",
        };
    }

    const schemaMatch = SCHEMA_INIT_TAG_RE.exec(message);
    if (schemaMatch !== null) {
        return {
            sql: extractSql(schemaMatch[2]),
            migrationVersion: null,
            migrationDescription: null,
            scope: schemaMatch[1],
        };
    }

    return null;
}

/**
 * Pulls a `SQL: …` block out of a tagged error body. Falls back to the
 * trimmed body when no explicit `SQL:` marker is present.
 */
function extractSql(body: string): string | null {
    const sqlMatch = SQL_LINE_RE.exec(body);
    if (sqlMatch !== null) {
        return sqlMatch[1].trim();
    }
    const trimmed = body.trim();
    return trimmed.length > 0 ? trimmed : null;
}
