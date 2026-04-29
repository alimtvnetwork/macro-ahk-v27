#!/usr/bin/env node
/**
 * repro-build-error.mjs
 *
 * "Reproduce build error" entry point. Runs the same dev build the user hit
 * (`vite build --mode development`) and, before/after, prints the resolved
 * import path for the `result-webhook` module so we can tell at a glance
 * whether the failure is a missing-file issue, an import-path drift, or a
 * Vite/Rollup cache hiccup.
 *
 * Usage:  pnpm run repro:build      (or)   node scripts/repro-build-error.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE_REL = "src/background/recorder/step-library/result-webhook.ts";
const MODULE_ABS = join(ROOT, MODULE_REL);
const KNOWN_IMPORTERS = [
    "src/background/recorder/step-library/index.ts",
    "src/background/recorder/step-library/input-source.ts",
    "src/components/options/BatchRunDialog.tsx",
    "src/components/options/WebhookSettingsDialog.tsx",
];

function header(label) {
    console.log("\n" + "═".repeat(72));
    console.log("  " + label);
    console.log("═".repeat(72));
}

function reportResolvedPath() {
    header("Resolved import path: result-webhook");

    if (!existsSync(MODULE_ABS)) {
        console.log("❌ Module file does NOT exist on disk.");
        console.log("   Expected absolute path : " + MODULE_ABS);
        console.log("   Expected relative path : " + MODULE_REL);
        console.log("   Missing item           : result-webhook.ts");
        console.log("   Reason                 : Importers will fail with ENOENT during Vite/Rollup load.");
        return false;
    }

    const stat = statSync(MODULE_ABS);
    console.log("✅ Module file exists.");
    console.log("   Absolute path  : " + MODULE_ABS);
    console.log("   Relative path  : " + MODULE_REL);
    console.log("   File URL       : " + pathToFileURL(MODULE_ABS).href);
    console.log("   Size (bytes)   : " + stat.size);
    console.log("   Modified (mtime): " + stat.mtime.toISOString());

    // Surface @-alias form (matches vite.config.ts: "@" -> "./src")
    const aliasForm = "@/" + relative(join(ROOT, "src"), MODULE_ABS).replace(/\\/g, "/").replace(/\.ts$/, "");
    console.log("   Alias import   : import { dispatchWebhook } from \"" + aliasForm + "\";");

    // Quick export visibility scan
    const source = readFileSync(MODULE_ABS, "utf-8");
    const hasDispatch = /export\s+(async\s+)?function\s+dispatchWebhook\b/.test(source)
        || /export\s+(const|let|var)\s+dispatchWebhook\b/.test(source)
        || /export\s*\{[^}]*\bdispatchWebhook\b[^}]*\}/.test(source);
    console.log("   dispatchWebhook export found: " + (hasDispatch ? "yes" : "NO ❌"));

    // Show known importers so drift is obvious in the repro output
    console.log("\n   Known importers (must exist):");
    for (const rel of KNOWN_IMPORTERS) {
        const ok = existsSync(join(ROOT, rel));
        console.log("     " + (ok ? "✓" : "✗") + "  " + rel);
    }

    return true;
}

function runBuild() {
    header("Running: vite build --mode development");
    const result = spawnSync("npx", ["vite", "build", "--mode", "development"], {
        cwd: ROOT,
        stdio: "inherit",
        shell: true,
    });
    return result.status ?? 1;
}

const preOk = reportResolvedPath();
const exitCode = runBuild();

header("Repro summary");
console.log("  result-webhook resolvable on disk : " + (preOk ? "yes" : "NO"));
console.log("  vite build exit code              : " + exitCode);
if (exitCode !== 0) {
    console.log("\n  → Build FAILED. See output above. If the module exists but Vite still");
    console.log("    cannot load it, the cause is almost always a stale Vite/Rollup cache:");
    console.log("    delete node_modules/.vite and dist/, then re-run this script.");
} else {
    console.log("\n  → Build succeeded. The original ENOENT was transient (cache).");
}
process.exit(exitCode);
