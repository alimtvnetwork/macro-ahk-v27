/**
 * Marco Extension — WASM Integrity Verifier
 *
 * Runtime companion to scripts/compute-wasm-checksum.mjs.
 *
 * The build pipeline ships a sidecar file
 *   chrome-extension/wasm/sql-wasm.wasm.checksum.json
 * containing the SHA-256 + byte length of the bundled `sql-wasm.wasm`.
 * At boot we re-hash the live `wasmBinary` and compare. The result lets
 * the sql.js loader produce a precise diagnosis instead of the
 * misleading "WASM is corrupted" hint we shipped pre-v2.187.0:
 *
 *   - checksum mismatch  -> WASM IS actually corrupted/wrong-version
 *   - checksum match     -> WASM is fine, blame CSP / OOM / shim skew
 *   - sidecar missing    -> degrade gracefully (old build), keep the
 *                            ambiguous wording but log a console warning
 *
 * This file lives in the background SW bundle. It must remain free of
 * any DOM access — only `fetch`, `crypto.subtle`, and `chrome.runtime`.
 *
 * @see src/background/db-manager.ts loadSqlJs() — caller
 * @see scripts/compute-wasm-checksum.mjs       — sidecar writer
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Schema written by compute-wasm-checksum.mjs. Bumped on field changes. */
export const WASM_CHECKSUM_SCHEMA = "marco-wasm-checksum-v1" as const;

export interface WasmChecksumManifest {
    schema: typeof WASM_CHECKSUM_SCHEMA;
    algorithm: "SHA-256";
    hash: string;          // 64 lowercase hex chars
    byteLength: number;
    sourcePath: string;    // relative to repo root, e.g. "node_modules/sql.js/dist/sql-wasm.wasm"
    sqlJsVersion: string;
    generatedAt: string;   // ISO timestamp
}

/**
 * Outcome of `verifyWasmChecksum()`. Always returned (never thrown) so the
 * loader can decide how to surface the result. Persisted into the boot
 * diagnostics snapshot for the BootFailureBanner support report.
 */
export type WasmChecksumOutcome =
    | {
          status: "match";
          algorithm: "SHA-256";
          hash: string;
          byteLength: number;
          sqlJsVersion: string;
          generatedAt: string;
      }
    | {
          status: "mismatch";
          algorithm: "SHA-256";
          expectedHash: string;
          actualHash: string;
          expectedByteLength: number;
          actualByteLength: number;
          sqlJsVersion: string;
          generatedAt: string;
      }
    | {
          status: "manifest-missing";
          /** chrome-extension URL we tried to fetch the checksum from. */
          checksumUrl: string;
          /** HTTP status, or null when fetch itself threw. */
          httpStatus: number | null;
          fetchError: string | null;
      }
    | {
          status: "manifest-malformed";
          checksumUrl: string;
          reason: string;
      }
    | {
          status: "compute-failed";
          reason: string;
      };

/* ------------------------------------------------------------------ */
/*  Implementation                                                     */
/* ------------------------------------------------------------------ */

const CHECKSUM_RESOURCE_PATH = "wasm/sql-wasm.wasm.checksum.json";

/**
 * Computes SHA-256 of `bytes` as a lowercase hex string. Uses the SW-safe
 * `crypto.subtle` API (available in MV3 service workers and the popup
 * page; no Node `crypto` dependency).
 */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const view = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < view.length; i++) {
        hex += view[i].toString(16).padStart(2, "0");
    }
    return hex;
}

/** Loads + parses the sidecar checksum file. Returns null on any failure. */
// eslint-disable-next-line max-lines-per-function -- discriminated-union return with 3 outcome shapes (ok/missing/malformed); splitting would scatter the contract
async function loadChecksumManifest(checksumUrl: string): Promise<
    | { kind: "ok"; manifest: WasmChecksumManifest }
    | { kind: "missing"; httpStatus: number | null; fetchError: string | null }
    | { kind: "malformed"; reason: string }
