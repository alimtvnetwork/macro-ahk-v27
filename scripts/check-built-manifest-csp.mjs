#!/usr/bin/env node
/**
 * check-built-manifest-csp.mjs
 *
 * Post-build validator: confirms that the BUILT extension manifest
 * (chrome-extension/manifest.json) contains a CSP that allows WebAssembly
 * compilation. Without `'wasm-unsafe-eval'` in
 * `content_security_policy.extension_pages`, sql.js (and any other Wasm
 * module loaded by the background service worker, popup, or options page)
 * crashes at runtime with:
 *
 *   CompileError: WebAssembly.instantiate(): Compiling or instantiating
 *   WebAssembly module violates the following Content Security policy
 *   directive ... "script-src 'self'".
 *
 * This is the post-build twin of the source-manifest CSP check in
 * scripts/check-manifest-version.mjs (5b). The two checks together cover:
 *   - source manifest.json has the CSP (caught BEFORE Vite runs)
 *   - chrome-extension/manifest.json still has the CSP after the
 *     copyManifest plugin rewrote path fields (caught AFTER Vite runs)
 *
 * On success, prints a numbered reload-and-verify checklist so the
 * developer can confirm sql.js boots cleanly in 4 clicks.
 *
 * Usage:
 *   node scripts/check-built-manifest-csp.mjs
 *
 * Exit codes:
 *   0 — built manifest CSP is valid
 *   1 — built manifest is missing, malformed, or CSP is wrong
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILT_MANIFEST = resolve(ROOT, "chrome-extension", "manifest.json");
const SOURCE_MANIFEST = resolve(ROOT, "manifest.json");
const REQUIRED_DIRECTIVE = "'wasm-unsafe-eval'";

/** CODE RED failure block — same contract as check-manifest-version.mjs */
function fail(title, exactPath, missing, reason) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] BUILT MANIFEST CSP CHECK FAILED");
    console.error("========================================");
    console.error(`  Check:    ${title}`);
    console.error(`  Path:     ${exactPath}`);
    console.error(`  Missing:  ${missing}`);
    console.error(`  Reason:   ${reason}`);
    console.error("========================================");
    console.error("");
    process.exit(1);
}

/* 1. The built manifest must exist (i.e. the extension build ran). */
if (!existsSync(BUILT_MANIFEST)) {
    fail(
        "chrome-extension/manifest.json existence",
        BUILT_MANIFEST,
        "Built extension manifest at chrome-extension/manifest.json",
        "Run `pnpm run build:extension` first — this validator only makes sense AFTER Vite has emitted the bundled manifest. If you intended to validate the source manifest only, run `node scripts/check-manifest-version.mjs` instead.",
    );
}

/* 2. The built manifest must parse as JSON. */
let builtManifest;
try {
    builtManifest = JSON.parse(readFileSync(BUILT_MANIFEST, "utf-8"));
} catch (parseErr) {
    fail(
        "chrome-extension/manifest.json JSON parse",
        BUILT_MANIFEST,
        "Valid JSON content",
        `JSON.parse threw: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    );
}

/* 3. content_security_policy.extension_pages must exist. */
const csp = builtManifest.content_security_policy;
const extensionPagesCsp =
    csp && typeof csp === "object" && typeof csp.extension_pages === "string"
        ? csp.extension_pages
        : null;

if (extensionPagesCsp === null) {
    fail(
        "Built manifest content_security_policy.extension_pages",
        BUILT_MANIFEST,
        `content_security_policy.extension_pages with ${REQUIRED_DIRECTIVE}`,
        "MV3's default CSP forbids WebAssembly compilation. sql.js will throw `CompileError: ... violates the following Content Security policy directive` at runtime. The Vite copyManifest plugin (vite.config.extension.ts) must preserve this field from the source manifest.",
    );
}

/* 4. extension_pages must include 'wasm-unsafe-eval'. */
if (!extensionPagesCsp.includes(REQUIRED_DIRECTIVE)) {
    fail(
        "Built manifest CSP wasm-unsafe-eval directive",
        BUILT_MANIFEST,
        `${REQUIRED_DIRECTIVE} inside extension_pages script-src`,
        `Current extension_pages CSP is: "${extensionPagesCsp}". sql.js will fail to compile its WASM at runtime because the browser blocks WebAssembly.instantiate() under the default MV3 script-src.`,
    );
}

/* 5. Cross-check: built CSP should match source CSP byte-for-byte (sanity). */
let sourceMismatch = null;
if (existsSync(SOURCE_MANIFEST)) {
    try {
        const sourceManifest = JSON.parse(readFileSync(SOURCE_MANIFEST, "utf-8"));
        const sourceCsp =
            sourceManifest.content_security_policy &&
            typeof sourceManifest.content_security_policy === "object"
                ? sourceManifest.content_security_policy.extension_pages
                : undefined;
        if (typeof sourceCsp === "string" && sourceCsp !== extensionPagesCsp) {
            sourceMismatch = { source: sourceCsp, built: extensionPagesCsp };
        }
    } catch {
        /* non-fatal — source manifest will have been validated separately */
    }
}

/* ─── success report + reload checklist ─────────────────────────── */

const builtVersion = typeof builtManifest.version === "string" ? builtManifest.version : "(unknown)";
const builtName = typeof builtManifest.name === "string" ? builtManifest.name : "(unknown)";
const builtRel = relative(ROOT, BUILT_MANIFEST) || BUILT_MANIFEST;

console.log("");
console.log("========================================");
console.log("  [OK] Built manifest CSP validated");
console.log("========================================");
console.log(`  Path        : ${builtRel}`);
console.log(`  Name        : ${builtName}`);
console.log(`  Version     : ${builtVersion}`);
console.log(`  CSP (pages) : ${extensionPagesCsp}`);
console.log(`  Wasm allowed: yes (${REQUIRED_DIRECTIVE} present)`);

if (sourceMismatch !== null) {
    console.log("");
    console.log("  [WARN] Source vs built CSP differ:");
    console.log(`         source: ${sourceMismatch.source}`);
    console.log(`         built : ${sourceMismatch.built}`);
    console.log("         (Both still allow Wasm — vite.config.extension.ts may be rewriting the CSP.)");
}

console.log("");
console.log("────────────────────────────────────────");
console.log("  Reload & verify checklist (one-click)");
console.log("────────────────────────────────────────");
console.log("  1. Open  chrome://extensions");
console.log(`  2. Find  "${builtName}" v${builtVersion}, click the reload icon`);
console.log("  3. Open  the extension popup (toolbar icon)");
console.log("  4. Confirm the BootFailureBanner is GONE");
console.log("           (no \"WASM load (wasm)\" failure, no CSP CompileError)");
console.log("");
console.log("  If the banner still shows, check chrome://extensions");
console.log("  -> Inspect views: service worker -> Console for the");
console.log("  exact CompileError. The CSP guard should prevent this,");
console.log("  but a stale build cache or unloaded extension version");
console.log("  can still surface it. Try unloading + Load unpacked");
console.log(`  again from: ${resolve(ROOT, "chrome-extension")}`);
console.log("");

process.exit(0);
