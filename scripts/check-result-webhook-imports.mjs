#!/usr/bin/env node
/**
 * check-result-webhook-imports.mjs
 *
 * Walks the project source tree and inspects every `import` / `export`
 * statement whose specifier mentions `result-webhook`. Each import is
 * classified into one of three buckets:
 *
 *   ✓ file-form       — points directly at a `.ts` file (with or without
 *                       extension), e.g. "./result-webhook" or
 *                       "@/background/recorder/step-library/result-webhook".
 *                       Resolves cleanly via Vite/Rollup.
 *
 *   ⚠ folder-form     — points at a directory whose basename is
 *                       `result-webhook` (e.g. ".../result-webhook" with
 *                       a trailing slash, "/result-webhook/index", or any
 *                       form where the resolver must fall back to an
 *                       index file). Folder-form imports of this module
 *                       are FORBIDDEN: `result-webhook` is a single .ts
 *                       file, has no `index.ts`, and a folder-form import
 *                       is the most common cause of `vite:load-fallback`
 *                       ENOENT failures we have hit historically.
 *
 *   ✗ unresolved      — specifier mentions result-webhook but cannot be
 *                       statically resolved to either of the above.
 *
 * Exits with code 1 (and the standard exact-path / missing-item / reason
 * format) when any folder-form or unresolved import is found.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["src", "standalone-scripts"];
const SKIP_DIRS = new Set([
    "node_modules", "dist", ".release", "skipped",
    "__tests__", ".git", ".vite", "build",
]);
const FILE_EXTS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const TARGET = "result-webhook";
const MODULE_FILE_REL = "src/background/recorder/step-library/result-webhook.ts";
const MODULE_DIR_REL = "src/background/recorder/step-library";

// Match: import ... from "X"; export ... from "X"; import("X")
const IMPORT_REGEX = /(?:import\s+(?:type\s+)?(?:[^"'`;]+?\s+from\s+)?|export\s+(?:type\s+)?(?:\*|\{[^}]*\}|[A-Za-z_$][\w$]*)\s+from\s+|import\s*\(\s*)(['"])([^'"`]+)\1/g;

function* walk(dir) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else if (FILE_EXTS.has(extname(entry.name))) {
            yield full;
        }
    }
}

/**
 * Resolve a relative or alias specifier to an absolute path on disk.
 * Returns { absPath, kind } where kind ∈ "file" | "dir" | "unresolved".
 */
function resolveSpecifier(specifier, fromFile) {
    let basePath;
    if (specifier.startsWith("@/")) {
        basePath = join(ROOT, "src", specifier.slice(2));
    } else if (specifier.startsWith(".")) {
        basePath = resolve(dirname(fromFile), specifier);
    } else {
        return { absPath: specifier, kind: "unresolved" };
    }

    // Strip trailing slash → we'll detect dir-form below.
    const trailingSlash = basePath.endsWith("/");
    const cleanPath = trailingSlash ? basePath.slice(0, -1) : basePath;

    // Try direct file (with and without extensions).
    if (existsSync(cleanPath) && statSync(cleanPath).isFile()) {
        return { absPath: cleanPath, kind: "file", trailingSlash };
    }
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]) {
        const candidate = cleanPath + ext;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
            return { absPath: candidate, kind: "file", trailingSlash };
        }
    }

    // Directory match → folder-form (resolves via index file or fails).
    if (existsSync(cleanPath) && statSync(cleanPath).isDirectory()) {
        return { absPath: cleanPath, kind: "dir", trailingSlash };
    }

    return { absPath: cleanPath, kind: "unresolved", trailingSlash };
}

function inspectFile(file) {
    const source = readFileSync(file, "utf-8");
    const findings = [];
    for (const match of source.matchAll(IMPORT_REGEX)) {
        const specifier = match[2];
        if (!specifier.includes(TARGET)) continue;
        const resolved = resolveSpecifier(specifier, file);

        // Folder-form detection — any of these patterns:
        //   1. trailing slash
        //   2. resolves to a directory rather than a file
        //   3. specifier ends with "/result-webhook/index" or "/result-webhook/" basename
        const endsWithBareTarget = /\/result-webhook\/?$/.test(specifier);
        const endsWithTargetIndex = /\/result-webhook\/(index)(\.[mc]?[jt]sx?)?$/.test(specifier);
        const isFolderForm =
            resolved.kind === "dir" ||
            resolved.trailingSlash === true ||
            endsWithTargetIndex ||
            (endsWithBareTarget && resolved.kind === "dir");

        let kind = "file";
        if (isFolderForm) kind = "folder";
        else if (resolved.kind === "unresolved") kind = "unresolved";

        // Get line number for nicer reporting
        const upToMatch = source.slice(0, match.index);
        const line = upToMatch.split("\n").length;

        findings.push({ specifier, kind, resolved, line });
    }
    return findings;
}

const allFindings = [];
for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
        const findings = inspectFile(file);
        for (const f of findings) {
            allFindings.push({ file, ...f });
        }
    }
}

const folderForm = allFindings.filter((f) => f.kind === "folder");
const unresolved = allFindings.filter((f) => f.kind === "unresolved");
const fileForm = allFindings.filter((f) => f.kind === "file");

console.log("🔎 [check-result-webhook-imports] Scanned " + allFindings.length + " result-webhook import(s):");
console.log("   ✓ file-form   : " + fileForm.length);
console.log("   ⚠ folder-form : " + folderForm.length);
console.log("   ✗ unresolved  : " + unresolved.length);

if (folderForm.length > 0 || unresolved.length > 0) {
    console.error("\n❌ [check-result-webhook-imports] Forbidden import form(s) detected.\n");

    for (const f of folderForm) {
        console.error("   ⚠ FOLDER-FORM IMPORT");
        console.error("     File         : " + relative(ROOT, f.file) + ":" + f.line);
        console.error("     Specifier    : " + f.specifier);
        console.error("     Reason cause : " + (f.resolved.trailingSlash ? "trailing slash forces directory resolution" : (f.resolved.kind === "dir" ? "specifier resolves to a directory" : "specifier ends in /index")));
        console.error("     Missing item : a single-file import target — folder-form has no index.ts and breaks Vite vite:load-fallback");
        console.error("     Reason       : `result-webhook` is a single file (" + MODULE_FILE_REL + "), not a barrel. Folder-form imports trigger ENOENT during bundling.");
        console.error("     Fix          : Replace with `@/background/recorder/step-library/result-webhook` (no trailing slash, no /index).\n");
    }
    for (const f of unresolved) {
        console.error("   ✗ UNRESOLVED IMPORT");
        console.error("     File         : " + relative(ROOT, f.file) + ":" + f.line);
        console.error("     Specifier    : " + f.specifier);
        console.error("     Missing item : a file on disk matching this specifier (tried direct + .ts/.tsx/.js/.jsx variants)");
        console.error("     Reason       : Specifier mentions `result-webhook` but does not point at " + MODULE_FILE_REL + " or a known sibling.");
        console.error("     Fix          : Update the import to `@/background/recorder/step-library/result-webhook` or remove the stale reference.\n");
    }

    console.error("   Canonical module path : " + join(ROOT, MODULE_FILE_REL));
    console.error("   Canonical dir         : " + join(ROOT, MODULE_DIR_REL));
    process.exit(1);
}

console.log("✅ [check-result-webhook-imports] All " + fileForm.length + " import(s) point at the file form — OK.");
