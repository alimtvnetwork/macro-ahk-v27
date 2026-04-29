#!/usr/bin/env node
/**
 * check-readme-hero-layout.mjs
 *
 * STRUCTURAL guardrail for the repo-root readme.md hero block.
 *
 * Where `check-readme-compliance.mjs` validates that the required
 * elements (logo, H1, tagline, badge group markers, badges, hero img)
 * are *present*, this checker locks down their *location and shape*:
 * it forbids future edits from drifting the hero markup out of the
 * single allowed region, or introducing the deprecated patterns that
 * have regressed twice already (`<h1 align="center">` shortcut,
 * a second `<div align="center">` wrapper, badges sprinkled into
 * prose sections, etc.).
 *
 * Spec authority:
 *   spec/01-spec-authoring-guide/11-root-readme-conventions.md §"Hard Rules"
 *
 * Failing exit code (1) when any guardrail is violated, 0 otherwise.
 *
 * Flags:
 *   --json          Emit a machine-readable JSON envelope instead of
 *                   the human-formatted summary.
 *   --file=<path>   Override the README path (default: ./readme.md).
 *
 * Why this is a separate script (not a new check inside
 * check-readme-compliance.mjs):
 *   - Compliance asserts "the required things exist". Guardrail asserts
 *     "the forbidden things do not exist outside the allowed region".
 *     Two different failure modes, two different remediation paths.
 *   - Splitting them keeps each script's output focused: a compliance
 *     failure tells the author what to add, a guardrail failure tells
 *     them what to move/remove.
 *   - CI surfaces the two checks as independent red signals on the PR
 *     checks tab, so a hero-layout regression is never masked by a
 *     compliance pass on unrelated rules.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const fileArg = args.find((a) => a.startsWith("--file="));
const README_PATH = fileArg
    ? resolve(REPO_ROOT, fileArg.slice("--file=".length))
    : resolve(REPO_ROOT, "readme.md");

if (!existsSync(README_PATH)) {
    emitFatal(`readme.md not found at: ${README_PATH}`);
}

const SRC = readFileSync(README_PATH, "utf8");
const LINES = SRC.split(/\r?\n/);

// ─── Locate the allowed hero region ───────────────────────────────────────────
//
// The hero region is delimited by:
//   • opens at the first `<div align="center">` (must be at/near top)
//   • closes at the matching `</div>` BEFORE the first `## ` heading
//
// Anything outside [heroOpen, heroClose] is "prose space" where logo
// images, badges, group markers, and the H1-align shortcut are forbidden.

const heroOpenIdx = LINES.findIndex((l) => /^<div\s+align=["']center["']\s*>/i.test(l.trim()));
const firstH2Idx = LINES.findIndex((l) => /^##\s+/.test(l));

let heroCloseIdx = -1;
if (heroOpenIdx !== -1) {
    for (let i = heroOpenIdx + 1; i < LINES.length; i++) {
        if (firstH2Idx !== -1 && i >= firstH2Idx) break;
        if (/^<\/div>\s*$/i.test(LINES[i].trim())) {
            heroCloseIdx = i;
            // Don't break — pick the LAST </div> before the first ##,
            // so nested or extra closes still resolve to the outermost one.
        }
    }
}

const heroFound = heroOpenIdx !== -1 && heroCloseIdx !== -1;

// Helpers
const inHero = (lineIdx) =>
    heroFound && lineIdx >= heroOpenIdx && lineIdx <= heroCloseIdx;

const checks = [];
const record = (id, label, ok, detail, expected, found) => {
    checks.push({ id, label, ok, detail, expected, found });
};

// ─── Rule 1: Hero region must exist and open at top of file ──────────────────
{
    // Allow leading frontmatter / blank lines, but the hero must open
    // before any prose (## heading) and within the first 5 non-blank lines.
    let firstNonBlank = -1;
    for (let i = 0; i < LINES.length; i++) {
        if (LINES[i].trim().length > 0) { firstNonBlank = i; break; }
    }
    const ok = heroFound && heroOpenIdx === firstNonBlank;
    record(
        "hero-at-top",
        "Hero <div align=\"center\"> opens at top of file",
        ok,
        ok
            ? `hero opens at line ${heroOpenIdx + 1}, closes at line ${heroCloseIdx + 1}`
            : !heroFound
                ? "no balanced <div align=\"center\"> … </div> found before the first ## heading"
                : `hero opens at line ${heroOpenIdx + 1}, but first non-blank line is ${firstNonBlank + 1}`,
        "first non-blank line must be `<div align=\"center\">`",
        heroFound
            ? `hero opens at line ${heroOpenIdx + 1}; first non-blank line is ${firstNonBlank + 1}`
            : "hero region not found",
    );
}

// ─── Rule 2: <div align="center"> wrappers — only hero + Author allowed ──────
//
// Two centered wrappers are legitimate per the spec:
//   1. The hero wrapper at the top of the file.
//   2. An optional centered wrapper INSIDE the `## Author` section,
//      used to center the author's name + role line.
// Any other centered <div> is a guardrail violation (e.g. someone
// centering a mid-document section, which would visually mimic a
// second hero and confuse the page hierarchy).
{
    // Locate Author section bounds (start = `## Author` line; end = next `## ` or EOF).
    const authorStart = LINES.findIndex((l) => /^##\s+Author\b/i.test(l));
    let authorEnd = LINES.length - 1;
    if (authorStart !== -1) {
        for (let i = authorStart + 1; i < LINES.length; i++) {
            if (/^##\s+/.test(LINES[i])) { authorEnd = i - 1; break; }
        }
    }
    const isInAuthor = (i) => authorStart !== -1 && i >= authorStart && i <= authorEnd;

    const allOpens = LINES
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /<div\s+align=["']center["']\s*>/i.test(l));
    const offenders = allOpens.filter(({ i }) => i !== heroOpenIdx && !isInAuthor(i));
    const ok = offenders.length === 0;
    record(
        "single-hero-wrapper",
        "Centered <div> wrappers limited to hero + Author section",
        ok,
        ok
            ? `${allOpens.length} centered <div>(s) — all in allowed regions (hero + Author)`
            : `disallowed centered <div>(s) at line(s): ${offenders.map((o) => o.i + 1).join(", ")}`,
        "`<div align=\"center\">` only inside the hero block or inside the `## Author` section",
        `${allOpens.length} centered wrapper(s); ${offenders.length} outside allowed regions`,
    );
}

// ─── Rule 3: <h1 align="..."> shortcut is forbidden anywhere ─────────────────
{
    const offenders = LINES
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /<h1\b[^>]*\balign=/i.test(l));
    const ok = offenders.length === 0;
    record(
        "no-h1-align-shortcut",
        "No `<h1 align=…>` HTML shortcut",
        ok,
        ok
            ? "no `<h1 align=…>` tags present"
            : `found at line(s): ${offenders.map((o) => o.i + 1).join(", ")}`,
        "use `# H1` markdown inside the centering `<div>` — never `<h1 align=…>`",
        ok ? "none" : `${offenders.length} occurrence(s)`,
    );
}

// ─── Rule 4: Logo/icon/brand <img> only inside hero ──────────────────────────
{
    const LOGO_IMG = /<img\s+[^>]*src=["'][^"']*\b(logo|icon|brand)[^"']*["'][^>]*>/i;
    const LOGO_MD  = /!\[[^\]]*(logo|icon|brand)[^\]]*\]\([^)]+\)/i;
    const offenders = LINES
        .map((l, i) => ({ l, i }))
        .filter(({ l, i }) => (LOGO_IMG.test(l) || LOGO_MD.test(l)) && !inHero(i));
    const ok = offenders.length === 0;
    record(
        "logo-only-in-hero",
        "Logo / icon / brand image only inside hero block",
        ok,
        ok
            ? "no logo/icon/brand image found outside hero"
            : `logo image at line(s): ${offenders.map((o) => o.i + 1).join(", ")} (outside hero)`,
        "every `<img …logo|icon|brand…>` must sit inside the centered hero `<div>`",
        ok ? "none outside hero" : `${offenders.length} outside hero`,
    );
}

// ─── Rule 5: Shields.io / badge images only inside hero ──────────────────────
{
    const BADGE_RE = /(?:!\[[^\]]*\]\([^)]*img\.shields\.io[^)]*\))|(?:<img\s+[^>]*src=["'][^"']*img\.shields\.io[^"']*["'][^>]*>)/i;
    const offenders = LINES
        .map((l, i) => ({ l, i }))
        .filter(({ l, i }) => BADGE_RE.test(l) && !inHero(i));
    const ok = offenders.length === 0;
    record(
        "badges-only-in-hero",
        "Badge images (shields.io) only inside hero block",
        ok,
        ok
            ? "no shields.io badge found outside hero"
            : `badge image at line(s): ${offenders.map((o) => o.i + 1).join(", ")} (outside hero)`,
        "every `img.shields.io/…` badge image must sit inside the centered hero `<div>`",
        ok ? "none outside hero" : `${offenders.length} outside hero`,
    );
}

// ─── Rule 6: Group HTML comment markers only inside hero ─────────────────────
{
    const GROUP_MARKERS = [
        "Build & Release",
        "Repo activity",
        "Community",
        "Code-quality",
        "Stack & standards",
    ];
    const offenders = [];
    LINES.forEach((l, i) => {
        for (const grp of GROUP_MARKERS) {
            // Escape regex metacharacters in marker (& is literal).
            const safe = grp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`<!--\\s*${safe}\\s*-->`, "i");
            if (re.test(l) && !inHero(i)) {
                offenders.push({ i, marker: grp });
            }
        }
    });
    const ok = offenders.length === 0;
    record(
        "group-markers-only-in-hero",
        "Badge group HTML comment markers only inside hero block",
        ok,
        ok
            ? "all group markers sit inside hero"
            : `markers outside hero: ${offenders.map((o) => `line ${o.i + 1} (${o.marker})`).join(", ")}`,
        "the five badge group HTML comment markers belong only inside the hero `<div>`",
        ok ? "none outside hero" : `${offenders.length} outside hero`,
    );
}

// ─── Rule 7: Hero closes BEFORE the first ## section ─────────────────────────
{
    const ok = heroFound && (firstH2Idx === -1 || heroCloseIdx < firstH2Idx);
    record(
        "hero-closes-before-prose",
        "Hero `</div>` closes before the first `## ` section",
        ok,
        ok
            ? firstH2Idx === -1
                ? "no `## ` section in file (vacuously satisfied)"
                : `hero closes at line ${heroCloseIdx + 1}; first ## at line ${firstH2Idx + 1}`
            : `hero close at line ${heroCloseIdx + 1} is at/after first ## at line ${firstH2Idx + 1}`,
        "the hero `</div>` line index must be strictly less than the first `## ` heading line index",
        heroFound && firstH2Idx !== -1
            ? `hero close: ${heroCloseIdx + 1}; first ##: ${firstH2Idx + 1}`
            : "n/a",
    );
}

// ─── Output ──────────────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
const ok = failed === 0;

if (JSON_MODE) {
    process.stdout.write(JSON.stringify({
        version: 1,
        ok,
        file: README_PATH,
        summary: { passed, failed, total: checks.length },
        checks,
    }, null, 2) + "\n");
} else {
    const RULE = "─".repeat(72);
    console.log("");
    console.log(`README hero-layout guardrail — ${relativeToRepo(README_PATH)}`);
    console.log(RULE);
    for (const c of checks) {
        const icon = c.ok ? "✅" : "❌";
        console.log(`  ${icon}  ${c.label}`);
        if (!c.ok) {
            console.log(`         expected: ${c.expected}`);
            console.log(`         found:    ${c.found}`);
            console.log(`         detail:   ${c.detail}`);
        }
    }
    console.log(RULE);
    console.log(`  ${passed}/${checks.length} guardrails passed`);
    console.log("");
    if (!ok) {
        console.log("  → Spec: spec/01-spec-authoring-guide/11-root-readme-conventions.md §\"Hard Rules\"");
        console.log("  → Move the offending markup back inside the hero `<div align=\"center\">`,");
        console.log("    or remove it if it duplicates the canonical hero element.");
        console.log("");
    }
}

process.exit(ok ? 0 : 1);

// ─── helpers ─────────────────────────────────────────────────────────────────
function relativeToRepo(p) {
    return p.startsWith(REPO_ROOT) ? p.slice(REPO_ROOT.length + 1) : p;
}
function emitFatal(msg) {
    if (JSON_MODE) {
        process.stdout.write(JSON.stringify({ version: 1, ok: false, error: msg }) + "\n");
    } else {
        console.error(`::error::${msg}`);
    }
    process.exit(1);
}
