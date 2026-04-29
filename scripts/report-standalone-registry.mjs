#!/usr/bin/env node
/**
 * Standalone Registry Report
 * --------------------------
 * Inventories every standalone script under `standalone-scripts/` and
 * checks whether each one is wired into every orchestration source-of-
 * truth file. A "fully wired" script appears in ALL of:
 *
 *   1. package.json `scripts` — `build:<name>` entry
 *   2. package.json `scripts` — referenced by `build:extension` chain
 *   3. scripts/build-standalone.mjs — listed in PROJECTS / similar registry
 *   4. scripts/check-standalone-dist.mjs — listed in REQUIRED_ARTIFACTS
 *   5. tsconfig.<name>.json — present at repo root
 *   6. vite.config.<name>.ts — present at repo root
 *   7. .github/workflows/ci.yml — has a `build-<name>` job
 *
 * Modes
 * -----
 * default  — Print the matrix, exit 0 even when gaps exist.
 * --strict — CI-only flag. Exit 1 on ANY missing wiring location, with
 *            inline `::error file=…,title=…::` annotations so the gap
 *            shows up on the PR diff. Designed to be the FIRST diagnostic
 *            job in CI so wiring regressions block the pipeline in <1s,
 *            long before the heavier build-* jobs would surface them.
 * --json   — Emit a stable, schema-versioned JSON report on stdout
 *            (no human-readable sections). Combine with `--strict` to
 *            fail the process on any gap while still producing the
 *            machine-readable payload (`exitCode` is also embedded
 *            inside the JSON for downstream parsers). See
 *            `emitJsonReport()` for the full schema.
 *
 * Excluded folders (not real standalone scripts):
 *   _generated, types, prompts (prompts is content-only, no build entry)
 *
 * Author: Riseup Asia LLC
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const STANDALONE_DIR = path.join(REPO_ROOT, "standalone-scripts");

const STRICT = process.argv.includes("--strict");
const JSON_MODE = process.argv.includes("--json");
const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

/** Folders inside standalone-scripts/ that are NOT discoverable as a standalone script. */
const EXCLUDED_FOLDERS = new Set(["_generated", "types", "prompts"]);

/**
 * Locations every script must appear in. Stable, ordered for the
 * matrix header AND for the JSON `locations[]` / `locationsRegistry`
 * fields. Each entry carries:
 *   - `key`     — stable identifier; pinned by schemaVersion
 *   - `label`   — short human-readable column header (matrix + JSON)
 *   - `meaning` — one-sentence explanation of WHAT this location means
 *                 (i.e. what is checked, why it must exist). Surfaced
 *                 in the JSON `locationsRegistry` so external tools
 *                 can render the matrix without round-tripping back
 *                 to this file for documentation.
 *   - `fixFile` — repo-relative path of the file that must be edited
 *                 to satisfy this location (mirrors `fixHint(...).file`
 *                 but available without knowing the script name).
 *                 `null` when the path is per-script (tsconfig/vite).
 */
const LOCATIONS = [
    {
        key: "pkgScript",
        label: "package.json scripts.build:<name>",
        meaning: "A `build:<scriptName>` entry exists in root package.json `scripts` so the script can be built individually (and chained from `build:extension`).",
        fixFile: "package.json",
    },
    {
        key: "pkgExtensionChain",
        label: "package.json build:extension chain",
        meaning: "The root `build:extension` script either invokes `build:<scriptName>` or compiles `standalone-scripts/<scriptName>` so the extension build always picks up this script's dist.",
        fixFile: "package.json",
    },
    {
        key: "buildStandalone",
        label: "scripts/build-standalone.mjs",
        meaning: "The script name appears in the PROJECTS array of `scripts/build-standalone.mjs` so the orchestrator that builds every standalone in one pass includes it.",
        fixFile: "scripts/build-standalone.mjs",
    },
    {
        key: "checkDist",
        label: "scripts/check-standalone-dist.mjs",
        meaning: "The script name appears in `REQUIRED_ARTIFACTS` of `scripts/check-standalone-dist.mjs` so the post-build dist gate verifies its bundle and instruction.json exist.",
        fixFile: "scripts/check-standalone-dist.mjs",
    },
    {
        key: "tsconfig",
        label: "tsconfig.<name>.json",
        meaning: "A `tsconfig.<scriptName>.json` file exists at the repo root so the script has its own typecheck scope (extends the standalone base).",
        fixFile: null,
    },
    {
        key: "viteConfig",
        label: "vite.config.<name>.ts",
        meaning: "A `vite.config.<scriptName>.ts` file exists at the repo root so the script has its own bundle config that emits an IIFE bundle to `standalone-scripts/<scriptName>/dist/`.",
        fixFile: null,
    },
    {
        key: "ciJob",
        label: ".github/workflows/ci.yml build-<name>",
        meaning: "A `build-<scriptName>:` job exists in `.github/workflows/ci.yml` so CI builds and uploads the dist artifact that downstream jobs (`build-extension`, e2e) depend on.",
        fixFile: ".github/workflows/ci.yml",
    },
];

