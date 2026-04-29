/**
 * Shared manifest permission audit logic.
 *
 * Scans src/ for `chrome.<NAMESPACE>` usage and cross-checks against the
 * manifest.json "permissions" array. Returns a structured report; callers
 * decide whether mismatches are HARD errors or soft warnings.
 *
 * Used by:
 *   - scripts/check-manifest-permissions.mjs  (strict — fails on both missing and unused)
 *   - scripts/check-manifest-version.mjs      (lenient — fails on missing, warns on unused)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Maps chrome.<NAMESPACE> usage to the manifest permission required. */
export const API_TO_PERMISSION = {
    storage: "storage",
    tabs: "tabs",
    scripting: "scripting",
    cookies: "cookies",
    webNavigation: "webNavigation",
    alarms: "alarms",
    contextMenus: "contextMenus",
    offscreen: "offscreen",
    notifications: "notifications",
    downloads: "downloads",
    sidePanel: "sidePanel",
    identity: "identity",
    management: "management",
    webRequest: "webRequest",
    declarativeNetRequest: "declarativeNetRequest",
    bookmarks: "bookmarks",
    history: "history",
    topSites: "topSites",
    idle: "idle",
    power: "power",
    proxy: "proxy",
    tts: "tts",
    pageCapture: "pageCapture",
    desktopCapture: "desktopCapture",
    debugger: "debugger",
    declarativeContent: "declarativeContent",
    fontSettings: "fontSettings",
    privacy: "privacy",
    sessions: "sessions",
    system: "system",
    wallpaper: "wallpaper",
};

/**
 * Permissions that are valid in the manifest but cannot be detected via
 * chrome.<api> usage. They gate browser behavior implicitly (quotas, command
 * shortcuts, focused-tab access, host matching) so absence of chrome.* hits
 * does NOT mean they're unused.
 */
export const SOFT_PERMISSIONS = new Set([
    "activeTab",        // Granted on user gesture; no chrome.activeTab namespace.
    "unlimitedStorage", // Quota gate for IndexedDB/OPFS — not an API namespace.
    "commands",         // The "commands" manifest field, not a permission key.
    "background",       // Implicit via manifest.background field.
]);

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
const SKIP_DIR_NAMES = new Set([
    "node_modules", "dist", "__tests__", "test", "tests", "__snapshots__",
]);
const SKIP_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

function* walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) {
            if (SKIP_DIR_NAMES.has(entry)) continue;
            yield* walk(full);
            continue;
        }
        if (!st.isFile()) continue;
        const isScannable = SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext));
        if (!isScannable) continue;
        const isSkipped = SKIP_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix));
        if (isSkipped) continue;
        yield full;
    }
}

/**
 * Strips comments + string contents (replaced with spaces, length-preserving)
 * so the chrome.* regex doesn't trip on docstrings or string literals.
 */
function stripNonCode(src) {
    const out = src.split("");
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];
        if (ch === "/" && next === "/") {
            while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; }
            continue;
        }
        if (ch === "/" && next === "*") {
            out[i] = " "; out[i + 1] = " "; i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
                if (src[i] !== "\n") out[i] = " ";
                i++;
            }
            if (i < src.length) { out[i] = " "; out[i + 1] = " "; i += 2; }
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            const quote = ch;
            out[i] = " ";
            i++;
            while (i < src.length) {
                if (src[i] === "\\") { out[i] = " "; out[i + 1] = " "; i += 2; continue; }
                if (src[i] === quote) { out[i] = " "; i++; break; }
                if (src[i] !== "\n") out[i] = " ";
                i++;
            }
            continue;
        }
        i++;
    }
    return out.join("");
}

/**
 * Scans srcDir for chrome.<NAMESPACE> usage.
 * @returns {Map<string, Set<string>>} apiName -> Set of "relPath:line"
 */
export function scanSourceForChromeApiUsage(srcDir, repoRoot) {
    const usage = new Map();
    const apiPattern = /\bchrome\.([a-zA-Z]+)\b/g;
    for (const file of walk(srcDir)) {
        const raw = readFileSync(file, "utf-8");
        const code = stripNonCode(raw);
        let match;
        while ((match = apiPattern.exec(code)) !== null) {
            const apiName = match[1];
            const permission = API_TO_PERMISSION[apiName];
            if (!permission) continue;
            const lineNum = code.slice(0, match.index).split("\n").length;
            const relPath = relative(repoRoot, file).replaceAll("\\", "/");
            const location = `${relPath}:${lineNum}`;
            if (!usage.has(apiName)) usage.set(apiName, new Set());
            usage.get(apiName).add(location);
        }
    }
    return usage;
}

