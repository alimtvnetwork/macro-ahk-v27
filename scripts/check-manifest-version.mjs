#!/usr/bin/env node
/**
 * Manifest Preflight — runs BEFORE every Vite extension build.
 *
 * Hard requirements:
 *   1. manifest.json MUST exist at the repo root.
 *   2. manifest.json "version" MUST equal EXTENSION_VERSION in src/shared/constants.ts.
 *   3. The version string MUST be a valid Chrome MV3 version (1-4 dot-separated
 *      integers, each 0-65535).
 *   4. Every chrome.<NAMESPACE> API used in src/ MUST have its corresponding
 *      permission declared in manifest.json (HARD ERROR — runtime would
 *      throw TypeError or silently no-op).
 *
 * Soft check (warning only):
 *   - Permissions declared in manifest.json that have no matching chrome.*
 *     usage in src/ are reported as warnings. Unused permissions inflate the
 *     install consent prompt and slow Chrome Web Store review, but do not
 *     break runtime.
 *
 * The strict variant of the permission audit (which fails on unused) lives
 * in scripts/check-manifest-permissions.mjs. Both share
 * scripts/lib/manifest-permission-audit.mjs.
 *
 * On hard failure: prints a CODE RED error block (exact path, what is missing,
 * why) and exits with code 1 to abort the build pipeline.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditManifestPermissions,
  printMissingPermissions,
  printUnusedPermissions,
} from "./lib/manifest-permission-audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const CONSTANTS_PATH = resolve(ROOT, "src/shared/constants.ts");
const SRC_DIR = resolve(ROOT, "src");

/** Prints a CODE RED failure block and exits 1. */
function fail(title, exactPath, missing, reason) {
  console.error("");
  console.error("========================================");
  console.error("  [CODE RED] MANIFEST PREFLIGHT FAILED");
  console.error("========================================");
  console.error(`  Check:    ${title}`);
  console.error(`  Path:     ${exactPath}`);
  console.error(`  Missing:  ${missing}`);
  console.error(`  Reason:   ${reason}`);
  console.error("========================================");
  console.error("");
  process.exit(1);
}

/* 1. manifest.json must exist at repo root ------------------------- */
if (!existsSync(MANIFEST_PATH)) {
  fail(
    "manifest.json existence",
    MANIFEST_PATH,
    "manifest.json file at repository root",
    "Vite extension build requires manifest.json at the repo root — without it, the bundled extension output (chrome-extension/) will be missing its manifest entirely.",
  );
}

/* 2. manifest.json must be valid JSON with a "version" field ------- */
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
} catch (parseErr) {
  fail(
    "manifest.json JSON parse",
    MANIFEST_PATH,
    "Valid JSON content",
    `JSON.parse threw: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
  );
}

const manifestVersion = manifest.version;
if (typeof manifestVersion !== "string" || manifestVersion.length === 0) {
  fail(
    'manifest.json "version" field',
    MANIFEST_PATH,
    'Top-level "version" string',
    `Expected a non-empty string, got: ${JSON.stringify(manifestVersion)}`,
  );
}

/* 3. Version must be a valid Chrome MV3 version -------------------- */
const MV3_VERSION_RE = /^(\d{1,5})(\.\d{1,5}){0,3}$/;
if (!MV3_VERSION_RE.test(manifestVersion)) {
  fail(
    "manifest.json version format",
    MANIFEST_PATH,
    "Chrome MV3-compliant version (1-4 dot-separated integers, each 0-65535)",
    `"${manifestVersion}" does not match the MV3 version regex. Chrome will reject this manifest at install time.`,
  );
}
for (const part of manifestVersion.split(".")) {
  const n = Number(part);
  if (n > 65535) {
    fail(
      "manifest.json version range",
      MANIFEST_PATH,
      "Each version segment must be ≤ 65535",
      `Segment "${part}" in version "${manifestVersion}" exceeds the Chrome MV3 limit (65535).`,
    );
  }
}

/* 4. constants.ts must exist and expose EXTENSION_VERSION ---------- */
if (!existsSync(CONSTANTS_PATH)) {
  fail(
    "constants.ts existence",
    CONSTANTS_PATH,
    "src/shared/constants.ts file",
    "Cannot validate version sync — the canonical EXTENSION_VERSION source file is missing.",
  );
}

const constantsSrc = readFileSync(CONSTANTS_PATH, "utf-8");
const versionMatch = constantsSrc.match(
  /EXTENSION_VERSION\s*=\s*["'](\d+(?:\.\d+){0,3})["']/,
);
if (!versionMatch) {
  fail(
    "constants.ts EXTENSION_VERSION export",
    CONSTANTS_PATH,
    'export const EXTENSION_VERSION = "X.Y.Z" declaration',
    "Could not match the EXTENSION_VERSION regex — the constant is missing, renamed, or formatted unexpectedly.",
  );
}

const constantsVersion = versionMatch[1];

/* 5. Versions must match ------------------------------------------- */
if (manifestVersion !== constantsVersion) {
  fail(
    "manifest.json ↔ EXTENSION_VERSION sync",
    `${MANIFEST_PATH}  vs  ${CONSTANTS_PATH}`,
    `Both files must declare the same version`,
    `manifest.json version="${manifestVersion}" but constants.ts EXTENSION_VERSION="${constantsVersion}". Run \`node scripts/bump-version.mjs ${constantsVersion}\` or update manifest.json manually.`,
  );
}