// ───────────────────────── helpers ──────────────────────────────────

function readFileSafe(filePath) {
    if (!fs.existsSync(filePath)) {
        return "";
    }

    return fs.readFileSync(filePath, "utf8");
}

function discoverScripts() {
    if (!fs.existsSync(STANDALONE_DIR)) {
        console.error(`[FAIL] standalone-scripts dir missing — expected at ${STANDALONE_DIR}`);
        process.exit(1);
    }

    return fs.readdirSync(STANDALONE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !EXCLUDED_FOLDERS.has(entry.name))
        .map((entry) => entry.name)
        .sort();
}

/**
 * Returns a record of { [locationKey]: boolean } for the given script name.
 */
function checkWiring(scriptName) {
    const pkgJson = JSON.parse(readFileSafe(path.join(REPO_ROOT, "package.json")) || "{}");
    const buildKey = `build:${scriptName}`;
    const buildScript = pkgJson?.scripts?.[buildKey] ?? "";
    const extensionScript = pkgJson?.scripts?.["build:extension"] ?? "";

    const buildStandaloneSrc = readFileSafe(path.join(REPO_ROOT, "scripts/build-standalone.mjs"));
    const checkDistSrc = readFileSafe(path.join(REPO_ROOT, "scripts/check-standalone-dist.mjs"));
    const ciYmlSrc = readFileSafe(path.join(REPO_ROOT, ".github/workflows/ci.yml"));

    const tsconfigPath = path.join(REPO_ROOT, `tsconfig.${scriptName}.json`);
    const viteConfigPath = path.join(REPO_ROOT, `vite.config.${scriptName}.ts`);

    return {
        pkgScript: typeof buildScript === "string" && buildScript.length > 0,
        pkgExtensionChain:
            extensionScript.includes(`standalone-scripts/${scriptName}`) ||
            extensionScript.includes(`build:${scriptName}`),
        buildStandalone:
            buildStandaloneSrc.includes(`"${scriptName}"`) ||
            buildStandaloneSrc.includes(`'${scriptName}'`) ||
            buildStandaloneSrc.includes(`standalone-scripts/${scriptName}`),
        checkDist:
            checkDistSrc.includes(`"${scriptName}"`) ||
            checkDistSrc.includes(`'${scriptName}'`),
        tsconfig: fs.existsSync(tsconfigPath),
        viteConfig: fs.existsSync(viteConfigPath),
        ciJob:
            ciYmlSrc.includes(`build-${scriptName}:`) ||
            ciYmlSrc.includes(`build-${scriptName.replace(/-/g, "")}:`),
    };
}

function fixHint(locationKey, scriptName) {
    switch (locationKey) {
        case "pkgScript":
            return {
                file: "package.json",
                jsonPath: `scripts["build:${scriptName}"]`,
                snippet: `"build:${scriptName}": "node scripts/check-axios-version.mjs && node scripts/compile-instruction.mjs standalone-scripts/${scriptName} && tsc --noEmit -p tsconfig.${scriptName}.json && vite build --config vite.config.${scriptName}.ts && echo Built ${scriptName}.js"`,
            };
        case "pkgExtensionChain":
            return {
                file: "package.json",
                jsonPath: `scripts["build:extension"]`,
                snippet: `… && node scripts/compile-instruction.mjs standalone-scripts/${scriptName} && …`,
            };
        case "buildStandalone":
            return {
                file: "scripts/build-standalone.mjs",
                jsonPath: "PROJECTS array",
                snippet: `"${scriptName}",`,
            };
        case "checkDist":
            return {
                file: "scripts/check-standalone-dist.mjs",
                jsonPath: "REQUIRED_ARTIFACTS",
                snippet: `"${scriptName}": ["${scriptName}.js", "instruction.json"],`,
            };
        case "tsconfig":
            return {
                file: `tsconfig.${scriptName}.json`,
                jsonPath: "(create file)",
                snippet: `{ "extends": "./tsconfig.standalone-base.json", "include": ["standalone-scripts/${scriptName}/src"] }`,
            };
        case "viteConfig":
            return {
                file: `vite.config.${scriptName}.ts`,
                jsonPath: "(create file)",
                snippet: `// Vite config that emits standalone-scripts/${scriptName}/dist/${scriptName}.js as IIFE`,
            };
        case "ciJob":
            return {
                file: ".github/workflows/ci.yml",
                yamlKey: `jobs.build-${scriptName}`,
                snippet: `  build-${scriptName}:\n    name: Build · ${scriptName}\n    needs: build-sdk\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      # … install + run: pnpm run build:${scriptName}\n      - uses: actions/upload-artifact@v4\n        with:\n          name: ${scriptName}-dist\n          path: standalone-scripts/${scriptName}/dist/`,
            };
        default:
            return { file: "(unknown)", snippet: "" };
    }
}

