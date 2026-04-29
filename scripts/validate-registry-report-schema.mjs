#!/usr/bin/env node
/**
 * scripts/validate-registry-report-schema.mjs
 * ───────────────────────────────────────────────────────────────────
 * Round-trip CI gate for the standalone-registry --json contract.
 *
 *   1. Runs `report-standalone-registry.mjs --json` (no --strict, so
 *      this validation never gates the registry's own decision; it
 *      only checks the SHAPE of the payload).
 *   2. Loads `schemas/standalone-registry-report.schema.json`.
 *   3. Compiles it with ajv (draft 2020-12) and validates the payload.
 *   4. Exits 0 on conformance, 1 on any schema error (with a
 *      `::error::` annotation for each path).
 *
 * USAGE
 *   node scripts/validate-registry-report-schema.mjs
 *
 * INTENT
 *   - Catches drift between the script's emitted shape and the
 *     committed schema BEFORE downstream CI consumers (annotators,
 *     dashboards) silently parse a wrong shape.
 *   - Cheap (<1s) — safe to wire as a PR-blocking check.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const SCHEMA_PATH = resolve(REPO_ROOT, "schemas/standalone-registry-report.schema.json");
const REPORTER = resolve(REPO_ROOT, "scripts/report-standalone-registry.mjs");

function fail(message) {
    process.stdout.write(`::error::${message}\n`);
    process.exit(1);
}

// ── 1. Run the reporter and capture stdout ──────────────────────────
const run = spawnSync("node", [REPORTER, "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
});

if (run.status !== 0 && run.status !== 1) {
    // 0 = no gaps, 1 = strict-mode gaps. Anything else is a crash.
    fail(`report-standalone-registry.mjs --json crashed (exit=${run.status}): ${run.stderr || run.stdout}`);
}

let payload;

try {
    payload = JSON.parse(run.stdout);
} catch (parseError) {
    fail(`--json output is not valid JSON: ${parseError.message}. First 200 chars: ${run.stdout.slice(0, 200)}`);
}

// ── 2. Load schema + ajv ────────────────────────────────────────────
let Ajv2020;
let addFormats;

try {
    Ajv2020 = (await import("ajv/dist/2020.js")).default;
    addFormats = (await import("ajv-formats")).default;
} catch (importError) {
    fail(`Missing devDependency 'ajv' or 'ajv-formats'. Install with: pnpm add -D -w ajv ajv-formats. Original: ${importError.message}`);
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const validate = ajv.compile(schema);
const ok = validate(payload);

// ── 3. Report ───────────────────────────────────────────────────────
if (!ok) {
    process.stdout.write(`❌ Registry --json payload does NOT match schema (${validate.errors.length} error(s)):\n`);

    for (const err of validate.errors) {
        const where = err.instancePath || "(root)";
        process.stdout.write(`::error file=${SCHEMA_PATH},title=Schema mismatch at ${where}::${err.message} — keyword=${err.keyword}, schemaPath=${err.schemaPath}\n`);
    }

    process.exit(1);
}

process.stdout.write(`✅ Registry --json payload conforms to schema\n`);
process.stdout.write(`   schemaVersion: ${payload.schemaVersion}\n`);
process.stdout.write(`   mode:          ${payload.mode}\n`);
process.stdout.write(`   scripts:       ${payload.totals.scripts}\n`);
process.stdout.write(`   gapCount:      ${payload.totals.gapCount}\n`);
process.stdout.write(`   exitCode:      ${payload.exitCode}\n`);
