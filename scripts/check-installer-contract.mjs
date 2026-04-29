#!/usr/bin/env node
/**
 * check-installer-contract.mjs
 *
 * Drift detector for the shared installer contract.
 *
 * Verifies, in order:
 *   1. scripts/installer-constants.{sh,ps1} are byte-identical to a
 *      fresh re-generation from scripts/installer-contract.json. If
 *      not, someone edited the generated file by hand or forgot to
 *      regenerate after editing the contract.
 *   2. Every `exit <N>` literal in install.sh appears in the contract's
 *      exitCodes set.
 *   3. Every `exit <N>` literal in install.ps1 appears in the contract.
 *   4. Every long flag declared in install.sh (in the argparse case
 *      block) appears in the contract's flags map. Same for the
 *      PowerShell -Switch / -String parameters in install.ps1.
 *   5. The default repo strings hardcoded in install.sh and install.ps1
 *      either match the contract or are sourced from the contract via
 *      ${MARCO_DEFAULT_REPO:-…} / $script:MarcoDefaultRepo fallback.
 *
 * Exits 0 on success, 1 on any drift. On failure, prints a CI-friendly
 * report grouped by section, with `file:line` citations, expected vs.
 * actual values, and a unified per-line diff for sync mismatches.
 *
 * Wire into CI alongside the existing check-* scripts.
 */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { generateInstallerConstants } from "./generate-installer-constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTRACT_PATH = join(__dirname, "installer-contract.json");
const CONTRACT = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const SH_PATH = join(__dirname, "install.sh");
const PS1_PATH = join(__dirname, "install.ps1");
const SH_CONST = join(__dirname, "installer-constants.sh");
const PS1_CONST = join(__dirname, "installer-constants.ps1");

/**
 * @typedef {Object} Finding
 * @property {string} section       Human label for the failing check (e.g. "Generated constants sync").
 * @property {string} message       One-line summary.
 * @property {string} [location]    `path:line` (or `path`) where the offender lives.
 * @property {string|number|string[]|null} [expected]
 * @property {string|number|string[]|null} [actual]
 * @property {string} [hint]        Operator next-step (e.g. regen command).
 * @property {string} [diff]        Pre-formatted multi-line block (e.g. unified diff).
 */

/** @type {Finding[]} */
const findings = [];

/** Repo-relative path for tidy citations. */
function rel(p) {
    return relative(ROOT, p).replaceAll("\\", "/");
}

/** Find the 1-indexed line number of the first match of `needle` in `source`. */
function lineOf(source, needle) {
    const idx = source.indexOf(needle);
    if (idx === -1) return null;
    return source.slice(0, idx).split("\n").length;
}

/** Find every line number where `regex` matches; returns sorted unique list. */
function linesMatching(source, regex) {
    const lines = source.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) out.push(i + 1);
    }
    return out;
}

/**
 * Tiny line-level unified diff (no fancy LCS — sufficient for the small,
 * mostly-ordered constants files where divergence is contiguous edits).
 * Returns null when the inputs are identical.
 */
function unifiedDiff(expected, actual, label) {
    if (expected === actual) return null;
    const exp = expected.split("\n");
    const act = actual.split("\n");
    const max = Math.max(exp.length, act.length);
    const lines = [`--- expected (${label})`, `+++ actual   (${label})`];
    for (let i = 0; i < max; i++) {
        const e = exp[i];
        const a = act[i];
        if (e === a) {
            // Show 1 line of context on either side of changes only.
            const prevDiffer = i > 0 && exp[i - 1] !== act[i - 1];
            const nextDiffer = i + 1 < max && exp[i + 1] !== act[i + 1];
            if (prevDiffer || nextDiffer) lines.push(`  ${e ?? ""}`);
            continue;
        }
        if (e !== undefined) lines.push(`- ${e}`);
        if (a !== undefined) lines.push(`+ ${a}`);
    }
    return lines.join("\n");
}

