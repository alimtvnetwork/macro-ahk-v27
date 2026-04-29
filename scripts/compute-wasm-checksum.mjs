#!/usr/bin/env node
/**
 * compute-wasm-checksum.mjs
 *
 * Build-time companion to src/background/wasm-integrity.ts.
 *
 * For the bundled `chrome-extension/wasm/sql-wasm.wasm` we compute:
 *   - SHA-256 hash (lowercase hex)
 *   - byte length
 *   - the source path it was copied from (sanity provenance)
 *   - the installed sql.js package version
 *
 * Output:  chrome-extension/wasm/sql-wasm.wasm.checksum.json
 *
 *   {
 *     "schema": "marco-wasm-checksum-v1",
 *     "algorithm": "SHA-256",
 *     "hash": "<64 hex chars>",
 *     "byteLength": 659730,
 *     "sourcePath": "node_modules/sql.js/dist/sql-wasm.wasm",
 *     "sqlJsVersion": "1.10.3",
 *     "generatedAt": "2026-04-21T16:30:00.000Z"
 *   }
 *
 * Cross-check (HARD ERROR): if `node_modules/sql.js/dist/sql-wasm.wasm`
 * exists, we hash both files and abort the build when they differ. This
 * catches corruption introduced during the viteStaticCopy step, a stale
 * cached `chrome-extension/wasm/sql-wasm.wasm`, or a regression in
 * verify-wasm-asset's self-heal copy.
 *
 * The runtime verifier (`src/background/wasm-integrity.ts`) re-fetches
 * both files at boot and compares the live SHA-256 against this manifest.
 * On mismatch it throws `[WASM_CHECKSUM_MISMATCH]` — a definitive
 * "binary is actually corrupted" diagnosis. When the checksum matches but
 * sql.js still throws, the cause is *not* corruption (it's CSP, OOM, or
 * a JS-shim/Wasm version skew) — and the runtime says so verbatim.
 *
 * Usage:
 *   node scripts/compute-wasm-checksum.mjs
 *   node scripts/compute-wasm-checksum.mjs --dist <chrome-extension dir>
 *
 * Exit codes:
 *   0 — checksum file written, source/dist match
 *   1 — WASM missing, unreadable, or source/dist hash mismatch
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ─── arg parsing ─────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const distArgIdx = argv.indexOf("--dist");
const DIST_DIR = distArgIdx !== -1 && argv[distArgIdx + 1]
    ? resolve(argv[distArgIdx + 1])
    : resolve(ROOT, "chrome-extension");

const BUILT_WASM = resolve(DIST_DIR, "wasm", "sql-wasm.wasm");
const CHECKSUM_FILE = resolve(DIST_DIR, "wasm", "sql-wasm.wasm.checksum.json");
const SOURCE_WASM = resolve(ROOT, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const SQLJS_PKG = resolve(ROOT, "node_modules", "sql.js", "package.json");

/* ─── failure helper (same shape as our other CODE RED scripts) ── */

function fail(title, exactPath, missing, reason) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] WASM CHECKSUM STEP FAILED");
    console.error("========================================");
    console.error(`  Check:    ${title}`);
    console.error(`  Path:     ${exactPath}`);
    console.error(`  Missing:  ${missing}`);
    console.error(`  Reason:   ${reason}`);
    console.error("========================================");
    console.error("");
    process.exit(1);
}

function sha256(buf) {
    return createHash("sha256").update(buf).digest("hex");
}

/* ─── 1. built WASM must exist ────────────────────────────────── */

if (!existsSync(BUILT_WASM)) {
    fail(
        "Built WASM existence",
        BUILT_WASM,
        "chrome-extension/wasm/sql-wasm.wasm",
        "Run `pnpm run build:extension` first — verifyWasmAsset (vite.config.extension.ts) is supposed to copy this file from node_modules/sql.js/dist/. Without it the runtime checksum verifier has nothing to compare against and sql.js cannot boot.",
    );
}

/* ─── 2. read + hash built WASM ───────────────────────────────── */

let builtBytes;
try {
    builtBytes = readFileSync(BUILT_WASM);
} catch (err) {
    fail(
        "Built WASM readable",
        BUILT_WASM,
        "Readable file content",
        `readFileSync threw: ${err && err.message ? err.message : String(err)}`,
    );
}
const builtHash = sha256(builtBytes);
const builtSize = builtBytes.byteLength;

/* ─── 3. cross-check vs node_modules source (HARD ERROR on drift) */

let sourceHash = null;
let sourceSize = null;
let sourceAvailable = false;

if (existsSync(SOURCE_WASM)) {
    sourceAvailable = true;
    let srcBytes;
    try {
        srcBytes = readFileSync(SOURCE_WASM);
    } catch (err) {
        fail(
            "Source WASM readable",
            SOURCE_WASM,
            "Readable file content from node_modules/sql.js/dist/",
            `readFileSync threw: ${err && err.message ? err.message : String(err)}`,
        );
    }
    sourceHash = sha256(srcBytes);
    sourceSize = srcBytes.byteLength;

    if (sourceHash !== builtHash || sourceSize !== builtSize) {
        fail(
            "Built WASM matches node_modules source",
            `${BUILT_WASM} (built)  vs  ${SOURCE_WASM} (source)`,
            "Identical bytes — viteStaticCopy / verify-wasm-asset must produce a byte-identical copy of node_modules/sql.js/dist/sql-wasm.wasm",
            `Built: ${builtSize} bytes, sha256=${builtHash}\n            Source: ${sourceSize} bytes, sha256=${sourceHash}\n            Drift means the bundled WASM was corrupted during copy or a stale cached file shipped. Delete chrome-extension/wasm/sql-wasm.wasm and rerun \`pnpm run build:extension\`.`,
        );
    }
} else {
    console.warn(`[wasm-checksum] WARN — source not found at ${SOURCE_WASM}`);
    console.warn(`[wasm-checksum]        skipping built<->source cross-check`);
    console.warn(`[wasm-checksum]        (not fatal — built WASM is what ships)`);
}

/* ─── 4. read sql.js package version ──────────────────────────── */

let sqlJsVersion = "unknown";
if (existsSync(SQLJS_PKG)) {
    try {
        sqlJsVersion = JSON.parse(readFileSync(SQLJS_PKG, "utf-8")).version ?? "unknown";
    } catch {
        /* tolerate */
    }
}

/* ─── 5. write checksum sidecar ───────────────────────────────── */

const record = {
    schema: "marco-wasm-checksum-v1",
    algorithm: "SHA-256",
    hash: builtHash,
    byteLength: builtSize,
    sourcePath: relative(ROOT, SOURCE_WASM).split("\\").join("/"),
    sqlJsVersion,
    generatedAt: new Date().toISOString(),
};

writeFileSync(CHECKSUM_FILE, JSON.stringify(record, null, 2) + "\n", "utf-8");

/* ─── 6. report ───────────────────────────────────────────────── */

console.log("[wasm-checksum] OK");
console.log(`  built     : ${relative(ROOT, BUILT_WASM)}`);
console.log(`  bytes     : ${builtSize}`);
console.log(`  sha256    : ${builtHash}`);
console.log(`  sql.js    : ${sqlJsVersion}`);
console.log(`  source ok : ${sourceAvailable ? "yes (matches built byte-for-byte)" : "skipped (node_modules/sql.js missing)"}`);
console.log(`  written   : ${relative(ROOT, CHECKSUM_FILE)}`);

process.exit(0);
