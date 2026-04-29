#!/usr/bin/env node
/**
 * scripts/assert-standalone-dist.mjs
 * ───────────────────────────────────────────────────────────────────
 * Shared CI gate that asserts a standalone-script dist artifact was
 * downloaded correctly BEFORE the heavy `build:extension` step runs.
 *
 * Extracted from the inline `Assert payment-banner-hider dist artifact
 * present` step in `.github/workflows/ci.yml` so the same precise
 * "what's missing, where, and how to fix it" failure pattern can be
 * reused for every other standalone artifact (sdk, xpath,
 * macro-controller, prompts, …) without copy-pasting 60 lines of
 * shell into each new download step.
 *
 * What it checks (in order — fail-fast, no retries):
 *   1. The dist directory exists
 *   2. The expected JS bundle file exists
 *   3. The bundle is at least `--min-bytes` bytes (default 100)
 *   4. The instruction.json sidecar exists (when `--require-instruction`
 *      is passed; on by default)
 *   5. Reads `version` out of instruction.json so it shows up in the
 *      step summary alongside the SHA-256 of the bundle
 *
 * On failure it emits a `::error file=…,title=…::` GitHub Actions
 * annotation that pins the error to the exact missing file on the
 * PR diff, and embeds the source artifact name + id + browser URL
 * so a reviewer can one-click open the artifact in the Actions UI
 * (matches the per-step traceability pattern already in ci.yml).
 *
 * USAGE
 * ─────
 *   node scripts/assert-standalone-dist.mjs \
 *     --script-name payment-banner-hider \
 *     --dist-dir standalone-scripts/payment-banner-hider/dist \
 *     --bundle payment-banner-hider.js \
 *     --artifact-name payment-banner-hider-dist \
 *     --artifact-id "${{ steps.trace.outputs.artifact_id }}" \
 *     --artifact-url "${{ steps.trace.outputs.browser_download_url }}"
 *
 * Optional flags:
 *   --min-bytes <n>            Minimum bundle size (default: 100)
 *   --require-instruction      Require instruction.json (default: true)
 *   --no-require-instruction   Skip the instruction.json check
 *   --vite-config <path>       Hint shown in the "missing bundle" error
 *
 * EXIT CODES
 *   0  All assertions passed
 *   1  An assertion failed (annotation already emitted)
 *   2  Invalid CLI arguments
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { argv, cwd, env, exit, stdout } from "node:process";

// ───────────────────────── arg parsing ──────────────────────────────

/**
 * Parse `--key value` and `--flag` style CLI args. We intentionally
 * avoid a third-party arg parser so this script has zero deps and
 * runs identically on any Node 18+ runner.
 */
function parseArgs(rawArgs) {
    const parsed = {
        scriptName: null,
        distDir: null,
        bundle: null,
        artifactName: null,
        artifactId: null,
        artifactUrl: null,
        artifactApiUrl: null,
        minBytes: 100,
        requireInstruction: true,
        viteConfig: null,
    };

    for (let i = 0; i < rawArgs.length; i++) {
        const flag = rawArgs[i];
        const next = rawArgs[i + 1];

        switch (flag) {
            case "--script-name":
                parsed.scriptName = next;
                i++;
                break;
            case "--dist-dir":
                parsed.distDir = next;
                i++;
                break;
            case "--bundle":
                parsed.bundle = next;
                i++;
                break;
            case "--artifact-name":
                parsed.artifactName = next;
                i++;
                break;
            case "--artifact-id":
                parsed.artifactId = next;
                i++;
                break;
            case "--artifact-url":
                parsed.artifactUrl = next;
                i++;
                break;
            case "--artifact-api-url":
                parsed.artifactApiUrl = next;
                i++;
                break;
            case "--min-bytes":
                parsed.minBytes = Number.parseInt(next, 10);
                i++;
                break;
            case "--require-instruction":
                parsed.requireInstruction = true;
                break;
            case "--no-require-instruction":
                parsed.requireInstruction = false;
                break;
            case "--vite-config":
                parsed.viteConfig = next;
                i++;
                break;
            default:
                if (flag.startsWith("--")) {
                    fail(`Unknown flag: ${flag}`, 2);
                }
        }
    }

    const missing = [];

    if (!parsed.scriptName) missing.push("--script-name");
    if (!parsed.distDir) missing.push("--dist-dir");
    if (!parsed.bundle) missing.push("--bundle");
    if (!parsed.artifactName) missing.push("--artifact-name");

    if (missing.length > 0) {
        fail(`Missing required flag(s): ${missing.join(", ")}`, 2);
    }

    if (Number.isNaN(parsed.minBytes) || parsed.minBytes < 0) {
        fail(`--min-bytes must be a non-negative integer`, 2);
    }

    return parsed;
}