// ── 1. Generated files in sync with contract ────────────────────────
const tmp = mkdtempSync(join(tmpdir(), "installer-contract-"));
try {
    const fresh = generateInstallerConstants(tmp);
    const committedSh = readFileSync(SH_CONST, "utf8");
    const committedPs1 = readFileSync(PS1_CONST, "utf8");

    const shDiff = unifiedDiff(fresh.sh, committedSh, "installer-constants.sh");
    if (shDiff !== null) {
        findings.push({
            section: "Generated constants sync",
            message:
                "scripts/installer-constants.sh diverges from a fresh regen",
            location: rel(SH_CONST),
            expected: `byte-identical to generator output (${fresh.sh.length} bytes)`,
            actual: `committed file (${committedSh.length} bytes)`,
            hint: "node scripts/generate-installer-constants.mjs && git add scripts/installer-constants.sh",
            diff: shDiff,
        });
    }

    const ps1Diff = unifiedDiff(
        fresh.ps1,
        committedPs1,
        "installer-constants.ps1",
    );
    if (ps1Diff !== null) {
        findings.push({
            section: "Generated constants sync",
            message:
                "scripts/installer-constants.ps1 diverges from a fresh regen",
            location: rel(PS1_CONST),
            expected: `byte-identical to generator output (${fresh.ps1.length} bytes)`,
            actual: `committed file (${committedPs1.length} bytes)`,
            hint: "node scripts/generate-installer-constants.mjs && git add scripts/installer-constants.ps1",
            diff: ps1Diff,
        });
    }
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

// ── 2 & 3. exit code drift ──────────────────────────────────────────
const allowedExits = new Set(Object.keys(CONTRACT.exitCodes).map(Number));
const sh = readFileSync(SH_PATH, "utf8");
const ps1 = readFileSync(PS1_PATH, "utf8");

function checkExits(filePath, source) {
    const re = /(?:^|[^\w])exit\s+(\d+)\b/g;
    const lines = source.split("\n");
    /** @type {Map<number, number[]>} code -> line numbers */
    const offenders = new Map();
    for (let i = 0; i < lines.length; i++) {
        const inner = /(?:^|[^\w])exit\s+(\d+)\b/g;
        let m;
        while ((m = inner.exec(lines[i])) !== null) {
            const code = Number(m[1]);
            if (!allowedExits.has(code)) {
                if (!offenders.has(code)) offenders.set(code, []);
                offenders.get(code).push(i + 1);
            }
        }
    }
    void re; // keep original regex doc-comment intent
    if (offenders.size === 0) return;

    for (const [code, lineNums] of offenders) {
        findings.push({
            section: "Exit-code declaration",
            message: `${rel(filePath)} exits with code ${code} but it is not declared in installer-contract.json`,
            location: `${rel(filePath)}:${lineNums.join(",")}`,
            expected: `one of [${[...allowedExits].sort((a, b) => a - b).join(", ")}]`,
            actual: code,
            hint: `Add "${code}" to installer-contract.json → exitCodes (${rel(CONTRACT_PATH)}), or change the source.`,
        });
    }
}
checkExits(SH_PATH, sh);
checkExits(PS1_PATH, ps1);

// ── 4. flag drift ───────────────────────────────────────────────────
const declaredLongFlags = new Set(
    Object.values(CONTRACT.flags)
        .map((f) => f.long)
        .filter(Boolean),
);
const declaredPsFlags = new Set(
    Object.values(CONTRACT.flags)
        .map((f) => f.powershell)
        .filter(Boolean),
);

// install.sh: pull the argparse case block (between "while [[ $# -gt 0" and "esac")
const shFlagRe = /\b(--[a-z][a-z0-9-]*)\)/g;
/** @type {Map<string, number>} flag -> line */
const shFlagLines = new Map();
{
    const lines = sh.split("\n");
    for (let i = 0; i < lines.length; i++) {
        let fm;
        const re = /\b(--[a-z][a-z0-9-]*)\)/g;
        while ((fm = re.exec(lines[i])) !== null) {
            if (!shFlagLines.has(fm[1])) shFlagLines.set(fm[1], i + 1);
        }
    }
}
void shFlagRe;
const shUnknown = [...shFlagLines.keys()].filter(
    (f) => !declaredLongFlags.has(f),
);
for (const flag of shUnknown) {
    findings.push({
        section: "CLI flag declaration",
        message: `install.sh accepts ${flag} but it is not declared in installer-contract.json → flags`,
        location: `${rel(SH_PATH)}:${shFlagLines.get(flag)}`,
        expected: `one of [${[...declaredLongFlags].sort().join(", ")}]`,
        actual: flag,
        hint: `Add a flags entry with long="${flag}" in ${rel(CONTRACT_PATH)}, or remove the case branch.`,
    });
}

// install.ps1: scan the param() block for [switch]$Foo / [string]$Foo
const paramBlock = ps1.match(/param\s*\(([\s\S]*?)\)/);
if (paramBlock) {
    const paramStartLine = lineOf(ps1, paramBlock[0]) ?? 0;
    const psParamRe = /\[(?:switch|string|int|bool)\]\$([A-Z][A-Za-z0-9]*)/g;
    /** @type {Map<string, number>} -Flag -> absolute line */
    const psFlagLines = new Map();
    const innerLines = paramBlock[1].split("\n");
    for (let i = 0; i < innerLines.length; i++) {
        let pm;
        const re = /\[(?:switch|string|int|bool)\]\$([A-Z][A-Za-z0-9]*)/g;
        while ((pm = re.exec(innerLines[i])) !== null) {
            const key = "-" + pm[1];
            if (!psFlagLines.has(key)) psFlagLines.set(key, paramStartLine + i);
        }
    }
    void psParamRe;
    const psUnknown = [...psFlagLines.keys()].filter(
        (f) => !declaredPsFlags.has(f),
    );
    for (const flag of psUnknown) {
        findings.push({
            section: "CLI flag declaration",
            message: `install.ps1 accepts ${flag} but it is not declared in installer-contract.json → flags`,
            location: `${rel(PS1_PATH)}:${psFlagLines.get(flag)}`,
            expected: `one of [${[...declaredPsFlags].sort().join(", ")}]`,
            actual: flag,
            hint: `Add a flags entry with powershell="${flag}" in ${rel(CONTRACT_PATH)}, or remove the param.`,
        });
    }
}