/**
 * Computes the audit report for one manifest + one src tree.
 * @param {object} args
 * @param {string} args.manifestPath  Absolute path to manifest.json
 * @param {string} args.srcDir        Absolute path to src/
 * @param {string} args.repoRoot      Absolute path to repo root (for relative reporting)
 * @returns {{
 *   declaredPermissions: Set<string>,
 *   usage: Map<string, Set<string>>,
 *   missing: Array<{apiName: string, requiredPermission: string, locations: Set<string>}>,
 *   unusedHard: string[],
 *   unusedSoft: string[],
 * }}
 */
export function auditManifestPermissions({ manifestPath, srcDir, repoRoot }) {
    if (!existsSync(manifestPath)) {
        throw new Error(`manifest.json not found at ${manifestPath}`);
    }
    if (!existsSync(srcDir)) {
        throw new Error(`src/ not found at ${srcDir}`);
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const declaredPermissions = Array.isArray(manifest.permissions)
        ? new Set(manifest.permissions)
        : new Set();

    const usage = scanSourceForChromeApiUsage(srcDir, repoRoot);

    const missing = [];
    for (const [apiName, locations] of usage.entries()) {
        const requiredPermission = API_TO_PERMISSION[apiName];
        if (!declaredPermissions.has(requiredPermission)) {
            missing.push({ apiName, requiredPermission, locations });
        }
    }

    const unusedHard = [];
    const unusedSoft = [];
    for (const declared of declaredPermissions) {
        if (SOFT_PERMISSIONS.has(declared)) continue;
        const isUsed = [...Object.entries(API_TO_PERMISSION)].some(
            ([apiName, perm]) => perm === declared && usage.has(apiName),
        );
        if (!isUsed) {
            const isKnown = Object.values(API_TO_PERMISSION).includes(declared);
            if (isKnown) unusedHard.push(declared);
            else unusedSoft.push(declared);
        }
    }

    return { declaredPermissions, usage, missing, unusedHard, unusedSoft };
}

/**
 * Prints the standard CODE RED block for missing permissions.
 * @returns {boolean} true when any missing entries were printed.
 */
export function printMissingPermissions(missing) {
    if (missing.length === 0) return false;
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] MISSING PERMISSIONS IN manifest.json");
    console.error("========================================");
    for (const { apiName, requiredPermission, locations } of missing) {
        const sample = [...locations].slice(0, 3);
        const more = locations.size > sample.length
            ? ` (+${locations.size - sample.length} more)`
            : "";
        console.error(`  Missing:  "${requiredPermission}"`);
        console.error(`  API:      chrome.${apiName}`);
        console.error(`  Used in:  ${sample.join(", ")}${more}`);
        console.error(`  Reason:   chrome.${apiName} requires the "${requiredPermission}" permission in manifest.json. Calling it without the declared permission throws TypeError or returns undefined at runtime.`);
        console.error("  ---");
    }
    console.error(`  Fix:      Add ${missing.map((r) => `"${r.requiredPermission}"`).join(", ")} to manifest.json "permissions".`);
    console.error("========================================");
    console.error("");
    return true;
}

/**
 * Prints the unused-permission section as either an error block or warnings.
 * @param {object} args
 * @param {string[]} args.unusedHard
 * @param {string[]} args.unusedSoft
 * @param {string} args.manifestPath
 * @param {"error"|"warn"} args.severity
 * @returns {boolean} true when hard-unused entries were printed under "error" severity.
 */
export function printUnusedPermissions({ unusedHard, unusedSoft, manifestPath, severity }) {
    if (unusedHard.length === 0 && unusedSoft.length === 0) return false;

    if (unusedHard.length > 0) {
        if (severity === "error") {
            console.error("");
            console.error("========================================");
            console.error("  [CODE RED] UNUSED PERMISSIONS IN manifest.json");
            console.error("========================================");
            for (const perm of unusedHard) {
                console.error(`  Unused:   "${perm}"`);
                console.error(`  Path:     ${manifestPath}`);
                console.error(`  Missing:  Any chrome.${perm}.* call in src/`);
                console.error(`  Reason:   Declaring unused permissions triggers Chrome Web Store review warnings, expands the install-time consent prompt, and grows the extension's attack surface. Remove from manifest.json "permissions" or add the corresponding chrome.${perm}.* code.`);
                console.error("  ---");
            }
            console.error("========================================");
            console.error("");
            return true;
        }
        // warn severity
        console.warn("");
        console.warn("[WARN] Declared permissions with no chrome.* usage in src/:");
        for (const perm of unusedHard) {
            console.warn(`  - "${perm}" (no chrome.${perm}.* call found)`);
        }
        console.warn(`  Source:   ${manifestPath}`);
        console.warn(`  Reason:   Unused permissions inflate the install-time consent prompt and slow Chrome Web Store review.`);
        console.warn(`  Fix:      Remove from manifest.json "permissions" or add the corresponding chrome.${unusedHard[0]}.* code.`);
        console.warn("");
    }

    if (unusedSoft.length > 0) {
        console.warn(
            `[WARN] Declared permissions not in validator's known map (cannot verify usage): ${unusedSoft.join(", ")}`,
        );
    }
    return false;
}
