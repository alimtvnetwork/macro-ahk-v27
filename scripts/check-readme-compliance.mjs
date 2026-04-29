#!/usr/bin/env node
/**
 * check-readme-compliance.mjs
 *
 * Validates that the repository-root readme.md follows the mandatory
 * structure defined in:
 *   spec/01-spec-authoring-guide/11-root-readme-conventions.md
 *
 * Failing exit code (1) when any rule is violated, 0 otherwise.
 *
 * Flags:
 *   --json              Emit a machine-readable JSON envelope (version: 2) to
 *                       stdout instead of human-formatted output.
 *   --file=<path>       Override the README path (default: ./readme.md).
 *   --report=<path>     Additionally write a human-readable Markdown
 *                       compliance report to <path>. Includes per-check
 *                       expected vs found for failures, plus a passed
 *                       summary. Works alongside --json or default output.
 *
 * JSON schema (version 2 — additive over v1):
 *   {
 *     "version": 2,
 *     "ok": boolean,
 *     "file": "<absolute-path>",
 *     "summary": { "passed": N, "failed": N, "total": N },
 *     "checks": [
 *       {
 *         "id": "...",
 *         "label": "...",
 *         "ok": true|false,
 *         "detail": "...",       // free-text human message (v1 compat)
 *         "expected": "...",     // NEW in v2 — what the rule requires
 *         "found": "..."         // NEW in v2 — what was actually present
 *       }
 *     ]
 *   }
 *
 * Spec authority: spec/01-spec-authoring-guide/11-root-readme-conventions.md
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ─── CLI Args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_MODE = args.includes("--json");
const fileArg = args.find((a) => a.startsWith("--file="));
const reportArg = args.find((a) => a.startsWith("--report="));
const README_PATH = fileArg
    ? resolve(REPO_ROOT, fileArg.slice("--file=".length))
    : resolve(REPO_ROOT, "readme.md");
const REPORT_PATH = reportArg
    ? resolve(REPO_ROOT, reportArg.slice("--report=".length))
    : null;

// ─── Mandatory Inventory (from 11-root-readme-conventions.md) ────────────────
// 2026-04-22 — minimums lowered after audit removed all placeholder /
// "no status" / "not found" / static `img.shields.io/badge/…` mockup badges
// (see mem://constraints/no-static-mockup-badges). Each group must still be
// PRESENT (HTML comment marker required) but may legitimately contain zero
// badges if no live-data badge exists for that category yet — the `min`
// gate only fails when the marker is missing OR when the live count is
// below the new floor.
const BADGE_GROUPS = [
    { id: "build-release", label: "Build & Release",     comment: "Build & Release",     min: 1 },
    { id: "repo-activity", label: "Repo activity",       comment: "Repo activity",       min: 1 },
    { id: "community",     label: "Community",           comment: "Community",           min: 0 },
    { id: "code-quality",  label: "Code-quality",        comment: "Code-quality",        min: 1 },
    { id: "stack-stds",    label: "Stack & standards",   comment: "Stack & standards",   min: 1 },
];
const TOTAL_BADGE_MIN = 5; // floor: 1 CI + 1 activity + 1 quality + 1 stack + 1 license-equivalent

// ─── Load README ─────────────────────────────────────────────────────────────
if (!existsSync(README_PATH)) {
    fail(`readme.md not found at: ${README_PATH}`);
}
const raw = readFileSync(README_PATH, "utf8");
const lines = raw.split(/\r?\n/);

// `linesNoCode` mirrors `lines` but lines that fall inside a fenced code block
// (``` … ``` or ~~~ … ~~~) are blanked out. This prevents shell `# comment` and
// example markdown headings inside code samples from polluting H1/heading
// detection. Indentation level is preserved so line numbers stay stable.
const linesNoCode = (() => {
    const out = new Array(lines.length);
    let inFence = false;
    let fenceMarker = "";
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const fenceMatch = l.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (fenceMatch) {
            const marker = fenceMatch[1][0];
            if (!inFence) { inFence = true; fenceMarker = marker; out[i] = ""; continue; }
            if (inFence && marker === fenceMarker) { inFence = false; fenceMarker = ""; out[i] = ""; continue; }
        }
        out[i] = inFence ? "" : l;
    }
    return out;
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findH1Index() {
    for (let i = 0; i < linesNoCode.length; i++) {
        if (/^# (?!#)/.test(linesNoCode[i])) return i;
    }
    return -1;
}

function countH1() {
    return linesNoCode.filter((l) => /^# (?!#)/.test(l)).length;
}

function sectionBetween(commentLabel) {
    // Treat the entire file as one string so badges placed on the SAME line
    // as their `<!-- Group -->` marker (single-line collapsed hero rows) are
    // still attributed to the correct group. The body of a group spans from
    // the end of its own marker until the start of the NEXT HTML comment
    // (whichever group it belongs to) or end of file.
    const startRe = new RegExp(`<!--\\s*${escapeRe(commentLabel)}[^>]*-->`, "i");
    const startMatch = startRe.exec(raw);
    if (!startMatch) return null;
    const startOffset = startMatch.index;
    const bodyStart = startMatch.index + startMatch[0].length;
    const nextCommentRe = /<!--[^]*?-->/g;
    nextCommentRe.lastIndex = bodyStart;
    const nextMatch = nextCommentRe.exec(raw);
    const bodyEnd = nextMatch ? nextMatch.index : raw.length;
    // Compute startIdx / endIdx in line numbers (best-effort, used only by the
    // closing-div check downstream which still works with approximate ranges).
    const before = raw.slice(0, startOffset).split(/\r?\n/);
    const startIdx = before.length - 1;
    const beforeEnd = raw.slice(0, bodyEnd).split(/\r?\n/);
    const endIdx = beforeEnd.length - 1;
    return { startIdx, endIdx, body: raw.slice(bodyStart, bodyEnd) };
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countBadges(body) {
    if (!body) return 0;
    const re = /!\[[^\]]*\]\([^)]+\)/g;
    return (body.match(re) ?? []).length;
}

// ─── Checks ──────────────────────────────────────────────────────────────────
const checks = [];

/**
 * Record a compliance check. `expected` and `found` are NEW in v2 and feed
 * directly into the markdown report's "Expected vs Found" table.
 *
 * @param {string} id
 * @param {string} label
 * @param {boolean} ok
 * @param {string} detail   - free-text human message (kept for v1 compat)
 * @param {string} expected - one-line statement of what the rule requires
 * @param {string} found    - one-line statement of what was actually present
 */