// ── 5. default repo consistency ─────────────────────────────────────
const expectedRepo = CONTRACT.repo.default;
const shRepoRe = /REPO="\$\{MARCO_DEFAULT_REPO:-([^}]+)\}"/;
const shMatch = sh.match(shRepoRe);
if (!shMatch) {
    findings.push({
        section: "Default repo consistency",
        message:
            "install.sh no longer reads REPO via ${MARCO_DEFAULT_REPO:-…}",
        location: rel(SH_PATH),
        expected: 'REPO="${MARCO_DEFAULT_REPO:-<contract default>}"',
        actual: "(pattern not found)",
        hint: "Restore the env-var indirection so the contract can override REPO.",
    });
} else if (shMatch[1] !== expectedRepo) {
    findings.push({
        section: "Default repo consistency",
        message: "install.sh fallback repo disagrees with contract",
        location: `${rel(SH_PATH)}:${lineOf(sh, shMatch[0])}`,
        expected: expectedRepo,
        actual: shMatch[1],
        hint: `Update the inline fallback to '${expectedRepo}' (must match installer-contract.json → repo.default).`,
    });
}

if (!ps1.includes("$script:MarcoDefaultRepo")) {
    findings.push({
        section: "Default repo consistency",
        message: "install.ps1 no longer references $script:MarcoDefaultRepo",
        location: rel(PS1_PATH),
        expected: "$script:MarcoDefaultRepo = '<contract default>'",
        actual: "(symbol not found)",
        hint: "Restore the script-scoped fallback so the contract can drive the repo.",
    });
}
const ps1FallbackRe = /\$script:MarcoDefaultRepo\s*=\s*'([^']+)'/g;
let pmRepo;
while ((pmRepo = ps1FallbackRe.exec(ps1)) !== null) {
    if (pmRepo[1] !== expectedRepo) {
        findings.push({
            section: "Default repo consistency",
            message: "install.ps1 fallback repo disagrees with contract",
            location: `${rel(PS1_PATH)}:${lineOf(ps1, pmRepo[0])}`,
            expected: expectedRepo,
            actual: pmRepo[1],
            hint: `Update the fallback to '${expectedRepo}' (must match installer-contract.json → repo.default).`,
        });
    }
}

// ── Result ──────────────────────────────────────────────────────────
if (findings.length === 0) {
    process.stdout.write(
        "✓ installer-contract.json in sync with install.sh + install.ps1\n",
    );
    process.exit(0);
}

renderReport(findings);
process.exit(1);

/** Render findings grouped by section with field-by-field detail. */
function renderReport(items) {
    const bySection = new Map();
    for (const f of items) {
        if (!bySection.has(f.section)) bySection.set(f.section, []);
        bySection.get(f.section).push(f);
    }

    const out = [];
    out.push("");
    out.push(
        `✗ Installer contract drift detected — ${items.length} finding(s) across ${bySection.size} section(s)`,
    );
    out.push("  Source of truth: " + rel(CONTRACT_PATH));
    out.push("");

    let n = 0;
    for (const [section, group] of bySection) {
        out.push(`▌ ${section}  (${group.length})`);
        out.push("─".repeat(72));
        for (const f of group) {
            n++;
            out.push(`  ${n}. ${f.message}`);
            if (f.location) out.push(`       at: ${f.location}`);
            if (f.expected !== undefined) {
                out.push(`     want: ${formatValue(f.expected)}`);
            }
            if (f.actual !== undefined) {
                out.push(`      got: ${formatValue(f.actual)}`);
            }
            if (f.hint) out.push(`     hint: ${f.hint}`);
            if (f.diff) {
                out.push("     diff:");
                for (const line of f.diff.split("\n")) {
                    out.push(`       ${line}`);
                }
            }
            out.push("");
        }
    }

    out.push(
        "Re-run after fixing:  node scripts/check-installer-contract.mjs",
    );
    out.push("");
    process.stderr.write(out.join("\n"));
}

function formatValue(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return JSON.stringify(v);
    if (typeof v === "string") return v;
    return String(v);
}