console.log(
  `[OK] Manifest preflight: manifest.json + EXTENSION_VERSION = ${manifestVersion}`,
);

/* 5b. Content Security Policy must allow WebAssembly compilation -----
 *
 *   sql.js (and any other Wasm consumer) cannot compile in MV3 unless
 *   `'wasm-unsafe-eval'` is present in the extension_pages script-src
 *   directive. The default MV3 CSP is `script-src 'self'; object-src 'self'`
 *   which forbids Wasm and produces a CompileError at runtime — exactly
 *   the boot failure we shipped in v2.181.0.
 *
 *   Hard-fail the build if anyone removes it.
 *   -------------------------------------------------------------------- */
const csp = manifest.content_security_policy;
const extensionPagesCsp =
  csp && typeof csp === "object" && typeof csp.extension_pages === "string"
    ? csp.extension_pages
    : null;

if (extensionPagesCsp === null) {
  fail(
    "manifest.json content_security_policy.extension_pages",
    MANIFEST_PATH,
    'content_security_policy.extension_pages with "wasm-unsafe-eval"',
    "MV3's default CSP forbids WebAssembly compilation. sql.js (and any other Wasm module loaded by the background service worker, popup, or options page) will throw `CompileError: ... violates the following Content Security policy directive` at runtime. Add: \"content_security_policy\": { \"extension_pages\": \"script-src 'self' 'wasm-unsafe-eval'; object-src 'self'\" }.",
  );
}

if (!/'wasm-unsafe-eval'/.test(extensionPagesCsp)) {
  fail(
    "manifest.json CSP wasm-unsafe-eval directive",
    MANIFEST_PATH,
    "'wasm-unsafe-eval' inside extension_pages script-src",
    `Current extension_pages CSP is: "${extensionPagesCsp}". sql.js will fail to compile its WASM at runtime because the browser blocks WebAssembly.instantiate() under the default MV3 script-src. Add 'wasm-unsafe-eval' to the script-src directive.`,
  );
}

console.log(
  `[OK] Manifest CSP: extension_pages allows wasm-unsafe-eval`,
);

/* 6. Permission audit --------------------------------------------------
 *    HARD ERROR if a chrome.* API is used in src/ without its permission.
 *    WARN-ONLY if a declared permission has no chrome.* usage in src/.
 *    -------------------------------------------------------------------- */
if (!existsSync(SRC_DIR)) {
  fail(
    "src/ directory existence (permission audit)",
    SRC_DIR,
    "src/ source root for chrome.* scan",
    "Permission audit scans src/ for chrome.<namespace> usage. The directory is missing — cannot validate manifest.json permissions.",
  );
}

let permissionReport;
try {
  permissionReport = auditManifestPermissions({
    manifestPath: MANIFEST_PATH,
    srcDir: SRC_DIR,
    repoRoot: ROOT,
  });
} catch (auditErr) {
  fail(
    "Permission audit",
    `${MANIFEST_PATH}  +  ${SRC_DIR}`,
    "Successful audit of chrome.* usage vs manifest.permissions",
    `Audit threw: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`,
  );
}

if (printMissingPermissions(permissionReport.missing)) {
  process.exit(1);
}

// Unused permissions: WARN only — does not abort the build.
printUnusedPermissions({
  unusedHard: permissionReport.unusedHard,
  unusedSoft: permissionReport.unusedSoft,
  manifestPath: MANIFEST_PATH,
  severity: "warn",
});

const usedApis = [...permissionReport.usage.keys()].sort();
console.log(
  `[OK] Manifest permissions: ${permissionReport.declaredPermissions.size} declared, ${usedApis.length} chrome.* namespaces used (${usedApis.join(", ") || "none"})`,
);

process.exit(0);