function record(id, label, ok, detail, expected = "", found = "") {
    checks.push({ id, label, ok, detail, expected, found });
}

// 1. Single H1
{
    const count = countH1();
    record(
        "single-h1",
        "Exactly one H1 heading",
        count === 1,
        count === 1 ? "1 H1 found" : `Found ${count} H1 headings (expected exactly 1)`,
        "exactly 1 '# ' heading at column 0 (outside code fences)",
        `${count} '# ' heading(s) detected`,
    );
}

// 2. Hero block opens with `<div align="center">` BEFORE the H1
{
    const h1Idx = findH1Index();
    const head = lines.slice(0, h1Idx >= 0 ? h1Idx : Math.min(20, lines.length)).join("\n");
    const ok = h1Idx >= 0 && /<div\s+align=["']center["']\s*>/i.test(head);
    record(
        "centered-hero",
        "Hero wrapped in <div align=\"center\"> before H1",
        ok,
        ok
            ? `<div align="center"> opens at top, H1 at line ${h1Idx + 1}`
            : "Top of file must open with <div align=\"center\"> and the H1 must come AFTER it",
        `<div align="center"> appears in the head block above the first \`# \` heading`,
        h1Idx < 0
            ? "no H1 detected, so hero ordering cannot be verified"
            : ok
                ? `<div align="center"> found above H1 (line ${h1Idx + 1})`
                : `H1 at line ${h1Idx + 1}, but no <div align="center"> precedes it`,
    );
}

// 3. Logo image precedes H1 (anywhere in the head block before H1)
{
    const h1Idx = findH1Index();
    const head = h1Idx > 0 ? lines.slice(0, h1Idx).join("\n") : "";
    const imgRe = /<img\s+[^>]*src=["'][^"']*\b(logo|icon|brand)[^"']*["'][^>]*>/i;
    const mdImgRe = /!\[[^\]]*(logo|icon)[^\]]*\]\([^)]+\)/i;
    const ok = imgRe.test(head) || mdImgRe.test(head);
    record(
        "logo-above-title",
        "Logo image placed above the H1 title",
        ok,
        ok ? "Logo found in hero block above H1" : "No <img …logo…> or ![logo](…) found before the H1 heading",
        `<img src="…logo|icon|brand…"> OR ![logo|icon …](…) above the H1`,
        ok ? "logo image found in hero head" : "no logo/icon image present in the lines above the H1",
    );
}

