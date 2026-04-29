#!/usr/bin/env node
/**
 * Manifest Permission Validator (strict mode).
 *
 * Scans src/ for `chrome.*` API calls and cross-checks the result against
 * manifest.json's "permissions" array.
 *
 *   - HARD ERROR if a chrome.* API is used in src/ but its permission is
 *     NOT declared in manifest.json.
 *   - HARD ERROR if a permission is declared in manifest.json but no matching
 *     chrome.* API is used anywhere in src/ (unused permission).
 *
 * For the lenient variant (warn on unused) see check-manifest-version.mjs.
 *
 * Implementation lives in scripts/lib/manifest-permission-audit.mjs and is
 * shared with check-manifest-version.mjs to keep the API <-> permission map
 * in one place.
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
    auditManifestPermissions,
    printMissingPermissions,
    printUnusedPermissions,
} from "./lib/manifest-permission-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const SRC_DIR = resolve(ROOT, "src");

function fail(title, exactPath, missing, reason) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] MANIFEST PERMISSION CHECK FAILED");
    console.error("========================================");
    console.error(`  Check:    ${title}`);
    console.error(`  Path:     ${exactPath}`);
    console.error(`  Missing:  ${missing}`);
    console.error(`  Reason:   ${reason}`);
    console.error("========================================");
    console.error("");
    process.exit(1);
}

if (!existsSync(MANIFEST_PATH)) {
    fail(
        "manifest.json existence",
        MANIFEST_PATH,
        "manifest.json file at repository root",
        "Permission validator cannot run without a manifest. Run `node scripts/check-manifest-version.mjs` first.",
    );
}
if (!existsSync(SRC_DIR)) {
    fail(
        "src/ directory existence",
        SRC_DIR,
        "src/ source root for chrome.* scan",
        "Permission validator scans src/ for chrome.<namespace> usage. The directory is missing.",
    );
}

const report = auditManifestPermissions({
    manifestPath: MANIFEST_PATH,
    srcDir: SRC_DIR,
    repoRoot: ROOT,
});

if (printMissingPermissions(report.missing)) process.exit(1);
if (printUnusedPermissions({
    unusedHard: report.unusedHard,
    unusedSoft: report.unusedSoft,
    manifestPath: MANIFEST_PATH,
    severity: "error",
})) process.exit(1);

const usedApis = [...report.usage.keys()].sort();
console.log(
    `[OK] Manifest permissions validated: ${report.declaredPermissions.size} declared, ${usedApis.length} chrome.* API namespaces used (${usedApis.join(", ")})`,
);
process.exit(0);