// ───────────────────────── report ───────────────────────────────────

/**
 * Stable JSON schema emitted by `--json`. Versioned so downstream
 * consumers (CI annotators, dashboards, slack bots) can pin against
 * `schemaVersion` and detect breaking changes.
 *
 * Top-level shape:
 *   {
 *     schemaVersion: "1.0",
 *     mode: "strict" | "report-only",
 *     generatedAt: ISO-8601 string,
 *     repoRoot: absolute path,
 *     totals: { scripts, fullyWired, withGaps, gapCount },
 *     locations: [{ key, label }, …],         ← ordered, matches matrix columns
 *     scripts: [
 *       {
 *         name: "payment-banner-hider",
 *         fullyWired: false,
 *         wiring: { pkgScript: true, … },     ← per-location boolean
 *         gaps: [
 *           {
 *             location: "buildStandalone",    ← matches LOCATIONS[].key
 *             label: "scripts/build-standalone.mjs",
 *             reason: "Missing entry in scripts/build-standalone.mjs PROJECTS array",
 *             fix: {
 *               file: "scripts/build-standalone.mjs",
 *               at: "PROJECTS array",
 *               snippet: "\"payment-banner-hider\","
 *             }
 *           },
 *           …
 *         ]
 *       },
 *       …
 *     ],
 *     exitCode: 0 | 1                         ← what the process WILL exit with
 *   }
 */
function emitJsonReport(matrix) {
    const locations = LOCATIONS.map((loc) => ({ key: loc.key, label: loc.label }));

    // ── locationsRegistry ───────────────────────────────────────────
    // Object keyed by `LOCATIONS[].key` so external tools can do an
    // O(1) lookup for the meaning + fix-target of a gap without
    // re-iterating `locations[]`. Provides the SAME information that
    // is documented inline in the source `LOCATIONS` array, so the
    // JSON payload becomes self-documenting (a consumer never has to
    // round-trip back to this script's source to render a matrix).
    //
    // Schema contract (frozen at schemaVersion 1.1):
    //   {
    //     <key>: {
    //       label:   string,         // mirror of locations[].label
    //       meaning: string,         // one-sentence "what is checked"
    //       fixFile: string | null,  // repo-relative path to edit;
    //                                // null when path is per-script
    //                                // (e.g. tsconfig.<name>.json)
    //     },
    //     …
    //   }
    const locationsRegistry = Object.fromEntries(
        LOCATIONS.map((loc) => [
            loc.key,
            {
                label: loc.label,
                meaning: loc.meaning,
                fixFile: loc.fixFile,
            },
        ])
    );

    const scriptsReport = matrix.map((row) => {
        const gaps = LOCATIONS
            .filter((loc) => !row.wiring[loc.key])
            .map((loc) => {
                const hint = fixHint(loc.key, row.name);
                const at = hint.jsonPath ?? hint.yamlKey ?? null;

                return {
                    location: loc.key,
                    label: loc.label,
                    reason: `Missing entry for "${row.name}" in ${hint.file}${at ? ` (${at})` : ""}`,
                    fix: {
                        file: hint.file,
                        at,
                        snippet: hint.snippet,
                    },
                };
            });

        return {
            name: row.name,
            fullyWired: gaps.length === 0,
            wiring: { ...row.wiring },
            gaps,
        };
    });

    const totalGaps = scriptsReport.reduce((sum, script) => sum + script.gaps.length, 0);
    const withGaps = scriptsReport.filter((script) => !script.fullyWired).length;
    const willExit = STRICT && totalGaps > 0 ? 1 : 0;

    const report = {
        // Bumped 1.0 → 1.1: added top-level `locationsRegistry`.
        // Minor bump (additive, every consumer pinned to ^1 still validates).
        schemaVersion: "1.1",
        mode: STRICT ? "strict" : "report-only",
        generatedAt: new Date().toISOString(),
        repoRoot: REPO_ROOT,
        totals: {
            scripts: scriptsReport.length,
            fullyWired: scriptsReport.length - withGaps,
            withGaps,
            gapCount: totalGaps,
        },
        locations,
        locationsRegistry,
        scripts: scriptsReport,
        exitCode: willExit,
    };

    process.stdout.write(JSON.stringify(report, null, 2) + "\n");

    if (willExit !== 0) {
        process.exit(willExit);
    }
}