// 4. Tagline blockquote directly below H1
{
    const h1Idx = findH1Index();
    if (h1Idx < 0) {
        record(
            "tagline-blockquote",
            "Tagline blockquote under H1",
            false,
            "No H1 found, cannot validate tagline",
            "`> tagline` blockquote within 5 lines after the H1",
            "no H1 found, so the tagline cannot be located",
        );
    } else {
        let found = false;
        let foundLine = "";
        for (let i = h1Idx + 1; i < Math.min(h1Idx + 6, lines.length); i++) {
            const l = lines[i];
            if (l.trim() === "") continue;
            if (/^>\s+\S/.test(l)) { found = true; foundLine = l.trim(); break; }
            foundLine = l.trim();
            break;
        }
        record(
            "tagline-blockquote",
            "Tagline blockquote (`> ...`) immediately under H1",
            found,
            found ? "Tagline blockquote present" : "Expected a `> tagline …` blockquote within 5 lines of the H1",
            "`> tagline` blockquote within 5 lines after the H1",
            found
                ? `blockquote found: ${truncate(foundLine, 80)}`
                : foundLine
                    ? `first non-blank line after H1 was: ${truncate(foundLine, 80)}`
                    : "no content found within 5 lines after the H1",
        );
    }
}

// 5. Each badge group present (HTML comment marker) AND meets minimum badge count
for (const grp of BADGE_GROUPS) {
    const section = sectionBetween(grp.comment);
    if (!section) {
        record(
            `group-${grp.id}`,
            `Badge group present: ${grp.label}`,
            false,
            `Missing <!-- ${grp.comment} --> comment marker before the badge block`,
            `<!-- ${grp.comment} --> marker followed by ≥${grp.min} badges`,
            `no <!-- ${grp.comment} --> comment marker found in the file`,
        );
        continue;
    }
    const count = countBadges(section.body);
    record(
        `group-${grp.id}`,
        `${grp.label} group has ≥${grp.min} badges`,
        count >= grp.min,
        `Found ${count} badge(s) in "${grp.label}" group (minimum ${grp.min})`,
        `≥ ${grp.min} badges following the <!-- ${grp.comment} --> marker`,
        `${count} badge(s) found in the "${grp.label}" group`,
    );
}

// 6. Total badge count meets aggregate minimum
{
    const total = countBadges(raw);
    record(
        "badge-total",
        `Total badge count ≥ ${TOTAL_BADGE_MIN}`,
        total >= TOTAL_BADGE_MIN,
        `Found ${total} badge images across the whole README (minimum ${TOTAL_BADGE_MIN})`,
        `≥ ${TOTAL_BADGE_MIN} total badge images across the README`,
        `${total} badge image(s) detected`,
    );
}

