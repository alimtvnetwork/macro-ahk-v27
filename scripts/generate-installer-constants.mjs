#!/usr/bin/env node
/**
 * generate-installer-constants.mjs
 *
 * Reads scripts/installer-contract.json (the shared source-of-truth for
 * install.sh and install.ps1) and emits two thin constants files:
 *
 *   scripts/installer-constants.sh   — sourced by install.sh
 *   scripts/installer-constants.ps1  — dot-sourced by install.ps1
 *
 * Both installers ALSO carry inline defaults so they keep working when
 * downloaded standalone (curl ... | bash, irm ... | iex). The constants
 * file, when present beside the installer, wins.
 *
 * Run via `npm run installer:contract:gen` or directly:
 *   node scripts/generate-installer-constants.mjs
 *
 * CI runs `scripts/check-installer-contract.mjs` which re-runs this
 * generator into a temp dir and diffs against the committed files —
 * a non-empty diff fails the build (drift detection).
 *
 * Spec contract: spec/14-update/01-generic-installer-behavior.md
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTRACT_PATH = join(__dirname, "installer-contract.json");

/** @typedef {import('./installer-contract.json')} Contract */

/**
 * @param {string} outDir Override for tests/CI; defaults to scripts/.
 * @returns {{ sh: string, ps1: string, shPath: string, ps1Path: string }}
 */
export function generateInstallerConstants(outDir = __dirname) {
    /** @type {any} */
    const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));

    const banner = [
        "# AUTO-GENERATED — DO NOT EDIT BY HAND",
        "# Source: scripts/installer-contract.json",
        "# Regenerate: node scripts/generate-installer-constants.mjs",
        `# Schema: ${contract.schemaVersion}`,
        "",
    ].join("\n");

    // ── Bash ─────────────────────────────────────────────────────────
    const shLines = [
        "#!/usr/bin/env bash",
        banner,
        "# Defaults — env vars override; set only when not already set so that",
        "# install.sh's parameter expansion ${VAR:-fallback} keeps working.",
        "",
        `MARCO_DEFAULT_REPO="${contract.repo.default}"`,
        `MARCO_VERSION_REGEX='${contract.version.regexPosix}'`,
        `MARCO_MAIN_BRANCH_SENTINEL="${contract.version.mainBranchSentinel}"`,
        "",
        "# Endpoints",
        `: "\${${contract.endpoints.apiBase.envVar}:=${contract.endpoints.apiBase.default}}"`,
        `: "\${${contract.endpoints.downloadBase.envVar}:=${contract.endpoints.downloadBase.default}}"`,
        `: "\${${contract.endpoints.mainBranch.envVar}:=${contract.endpoints.mainBranch.default}}"`,
        "",
        "# Exit codes (read-only)",
        ...Object.entries(contract.exitCodes).map(
            ([code, meta]) =>
                `readonly MARCO_EXIT_${meta.name.toUpperCase()}=${code}  # ${meta.specSection}: ${meta.description}`,
        ),
        "",
        "# Checksums",
        `MARCO_CHECKSUMS_FILE="${contract.checksums.fileName}"`,
        `MARCO_CHECKSUMS_ALGO="${contract.checksums.algorithm}"`,
        "",
    ];
    const sh = shLines.join("\n") + "\n";

    // ── PowerShell ───────────────────────────────────────────────────
    const ps1Lines = [
        banner,
        `$script:MarcoDefaultRepo         = '${contract.repo.default}'`,
        `$script:MarcoVersionRegex        = '${contract.version.regexDotnet}'`,
        `$script:MarcoMainBranchSentinel  = '${contract.version.mainBranchSentinel}'`,
        "",
        "# Endpoints (env vars take precedence)",
        `if (-not $env:${contract.endpoints.apiBase.envVar})      { $env:${contract.endpoints.apiBase.envVar}      = '${contract.endpoints.apiBase.default}' }`,
        `if (-not $env:${contract.endpoints.downloadBase.envVar}) { $env:${contract.endpoints.downloadBase.envVar} = '${contract.endpoints.downloadBase.default}' }`,
        `if (-not $env:${contract.endpoints.mainBranch.envVar})   { $env:${contract.endpoints.mainBranch.envVar}   = '${contract.endpoints.mainBranch.default}' }`,
        "",
        "# Exit codes",
        ...Object.entries(contract.exitCodes).map(
            ([code, meta]) =>
                `Set-Variable -Scope Script -Option ReadOnly -Force -Name 'MarcoExit${pascal(meta.name)}' -Value ${code}  # ${meta.specSection}`,
        ),
        "",
        "# Checksums",
        `$script:MarcoChecksumsFile = '${contract.checksums.fileName}'`,
        `$script:MarcoChecksumsAlgo = '${contract.checksums.algorithm}'`,
        "",
    ];
    const ps1 = ps1Lines.join("\n") + "\n";

    const shPath = join(outDir, "installer-constants.sh");
    const ps1Path = join(outDir, "installer-constants.ps1");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(shPath, sh);
    writeFileSync(ps1Path, ps1);

    return { sh, ps1, shPath, ps1Path };
}

function pascal(s) {
    return s
        .split(/[_-]/)
        .filter(Boolean)
        .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
        .join("");
}

// Run if invoked directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    const { shPath, ps1Path } = generateInstallerConstants();
    process.stdout.write(`✓ wrote ${shPath}\n`);
    process.stdout.write(`✓ wrote ${ps1Path}\n`);
}

export { CONTRACT_PATH };