function fail(message, code) {
    stdout.write(`::error::${message}\n`);
    exit(code);
}

// ───────────────────────── trace block ──────────────────────────────

/**
 * Build the artifact-trace suffix that is embedded into every
 * `::error::` annotation so reviewers can one-click open the
 * artifact that was actually downloaded.
 */
function buildTraceSuffix(args) {
    const parts = [`Source artifact: '${args.artifactName}'`];

    if (args.artifactId) {
        parts.push(`(id=${args.artifactId})`);
    }

    if (args.artifactUrl) {
        parts.push(`— open ${args.artifactUrl} to inspect what was actually uploaded`);
    }

    return parts.join(" ");
}

// ───────────────────────── step summary ─────────────────────────────

function appendStepSummary(rows) {
    const summaryPath = env.GITHUB_STEP_SUMMARY;

    if (!summaryPath) {
        return;
    }

    const lines = [
        `## ✅ Pre-build assertion — ${rows.scriptName} dist`,
        ``,
        `| Field | Value |`,
        `|-------|-------|`,
        `| Bundle path | \`${rows.bundlePath}\` |`,
        `| Size (bytes) | \`${rows.bytes}\` |`,
        `| SHA-256 | \`${rows.sha256}\` |`,
    ];

    if (rows.version) {
        lines.push(`| Version | \`${rows.version}\` |`);
    }

    lines.push(`| Source artifact name | \`${rows.artifactName}\` |`);

    if (rows.artifactId) {
        lines.push(`| Source artifact ID | \`${rows.artifactId}\` |`);
    }

    if (rows.artifactUrl) {
        lines.push(`| Artifact (one-click) | [${rows.artifactUrl}](${rows.artifactUrl}) |`);
    }

    if (rows.artifactApiUrl) {
        lines.push(`| Artifact (API) | \`${rows.artifactApiUrl}\` |`);
    }

    lines.push(``);

    // Append rather than overwrite — other steps in the same job
    // contribute their own summary blocks and we must preserve them.
    // Use synchronous fs from ESM:
    import("node:fs").then(({ appendFileSync }) => {
        appendFileSync(summaryPath, lines.join("\n") + "\n");
    });
}

// ───────────────────────── main ─────────────────────────────────────

