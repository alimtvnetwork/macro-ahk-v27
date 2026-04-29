#!/usr/bin/env node
/**
 * Preflight: Standalone Registry Wiring
 * -------------------------------------
 * Sequential fail-fast wrapper around `report-standalone-registry.mjs --json`.
 * Designed to run BEFORE the heavy CI jobs (build-*, e2e) so wiring gaps
 * surface in <1s with a precise, copy-pasteable remediation list.
 *
 * For every gap the JSON report exposes, this script prints:
 *   • The exact file path the developer (or AI agent) must create / edit
 *   • The exact token / array entry / job-id that is missing
 *   • A ready-to-paste snippet when the fix is "create a new file"
 *
 * Exit codes
 *   0  — every standalone script is fully wired
 *   1  — at least one gap detected (CI should block)
 *   2  — internal error invoking the underlying report
 *
 * No retry, no backoff (per project no-retry policy). One pass, one verdict.
 *
 * Author: Riseup Asia LLC
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_SCRIPT = path.join(SCRIPT_DIR, "report-standalone-registry.mjs");

function runReport() {
    const result = spawnSync(process.execPath, [REPORT_SCRIPT, "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) {
        console.error(`[preflight] failed to spawn report: ${result.error.message}`);
        process.exit(2);
    }
    if (result.status !== 0 && result.status !== 1) {
        // 0 = report-only OK, 1 = strict gap (we run report-only so 1 shouldn't happen)
        console.error(`[preflight] report exited with unexpected status ${result.status}`);
        if (result.stderr) console.error(result.stderr);
        process.exit(2);
    }
    try {
        return JSON.parse(result.stdout);
    } catch (err) {
        console.error(`[preflight] failed to parse report JSON: ${err.message}`);
        process.exit(2);
    }
}

/**
 * Normalise a single gap entry from the upstream JSON report into
 *   { locationKey, locationLabel, file, at, action, snippet? }
 * The upstream schema (1.1+) emits gap objects with shape:
 *   { location, label, reason, fix: { file, at, snippet? } }
 * We pass through verbatim — the report is the single source of truth for
 * remediation text, so we never re-template what it already provides.
 */
function normaliseGap(gap, registry) {
    if (typeof gap === "string") {
        const meta = registry[gap] ?? {};
        return {
            locationKey: gap,
            locationLabel: meta.label ?? gap,
            file: meta.fixFile ?? "(unknown)",
            at: "(unspecified)",
            action: `Wire into ${meta.label ?? gap}`,
            snippet: null,
        };
    }
    const fix = gap.fix ?? {};
    return {
        locationKey: gap.location ?? "(unknown)",
        locationLabel: gap.label ?? gap.location ?? "(unknown)",
        file: fix.file ?? "(unknown)",
        at: fix.at ?? "(unspecified)",
        action: gap.reason ?? `Wire into ${gap.label ?? gap.location}`,
        snippet: typeof fix.snippet === "string" && fix.snippet.length > 0 ? fix.snippet : null,
    };
}

function main() {
    const report = runReport();
    const registry = report.locationsRegistry ?? {};
    const scripts = Array.isArray(report.scripts) ? report.scripts : [];
    const gappy = scripts.filter((s) => !s.fullyWired);

    console.log("Preflight · Standalone Wiring");
    console.log("══════════════════════════════");
    console.log(`Scripts scanned : ${scripts.length}`);
    console.log(`Fully wired     : ${scripts.length - gappy.length}`);
    console.log(`With gaps       : ${gappy.length}`);
    console.log("");

    if (gappy.length === 0) {
        console.log("✓ All standalone scripts are fully wired. CI may proceed.");
        process.exit(0);
    }

    console.log("✗ Wiring gaps detected. Fix the following BEFORE re-running CI:");
    console.log("");

    for (const script of gappy) {
        console.log(`▸ ${script.name}  (${script.gaps.length} gap${script.gaps.length === 1 ? "" : "s"})`);
        for (const rawGap of script.gaps) {
            const gap = normaliseGap(rawGap, registry);
            console.log(`    • ${gap.locationKey}  —  ${gap.locationLabel}`);
            console.log(`        file   : ${gap.file}`);
            console.log(`        at     : ${gap.at}`);
            console.log(`        action : ${gap.action}`);
            if (gap.snippet) {
                console.log(`        snippet:`);
                for (const line of gap.snippet.split("\n")) {
                    console.log(`            ${line}`);
                }
            }
            // GitHub Actions inline annotation
            if (process.env.GITHUB_ACTIONS === "true") {
                const title = `Standalone wiring gap: ${script.name} · ${gap.locationKey}`;
                console.log(`::error file=${gap.file},title=${title}::${gap.action}`);
            }
        }
        console.log("");
    }

    console.log(`Total gaps: ${gappy.reduce((n, s) => n + s.gaps.length, 0)}`);
    console.log(`Authority : scripts/report-standalone-registry.mjs --strict`);
    process.exit(1);
}

main();