function main() {
    const scripts = discoverScripts();
    if (scripts.length === 0) {
        console.error("[FAIL] No standalone scripts discovered. Nothing to report.");
        process.exit(1);
    }

    const matrix = scripts.map((scriptName) => ({
        name: scriptName,
        wiring: checkWiring(scriptName),
    }));

    // ── --json output mode ──────────────────────────────────────────
    // Stable schema for automated debugging / CI annotation pipelines.
    // Bypasses every human-readable section so stdout is parseable.
    // Schema versioned via `schemaVersion` so consumers can pin.
    if (JSON_MODE) {
        emitJsonReport(matrix);

        return;
    }

    // ── Section A: Wiring matrix ────────────────────────────────────
    console.log("\nStandalone Registry Report");
    console.log("══════════════════════════");
    console.log(`Mode: ${STRICT ? "strict (fail on any gap)" : "report-only"}\n`);

    const header = ["script", ...LOCATIONS.map((loc) => loc.key)];
    console.log(header.join(" | "));
    console.log(header.map((column) => "-".repeat(column.length)).join("-+-"));

    let totalGaps = 0;
    const gapsByScript = new Map();

    for (const row of matrix) {
        const cells = LOCATIONS.map((loc) => (row.wiring[loc.key] ? "[✓]" : "[X]"));
        const missing = LOCATIONS.filter((loc) => !row.wiring[loc.key]).map((loc) => loc.key);

        if (missing.length > 0) {
            gapsByScript.set(row.name, missing);
            totalGaps += missing.length;
        }

        console.log([row.name, ...cells].join(" | "));
    }

    // ── Section A2: Fix-it instructions ─────────────────────────────
    if (gapsByScript.size > 0) {
        console.log("\nFix-it instructions");
        console.log("───────────────────");

        for (const [scriptName, missing] of gapsByScript.entries()) {
            console.log(`\n• ${scriptName} — missing ${missing.length} location(s):`);

            for (const locationKey of missing) {
                const hint = fixHint(locationKey, scriptName);
                const target = hint.jsonPath ?? hint.yamlKey ?? "";
                console.log(`    └ ${locationKey}`);
                console.log(`         file:    ${hint.file}`);

                if (target) {
                    console.log(`         at:      ${target}`);
                }

                console.log(`         snippet: ${hint.snippet}`);

                if (STRICT && IS_CI) {
                    const title = `Standalone script "${scriptName}" not wired into ${hint.file}`;
                    const message = `Add to ${target || hint.file}: ${hint.snippet.replace(/\n/g, " ")}`;
                    console.log(`::error file=${hint.file},title=${title}::${message}`);
                }
            }
        }
    }

    // ── GitHub Step Summary (markdown) ──────────────────────────────
    if (process.env.GITHUB_STEP_SUMMARY) {
        const summaryLines = [
            `## 🧭 Standalone Registry Report`,
            ``,
            `Mode: \`${STRICT ? "strict" : "report-only"}\` · Scripts: \`${matrix.length}\` · Gaps: \`${totalGaps}\``,
            ``,
            `| script | ${LOCATIONS.map((loc) => loc.key).join(" | ")} |`,
            `|---|${LOCATIONS.map(() => "---").join("|")}|`,
            ...matrix.map((row) =>
                `| \`${row.name}\` | ${LOCATIONS.map((loc) => (row.wiring[loc.key] ? "✅" : "❌")).join(" | ")} |`,
            ),
        ];

        if (gapsByScript.size > 0) {
            summaryLines.push(``, `### Fix-it`, ``);

            for (const [scriptName, missing] of gapsByScript.entries()) {
                summaryLines.push(`<details><summary><code>${scriptName}</code> — ${missing.length} gap(s)</summary>`, ``);

                for (const locationKey of missing) {
                    const hint = fixHint(locationKey, scriptName);
                    const target = hint.jsonPath ?? hint.yamlKey ?? "";
                    summaryLines.push(
                        `- **${locationKey}** → \`${hint.file}\`${target ? ` at \`${target}\`` : ""}`,
                        ``,
                        "```",
                        hint.snippet,
                        "```",
                        ``,
                    );
                }

                summaryLines.push(`</details>`, ``);
            }
        }

        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join("\n") + "\n");
    }

    // ── Exit policy ─────────────────────────────────────────────────
    if (totalGaps === 0) {
        console.log(`\n[OK] All ${matrix.length} standalone scripts fully wired across ${LOCATIONS.length} locations.`);

        return;
    }

    if (STRICT) {
        console.error(`\n[FAIL] ${totalGaps} wiring gap(s) across ${gapsByScript.size} script(s). Strict mode → exit 1.`);
        process.exit(1);
    }

    console.warn(`\n[WARN] ${totalGaps} wiring gap(s) across ${gapsByScript.size} script(s). Re-run with --strict to fail the build.`);
}

main();
