#!/usr/bin/env node
/**
 * Render spec/23-database/diagrams/*.mmd → spec/23-database/images/*.{png,svg}
 *
 * Emits BOTH a raster PNG (for embedding in markdown / GitHub previews) and a
 * vector SVG (for crisp zoom + theming) per source file. Output filenames
 * match the source basename (e.g. 01-extension-db.mmd → 01-extension-db.png
 * + 01-extension-db.svg).
 *
 * Uses @mermaid-js/mermaid-cli via npx (no permanent dev dependency).
 * Sequential, fail-fast — honors mem://constraints/no-retry-policy.
 *
 * Usage:
 *   node scripts/render-db-diagrams.mjs
 */

import { readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join, basename, extname } from "node:path";

const ROOT = resolve(process.cwd());
const DIAGRAMS_DIR = join(ROOT, "spec/23-database/diagrams");
const IMAGES_DIR = join(ROOT, "spec/23-database/images");
const CHECK_ONLY = process.argv.includes("--check");

if (!existsSync(DIAGRAMS_DIR)) {
    console.error(`[render-db-diagrams] Missing source folder: ${DIAGRAMS_DIR}`);
    console.error("  Reason: spec/23-database/diagrams/ was not found.");
    process.exit(1);
}

mkdirSync(IMAGES_DIR, { recursive: true });

const sources = readdirSync(DIAGRAMS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mmd"))
    .sort();

if (sources.length === 0) {
    console.warn(`[render-db-diagrams] No .mmd files found in ${DIAGRAMS_DIR}`);
    process.exit(0);
}

console.log(
    `[render-db-diagrams] ${CHECK_ONLY ? "Checking" : "Rendering"} ${sources.length} diagram(s) → ${IMAGES_DIR}`,
);

/** Output formats per source file. SVG is vector, PNG is raster. */
const FORMATS = ["png", "svg"];

if (CHECK_ONLY) {
    /**
     * Drift check — every .mmd MUST have sibling .png + .svg, and each image
     * mtime MUST be >= source mtime. Sequential, fail-fast (no retry/backoff,
     * honoring mem://constraints/no-retry-policy).
     */
    let drift = 0;
    for (const src of sources) {
        const srcPath = join(DIAGRAMS_DIR, src);
        const srcMtime = statSync(srcPath).mtimeMs;
        const stem = basename(src, extname(src));
        for (const fmt of FORMATS) {
            const outPath = join(IMAGES_DIR, `${stem}.${fmt}`);
            if (!existsSync(outPath)) {
                drift += 1;
                console.error(`  ✖ MISSING: ${outPath}`);
                console.error(`    Source : ${srcPath}`);
                console.error(`    Reason : sibling ${fmt.toUpperCase()} export not found`);
                continue;
            }
            const outMtime = statSync(outPath).mtimeMs;
            if (outMtime < srcMtime) {
                drift += 1;
                console.error(`  ✖ STALE  : ${outPath}`);
                console.error(`    Source : ${srcPath}`);
                console.error(`    Reason : source modified after image (re-run \`npm run db:diagrams\`)`);
            } else {
                console.log(`  ✓ ${stem}.${fmt}`);
            }
        }
    }
    if (drift > 0) {
        console.error(`[render-db-diagrams] ${drift} drift issue(s). Run \`npm run db:diagrams\` to regenerate.`);
        process.exit(1);
    }
    console.log("[render-db-diagrams] Images in sync with sources.");
    process.exit(0);
}

let failures = 0;
for (const src of sources) {
    const srcPath = join(DIAGRAMS_DIR, src);
    const stem = basename(src, extname(src));
    for (const fmt of FORMATS) {
        const outPath = join(IMAGES_DIR, `${stem}.${fmt}`);
        console.log(`  • ${src} → ${basename(outPath)}`);
        const result = spawnSync(
            "npx",
            [
                "--yes",
                "@mermaid-js/mermaid-cli",
                "-i", srcPath,
                "-o", outPath,
                "-t", "dark",
                "-b", "#222222",
                "--width", "1600",
                "-p", join(DIAGRAMS_DIR, ".puppeteer.json"),
            ],
            { stdio: "inherit", shell: process.platform === "win32" },
        );
        if (result.status !== 0) {
            failures += 1;
            console.error(`    ✖ FAILED to render ${src} → ${fmt.toUpperCase()} (exit ${result.status ?? "n/a"})`);
            console.error(`      Source: ${srcPath}`);
            console.error(`      Output: ${outPath}`);
        }
    }
}

if (failures > 0) {
    console.error(`[render-db-diagrams] ${failures} diagram(s) failed.`);
    process.exit(1);
}
console.log("[render-db-diagrams] Done.");
