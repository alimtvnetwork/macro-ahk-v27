#!/usr/bin/env node
/**
 * check-result-webhook.mjs
 *
 * Compile-time guard: fails the build if the `result-webhook` module is
 * missing, empty, or not resolvable from the modules that import it.
 *
 * Why: a stale Vite/Rollup cache previously failed mid-build with an opaque
 * ENOENT pointing at result-webhook. This check surfaces the real problem
 * (missing file or broken import path) BEFORE Vite runs, with a clear
 * actionable message including exact file paths.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_REL = "src/background/recorder/step-library/result-webhook.ts";
const MODULE_PATH = join(ROOT, MODULE_REL);
const SEARCH_DIR = dirname(MODULE_PATH);
const SEARCH_GLOB = `${SEARCH_DIR}/result-webhook.{ts,tsx,mts,cts,js,mjs,cjs,jsx}`;
const REQUIRED_EXPORTS = ["dispatchWebhook"];
const KNOWN_IMPORTERS = [
    "src/background/recorder/step-library/index.ts",
    "src/background/recorder/step-library/input-source.ts",
    "src/components/options/BatchRunDialog.tsx",
    "src/components/options/WebhookSettingsDialog.tsx",
];

function fail(msg) {
    console.error("\n❌ [check-result-webhook] " + msg + "\n");
    process.exit(1);
}

function listSiblings(dir) {
    try {
        return readdirSync(dir)
            .filter((n) => /^result-webhook\b/i.test(n))
            .map((n) => `      - ${n}`)
            .join("\n") || "      (none — directory contains no `result-webhook*` entries)";
    } catch (err) {
        return `      (could not read directory: ${err instanceof Error ? err.message : String(err)})`;
    }
}

// 1. File must exist
if (!existsSync(MODULE_PATH)) {
    fail(
        `Missing module file.\n` +
        `   Working dir   : ${process.cwd()}\n` +
        `   Repo root     : ${ROOT}\n` +
        `   Search dir    : ${SEARCH_DIR}\n` +
        `   Search glob   : ${SEARCH_GLOB}\n` +
        `   Expected path : ${MODULE_PATH}\n` +
        `   Missing item  : ${MODULE_REL}\n` +
        `   Siblings found:\n${listSiblings(SEARCH_DIR)}\n` +
        `   Reason        : The result-webhook module is imported by core code but the file is absent at the expected path under the working directory.\n` +
        `   Fix           : Restore the file from git history or recreate the module with the expected exports: ${REQUIRED_EXPORTS.join(", ")}.`
    );
}

// 2. File must be non-empty
const stat = statSync(MODULE_PATH);
if (stat.size === 0) {
    fail(
        `Module file is empty.\n` +
        `   Path         : ${MODULE_PATH}\n` +
        `   Missing item : module body (file size = 0 bytes)\n` +
        `   Reason       : An empty module cannot expose required exports (${REQUIRED_EXPORTS.join(", ")}).\n` +
        `   Fix          : Restore the file contents.`
    );
}

// 3. Required exports must be present (lightweight source scan)
const source = readFileSync(MODULE_PATH, "utf-8");
const missingExports = REQUIRED_EXPORTS.filter((name) => {
    const patterns = [
        new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`),
        new RegExp(`export\\s+(const|let|var)\\s+${name}\\b`),
        new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`),
    ];
    return !patterns.some((re) => re.test(source));
});
if (missingExports.length > 0) {
    fail(
        `Required export(s) not found.\n` +
        `   Path          : ${MODULE_PATH}\n` +
        `   Missing items : ${missingExports.join(", ")}\n` +
        `   Reason        : Importers depend on these named exports; build will fail at bundle time.\n` +
        `   Fix           : Re-add the missing exports to result-webhook.ts.`
    );
}

// 4. Known importers must still exist (catches accidental import-path drift)
const missingImporters = KNOWN_IMPORTERS.filter((rel) => !existsSync(join(ROOT, rel)));
if (missingImporters.length > 0) {
    fail(
        `Known importer file(s) missing — update KNOWN_IMPORTERS in this script if files were intentionally removed.\n` +
        `   Working dir   : ${process.cwd()}\n` +
        `   Repo root     : ${ROOT}\n` +
        `   Search glob   : ${ROOT}/{${KNOWN_IMPORTERS.join(",")}}\n` +
        `   Missing paths :\n${missingImporters.map((p) => `      - ${join(ROOT, p)}`).join("\n")}\n` +
        `   Reason        : The guard tracks importers explicitly so silent drift cannot mask a broken import graph.`
    );
}

console.log(`✅ [check-result-webhook] OK — ${MODULE_PATH} resolves with exports: ${REQUIRED_EXPORTS.join(", ")}`);