// 7. Hero centering div is closed
{
    const firstH2 = linesNoCode.findIndex((l) => /^## /.test(l));
    const head = lines.slice(0, firstH2 > 0 ? firstH2 : lines.length).join("\n");
    const opens = (head.match(/<div\s+align=["']center["']\s*>/gi) ?? []).length;
    const closes = (head.match(/<\/div>/gi) ?? []).length;
    const ok = opens >= 1 && closes >= opens;
    record(
        "hero-div-closed",
        "Centered hero <div> closed before first ## section",
        ok,
        ok
            ? `Hero head has ${opens} opening / ${closes} closing div(s)`
            : `Hero head has ${opens} opening but only ${closes} closing </div> (centering must be terminated before the first ## heading)`,
        "every <div align=\"center\"> in the hero head is closed by a </div> before the first ## heading",
        `${opens} opening <div align="center">, ${closes} closing </div> in the hero head`,
    );
}

// 8. ## Author section exists
const authorHeadingIdx = linesNoCode.findIndex((l) => /^##\s+Author\b/i.test(l));
{
    record(
        "author-section",
        "## Author section present",
        authorHeadingIdx >= 0,
        authorHeadingIdx >= 0
            ? `Found "## Author" at line ${authorHeadingIdx + 1}`
            : "Missing required `## Author` heading",
        "a `## Author` heading exists in the document",
        authorHeadingIdx >= 0
            ? `found at line ${authorHeadingIdx + 1}`
            : "no `## Author` heading detected",
    );
}

// 9. Author block sub-checks
if (authorHeadingIdx >= 0) {
    const authorBlockEnd = (() => {
        for (let i = authorHeadingIdx + 1; i < lines.length; i++) {
            if (/^##\s+/.test(linesNoCode[i])) return i;
        }
        return lines.length;
    })();
    const authorBody = lines.slice(authorHeadingIdx + 1, authorBlockEnd).join("\n");

    // 9a. Centered div containing the H3 author name
    const nameDivRe = /<div\s+align=["']center["']\s*>[\s\S]*?###\s+\[[^\]]+\]\([^)]+\)[\s\S]*?<\/div>/i;
    const nameOk = nameDivRe.test(authorBody);
    record(
        "author-centered-name",
        "Author name centered as ### linked heading",
        nameOk,
        nameOk ? "Centered ### [Name](url) found" : "Expected <div align=\"center\"> containing `### [Full Name](url)`",
        `<div align="center"> wrapping a \`### [Name](url)\` H3`,
        nameOk
            ? "centered linked H3 name found in Author section"
            : "no centered `### [Name](url)` heading detected inside Author section",
    );

    // 9b. Role line: **[Primary](url)** | [Secondary](url), [Company](url)
    const roleLineRe = /\*\*\[[^\]]+\]\([^)]+\)\*\*\s*\|\s*\[[^\]]+\]\([^)]+\)\s*,\s*\[[^\]]+\]\([^)]+\)/;
    const roleOk = roleLineRe.test(authorBody);
    record(
        "author-role-line",
        "Author role line follows mandated format",
        roleOk,
        roleOk
            ? "Role line matches `**[Primary](…)** | [Secondary](…), [Company](…)`"
            : "Role line must match: **[Primary Role](url)** | [Secondary Role](url), [Company](url)",
        "`**[Primary](url)** | [Secondary](url), [Company](url)` line in Author section",
        roleOk ? "role line matches the mandated pattern" : "no line matched the `**[…](…)** | […](…), […](…)` pattern",
    );

    // 9c. Biography
    const yearsRe = /\b\d{1,2}\+?\s*years?\b/i;
    const reputationRe = /\b(stack\s*overflow|linkedin|github|crossover)\b/i;
    const yearsOk = yearsRe.test(authorBody);
    const repOk = reputationRe.test(authorBody);
    record(
        "author-bio",
        "Biography mentions years of experience + reputation source",
        yearsOk && repOk,
        `years-of-experience: ${yearsOk ? "✓" : "✗"}, reputation-link: ${repOk ? "✓" : "✗"}`,
        "biography mentions \"<N> years\" AND links one of: Stack Overflow / LinkedIn / GitHub / Crossover",
        `years-of-experience: ${yearsOk ? "present" : "MISSING"}; reputation source: ${repOk ? "present" : "MISSING"}`,
    );

    // 9d. Author metadata table
    const authorTableRe = /\|\s*\|\s*\|\s*\n\|\s*-+\s*\|\s*-+\s*\|/;
    const tableOk = authorTableRe.test(authorBody);
    record(
        "author-metadata-table",
        "Author 2-column metadata table present",
        tableOk,
        tableOk ? "2-column table with empty header found" : "Expected `|  |  |` header row + `|---|---|` separator",
        "`|  |  |` empty header row followed by `|---|---|` separator (2-col table)",
        tableOk ? "2-column metadata table found" : "no 2-column table with empty header detected",
    );

    // 9e. ### <Company> subsection
    const subHeadings = (authorBody.match(/^###\s+.+$/gm) ?? []);
    const companyOk = subHeadings.length >= 2 && /###\s+\S/.test(subHeadings[1] ?? "");
    record(
        "company-subsection",
        "### <Company> subsection within Author section",
        companyOk,
        subHeadings.length >= 2
            ? `Found ${subHeadings.length} H3 headings in Author section`
            : `Expected at least 2 H3 headings in Author section, found ${subHeadings.length}`,
        "≥ 2 H3 headings inside `## Author` (Author H3 + Company H3)",
        `${subHeadings.length} H3 heading(s) inside Author section`,
    );
} else {
    for (const id of [
        "author-centered-name",
        "author-role-line",
        "author-bio",
        "author-metadata-table",
        "company-subsection",
    ]) {
        record(
            id,
            `(skipped) ${id}`,
            false,
            "Author section missing — cannot validate sub-checks",
            "parent `## Author` section to exist before this sub-check can run",
            "parent `## Author` section is missing — sub-check skipped",
        );
    }
}

// 10. ## License section present + non-empty body
{
    const licIdx = linesNoCode.findIndex((l) => /^##\s+License\b/i.test(l));
    if (licIdx < 0) {
        record(
            "license-section",
            "## License section present",
            false,
            "Missing required `## License` heading at end of README",
            "`## License` heading at end of file with non-empty body (>10 chars)",
            "no `## License` heading detected",
        );
    } else {
        const body = lines.slice(licIdx + 1).join("\n").trim();
        const ok = body.length > 10;
        record(
            "license-section",
            "## License section present with body",
            ok,
            ok ? `License section starts at line ${licIdx + 1}` : "License section is empty",
            "`## License` heading at end of file with non-empty body (>10 chars)",
            ok
                ? `License section starts at line ${licIdx + 1}, body length ${body.length} chars`
                : `License section starts at line ${licIdx + 1}, but body is only ${body.length} char(s)`,
        );
    }
}

// ─── Output ──────────────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.ok).length;
const failed = checks.length - passed;
const ok = failed === 0;

// Optional markdown report
if (REPORT_PATH) {
    try {
        mkdirSync(dirname(REPORT_PATH), { recursive: true });
        writeFileSync(REPORT_PATH, renderMarkdownReport({ ok, passed, failed, checks }), "utf8");
        if (!JSON_MODE) {
            console.log(`[check-readme-compliance] markdown report → ${relative(REPO_ROOT, REPORT_PATH)}`);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (JSON_MODE) {
            // Surface report failure in JSON envelope as a synthetic check.
            checks.push({
                id: "report-write",
                label: "Write markdown report",
                ok: false,
                detail: msg,
                expected: `writable file at ${REPORT_PATH}`,
                found: `write failed: ${msg}`,
            });
        } else {
            console.error(`[check-readme-compliance] WARN: failed to write report: ${msg}`);
        }
    }
}

if (JSON_MODE) {
    process.stdout.write(JSON.stringify({
        version: 2,
        ok,
        file: README_PATH,
        summary: { passed, failed, total: checks.length },
        checks,
    }, null, 2) + "\n");
    process.exit(ok ? 0 : 1);
}

// Human output
const ICON = (b) => (b ? "✅" : "❌");
console.log("");
console.log(`README compliance — ${README_PATH.replace(REPO_ROOT + "/", "")}`);
console.log("─".repeat(72));
for (const c of checks) {
    console.log(`  ${ICON(c.ok)}  ${c.label}`);
    if (!c.ok || process.env.VERBOSE === "1") {
        console.log(`        ${c.detail}`);
    }
}
console.log("─".repeat(72));
console.log(`  ${passed}/${checks.length} checks passed${failed > 0 ? `, ${failed} failed` : ""}`);

if (!ok) {
    console.log("");
    console.log("Spec authority: spec/01-spec-authoring-guide/11-root-readme-conventions.md");
    process.exit(1);
}

console.log("");
process.exit(0);

// ─── Bottom helpers ─────────────────────────────────────────────────────────

function fail(msg) {
    if (JSON_MODE) {
        process.stdout.write(JSON.stringify({
            version: 2,
            ok: false,
            file: README_PATH,
            summary: { passed: 0, failed: 1, total: 1 },
            checks: [{ id: "load", label: "Load README", ok: false, detail: msg, expected: `readable file at ${README_PATH}`, found: msg }],
        }, null, 2) + "\n");
    } else {
        console.error(`[check-readme-compliance] FAIL: ${msg}`);
    }
    process.exit(1);
}

function truncate(s, n) {
    if (!s) return "";
    return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** Escape pipe characters so values render inside markdown table cells. */
function mdCell(v) {
    return String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderMarkdownReport({ ok, passed, failed, checks }) {
    const now = new Date().toISOString();
    const relFile = relative(REPO_ROOT, README_PATH);
    const failures = checks.filter((c) => !c.ok);
    const passes = checks.filter((c) => c.ok);

    const lines = [];
    lines.push(`# README Compliance Report`);
    lines.push("");
    lines.push(`- **File:** \`${relFile}\``);
    lines.push(`- **Generated:** ${now}`);
    lines.push(`- **Status:** ${ok ? "✅ **PASS**" : "❌ **FAIL**"}`);
    lines.push(`- **Summary:** ${passed}/${checks.length} checks passed${failed > 0 ? `, ${failed} failed` : ""}`);
    lines.push(`- **Spec authority:** [\`spec/01-spec-authoring-guide/11-root-readme-conventions.md\`](../spec/01-spec-authoring-guide/11-root-readme-conventions.md)`);
    lines.push("");
    lines.push(`---`);
    lines.push("");

    if (failures.length === 0) {
        lines.push(`## ✅ All checks passed`);
        lines.push("");
        lines.push(`No failures to report. The README satisfies all ${checks.length} compliance rules.`);
        lines.push("");
    } else {
        lines.push(`## ❌ Failed checks (${failures.length})`);
        lines.push("");
        lines.push(`Each failure below shows the **expected** rule and the **found** state, side-by-side, for fast remediation.`);
        lines.push("");
        for (const c of failures) {
            lines.push(`### ❌ \`${c.id}\` — ${c.label}`);
            lines.push("");
            lines.push(`| Aspect | Value |`);
            lines.push(`|--------|-------|`);
            lines.push(`| **Expected** | ${mdCell(c.expected || "(rule definition not available)")} |`);
            lines.push(`| **Found**    | ${mdCell(c.found || c.detail || "(no detail captured)")} |`);
            lines.push(`| **Detail**   | ${mdCell(c.detail)} |`);
            lines.push("");
        }
    }

    lines.push(`---`);
    lines.push("");
    lines.push(`## Full check inventory`);
    lines.push("");
    lines.push(`| # | Status | Check ID | Label |`);
    lines.push(`|---|--------|----------|-------|`);
    checks.forEach((c, i) => {
        lines.push(`| ${i + 1} | ${c.ok ? "✅" : "❌"} | \`${c.id}\` | ${mdCell(c.label)} |`);
    });
    lines.push("");

    if (passes.length > 0 && failures.length > 0) {
        lines.push(`---`);
        lines.push("");
        lines.push(`<details><summary>✅ Passed checks (${passes.length}) — expand for expected/found</summary>`);
        lines.push("");
        for (const c of passes) {
            lines.push(`#### ✅ \`${c.id}\` — ${c.label}`);
            lines.push("");
            lines.push(`- **Expected:** ${mdCell(c.expected || "—")}`);
            lines.push(`- **Found:**    ${mdCell(c.found || c.detail || "—")}`);
            lines.push("");
        }
        lines.push(`</details>`);
        lines.push("");
    }

    lines.push(`<sub>Generated by \`scripts/check-readme-compliance.mjs\` (schema v2). Re-run with \`pnpm run check:readme:report\` to refresh.</sub>`);
    lines.push("");
    return lines.join("\n");
}