function main() {
    const args = parseArgs(argv.slice(2));
    const trace = buildTraceSuffix(args);

    const distDirAbs = resolve(cwd(), args.distDir);
    const bundleAbs = resolve(distDirAbs, args.bundle);
    const instructionAbs = resolve(distDirAbs, "instruction.json");

    stdout.write(`── Asserting ${args.scriptName} dist before extension build ──\n`);
    stdout.write(`DIST_DIR=${distDirAbs}\n`);
    stdout.write(`Source artifact: ${args.artifactName}`);

    if (args.artifactId) {
        stdout.write(` (id=${args.artifactId})`);
    }

    stdout.write(`\n`);

    if (args.artifactUrl) {
        stdout.write(`  browser URL: ${args.artifactUrl}\n`);
    }

    if (args.artifactApiUrl) {
        stdout.write(`  API URL:     ${args.artifactApiUrl}\n`);
    }

    // ── 1. Artifact itself was actually downloaded ──────────────────
    // `actions/download-artifact@v4` exits 0 in several "soft failure"
    // modes that leave us with NO usable files but no error either:
    //   a) The artifact name was a typo → step warns "no artifact
    //      found" and creates an EMPTY directory.
    //   b) The upstream upload step was skipped (e.g. previous job
    //      `if:` was false) → again, empty dir, exit 0.
    //   c) The artifact has expired (>90 days for free tier).
    //   d) `path:` pointed somewhere unexpected and the dir was
    //      never created at all.
    // We must distinguish "the artifact is missing/empty" from
    // "the artifact is present but the bundle file is missing"
    // because the fixes are completely different (re-run upstream
    // job vs. fix the build config).
    const distDirExists = existsSync(distDirAbs);
    const distDirEntries = distDirExists ? readdirSync(distDirAbs) : [];

    if (!distDirExists || distDirEntries.length === 0) {
        const reason = !distDirExists
            ? `directory does not exist`
            : `directory exists but is EMPTY (0 files)`;

        stdout.write(
            `::error file=${args.distDir},title=Artifact '${args.artifactName}' missing or empty::`
            + `Expected files at ${distDirAbs} after downloading artifact '${args.artifactName}'`
            + `${args.artifactId ? ` (id=${args.artifactId})` : ""}, `
            + `but the ${reason}. `
            + `${args.artifactUrl ? `Open ${args.artifactUrl} to inspect what was actually uploaded. ` : ""}`
            + `Likely causes: `
            + `(1) the upstream 'upload-artifact' step in 'build-${args.scriptName}' did not run `
            + `(check that job's status and any 'if:' conditions); `
            + `(2) the artifact name on upload does not match '${args.artifactName}' on download; `
            + `(3) the artifact has expired (>90 days); `
            + `(4) the 'path:' on the download step points to a different directory than this assertion expects.\n`
        );

        exit(1);
    }

    stdout.write(`── Contents of dist dir (${distDirEntries.length} entries) ──\n`);

    for (const entry of distDirEntries) {
        const entryStat = statSync(resolve(distDirAbs, entry));
        stdout.write(`  ${entry}  (${entryStat.size} bytes)\n`);
    }

    // ── 1b. Total artifact payload sanity ──────────────────────────
    // Even with files present, a totally-empty payload (every file
    // 0 bytes) almost always means the upstream build crashed but
    // still uploaded its empty `dist/`. Catch this BEFORE the
    // bundle-specific check so the error message points at the
    // artifact, not the bundle.
    const totalBytes = distDirEntries.reduce(
        (sum, entry) => sum + statSync(resolve(distDirAbs, entry)).size,
        0
    );

    if (totalBytes === 0) {
        stdout.write(
            `::error file=${args.distDir},title=Artifact '${args.artifactName}' is empty (all files 0 bytes)::`
            + `Downloaded artifact '${args.artifactName}'`
            + `${args.artifactId ? ` (id=${args.artifactId})` : ""} `
            + `contains ${distDirEntries.length} file(s) but the total payload is 0 bytes — `
            + `the upstream build for '${args.scriptName}' likely crashed after creating empty output files. `
            + `${args.artifactUrl ? `Open ${args.artifactUrl} to confirm. ` : ""}`
            + `Re-run job 'build-${args.scriptName}' and inspect its build logs.\n`
        );

        exit(1);
    }

    // ── 2. Bundle file present ──────────────────────────────────────
    if (!existsSync(bundleAbs)) {
        const presentFiles = readdirSync(distDirAbs).join(" ");
        const viteHint = args.viteConfig
            ? `Check ${args.viteConfig} → build.rollupOptions.output.entryFileNames is '${args.bundle}' (not hashed).`
            : `Check the project's vite config → build.rollupOptions.output.entryFileNames is '${args.bundle}' (not hashed).`;

        stdout.write(
            `::error file=${args.distDir}/${args.bundle},title=${args.bundle} missing from dist artifact::`
            + `Expected ${bundleAbs} but it was not found. ${trace}. `
            + `Files actually present: ${presentFiles}. ${viteHint}\n`
        );

        exit(1);
    }

    // ── 3. Bundle size sanity check ─────────────────────────────────
    const bytes = statSync(bundleAbs).size;

    if (bytes < args.minBytes) {
        stdout.write(
            `::error file=${args.distDir}/${args.bundle},title=${args.bundle} suspiciously small (${bytes} bytes)::`
            + `Bundle exists but is < ${args.minBytes} bytes — likely a build error produced an empty file. `
            + `${trace}. Re-run build-${args.scriptName}.\n`
        );

        exit(1);
    }

    // ── 4. instruction.json present (optional) ──────────────────────
    let version = null;

    if (args.requireInstruction) {
        if (!existsSync(instructionAbs)) {
            stdout.write(
                `::error file=${args.distDir}/instruction.json,title=instruction.json missing from dist artifact::`
                + `Expected ${instructionAbs}. ${trace}. `
                + `Check that scripts/compile-instruction.mjs ran during build:${args.scriptName}.\n`
            );

            exit(1);
        }

        try {
            const parsed = JSON.parse(readFileSync(instructionAbs, "utf8"));
            version = parsed.version ?? null;
        } catch (parseError) {
            stdout.write(
                `::error file=${args.distDir}/instruction.json,title=instruction.json is not valid JSON::`
                + `Failed to parse ${instructionAbs}: ${parseError.message}. ${trace}.\n`
            );

            exit(1);
        }
    }

    // ── 5. Success ──────────────────────────────────────────────────
    const sha256 = createHash("sha256").update(readFileSync(bundleAbs)).digest("hex");

    stdout.write(`✅ ${args.scriptName} dist verified\n`);
    stdout.write(`   path:    ${bundleAbs}\n`);
    stdout.write(`   bytes:   ${bytes}\n`);
    stdout.write(`   sha256:  ${sha256}\n`);

    if (version) {
        stdout.write(`   version: ${version}\n`);
    }

    appendStepSummary({
        scriptName: args.scriptName,
        bundlePath: bundleAbs,
        bytes,
        sha256,
        version,
        artifactName: args.artifactName,
        artifactId: args.artifactId,
        artifactUrl: args.artifactUrl,
        artifactApiUrl: args.artifactApiUrl,
    });
}

main();