> {
    let response: Response;
    try {
        response = await fetch(checksumUrl);
    } catch (err) {
        return {
            kind: "missing",
            httpStatus: null,
            fetchError: err instanceof Error ? err.message : String(err),
        };
    }
    if (!response.ok) {
        return { kind: "missing", httpStatus: response.status, fetchError: null };
    }

    let json: unknown;
    try {
        json = await response.json();
    } catch (err) {
        return {
            kind: "malformed",
            reason: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    if (typeof json !== "object" || json === null) {
        return { kind: "malformed", reason: "checksum file is not a JSON object" };
    }
    const obj = json as Record<string, unknown>;

    const schema = obj.schema;
    const algorithm = obj.algorithm;
    const hash = obj.hash;
    const byteLength = obj.byteLength;

    if (schema !== WASM_CHECKSUM_SCHEMA) {
        return {
            kind: "malformed",
            reason: `unexpected schema "${String(schema)}" (expected "${WASM_CHECKSUM_SCHEMA}") — extension may have been built by an incompatible toolchain`,
        };
    }
    if (algorithm !== "SHA-256") {
        return { kind: "malformed", reason: `unsupported algorithm "${String(algorithm)}"` };
    }
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
        return { kind: "malformed", reason: `hash field is not 64 lowercase hex chars: ${JSON.stringify(hash)}` };
    }
    if (typeof byteLength !== "number" || !Number.isFinite(byteLength) || byteLength <= 0) {
        return { kind: "malformed", reason: `byteLength field is not a positive number: ${JSON.stringify(byteLength)}` };
    }

    const sourcePath = typeof obj.sourcePath === "string" ? obj.sourcePath : "(unknown)";
    const sqlJsVersion = typeof obj.sqlJsVersion === "string" ? obj.sqlJsVersion : "unknown";
    const generatedAt = typeof obj.generatedAt === "string" ? obj.generatedAt : "(unknown)";

    return {
        kind: "ok",
        manifest: {
            schema: WASM_CHECKSUM_SCHEMA,
            algorithm: "SHA-256",
            hash,
            byteLength,
            sourcePath,
            sqlJsVersion,
            generatedAt,
        },
    };
}

/**
 * Verifies the live `wasmBinary` against the bundled checksum sidecar.
 * Always resolves with a structured outcome — never throws. The caller
 * decides how to translate the outcome into user-facing wording.
 */
// eslint-disable-next-line max-lines-per-function -- structured outcome translator with 5 mutually-exclusive branches; splitting would obscure the contract
export async function verifyWasmChecksum(wasmBinary: ArrayBuffer): Promise<WasmChecksumOutcome> {
    const checksumUrl = chrome.runtime.getURL(CHECKSUM_RESOURCE_PATH);

    const loaded = await loadChecksumManifest(checksumUrl);
    if (loaded.kind === "missing") {
        return {
            status: "manifest-missing",
            checksumUrl,
            httpStatus: loaded.httpStatus,
            fetchError: loaded.fetchError,
        };
    }
    if (loaded.kind === "malformed") {
        return { status: "manifest-malformed", checksumUrl, reason: loaded.reason };
    }

    let actualHash: string;
    try {
        actualHash = await sha256Hex(wasmBinary);
    } catch (err) {
        return {
            status: "compute-failed",
            reason: `crypto.subtle.digest threw: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const { manifest } = loaded;
    const sizeMatches = wasmBinary.byteLength === manifest.byteLength;
    const hashMatches = actualHash === manifest.hash;

    if (sizeMatches && hashMatches) {
        return {
            status: "match",
            algorithm: "SHA-256",
            hash: manifest.hash,
            byteLength: manifest.byteLength,
            sqlJsVersion: manifest.sqlJsVersion,
            generatedAt: manifest.generatedAt,
        };
    }

    return {
        status: "mismatch",
        algorithm: "SHA-256",
        expectedHash: manifest.hash,
        actualHash,
        expectedByteLength: manifest.byteLength,
        actualByteLength: wasmBinary.byteLength,
        sqlJsVersion: manifest.sqlJsVersion,
        generatedAt: manifest.generatedAt,
    };
}

/**
 * Convenience formatter: returns a one-line summary suitable for log lines
 * and the support report. Always safe to call with any outcome shape.
 */
export function summarizeChecksumOutcome(outcome: WasmChecksumOutcome): string {
    switch (outcome.status) {
        case "match":
            return `OK (sha256=${outcome.hash.slice(0, 12)}…, ${outcome.byteLength} bytes, sql.js@${outcome.sqlJsVersion})`;
        case "mismatch":
            return `MISMATCH (expected sha256=${outcome.expectedHash.slice(0, 12)}…/${outcome.expectedByteLength}B, got ${outcome.actualHash.slice(0, 12)}…/${outcome.actualByteLength}B)`;
        case "manifest-missing":
            // eslint-disable-next-line sonarjs/no-nested-template-literals -- inline diagnostic formatting; extracting helpers obscures the one-line summary
            return `MANIFEST MISSING (${outcome.httpStatus !== null ? `HTTP ${outcome.httpStatus}` : "fetch threw"} at ${outcome.checksumUrl})`;
        case "manifest-malformed":
            return `MANIFEST MALFORMED (${outcome.reason})`;
        case "compute-failed":
            return `COMPUTE FAILED (${outcome.reason})`;
    }
}
