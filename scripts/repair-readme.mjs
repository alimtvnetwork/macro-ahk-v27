#!/usr/bin/env node
/**
 * repair-readme.mjs
 *
 * Auto-repair mode for the root readme.md (and, since v2, any number of
 * README files matched by a glob). Fixes the three most common compliance
 * violations defined in
 *   spec/01-spec-authoring-guide/11-root-readme-conventions.md
 *
 *   1. centered-hero      — Missing `<div align="center">` wrapping the hero
 *                           block. Inserts `<div align="center">` immediately
 *                           above the first `<img …logo…>` (or above the H1
 *                           if no logo is found) and inserts the matching
 *                           `</div>` immediately before the first `## ` H2.
 *
 *   2. license-section    — Missing `## License` heading at end of file.
 *                           Appends a stub `## License` section with a
 *                           one-line placeholder pointing at LICENSE.md.
 *
 *   3. author-misorder    — Author H3 + Company H3 are present but appear in
 *                           the wrong order (Company before Author). Swaps
 *                           the two H3 sub-blocks back to the mandated order
 *                           (Author first, Company second).
 *
 * Modes:
 *   --dry-run (default) — Print the intended changes; do NOT touch the file.
 *
 *   --apply             — Rewrite each matched README in place. Backs up each
 *                         file to `<file>.bak` before writing.
 *
 *   --json              — Emit a JSON envelope describing repairs. When more
 *                         than one file is matched (via --glob / --files), the
 *                         envelope is wrapped:
 *                           {
 *                             version: 2,
 *                             multi: true,
 *                             totals: { files, changed, applied, wouldApply, skipped, notNeeded },
 *                             auditLog,                     // shared audit log path or null
 *                             results: [ <per-file envelope>, … ],
 *                           }
 *                         Per-file envelope schema (also emitted directly when
 *                         only one file matches, for v1 backwards compat):
 *                           {
 *                             version: 1,
 *                             file, applied, dryRun, changedBytes, auditLog,
 *                             repairs: [{ id, label, status, … }],
 *                           }
 *
 *   --file=<path>       Target a single README. May be repeated to add more
 *                       than one explicit file. Default if neither --file nor
 *                       --glob is passed: `./readme.md`.
 *
 *   --files=<csv>       Comma-separated list of README paths (alternative to
 *                       repeating --file). Each entry is resolved relative to
 *                       the repo root.
 *
 *   --glob=<pattern>    Glob (or comma-separated globs) of README files to
 *                       repair, e.g. `--glob='**\/README.md'` or
 *                       `--glob='docs/**\/readme.md,packages/*\/readme.md'`.
 *                       Resolved relative to the repo root.
 *                       Defaults: excludes `node_modules`, `dist`, `build`,
 *                       `.release`, `skipped`, `.git`, and any `*.bak` files.
 *                       Combine with --file/--files to add explicit paths on
 *                       top of glob matches (deduped, processed in stable
 *                       sorted order). Use `--no-default-ignores` to disable
 *                       the built-in exclusions.
 *
 *   --no-default-ignores  Disable the built-in glob exclusion list (use with
 *                         --glob if you genuinely want to repair READMEs in
 *                         vendored / build / archive folders).
 *
 *   --audit[=<path>]    Write a JSON audit log of every mutation. In multi-file
 *                       mode the audit payload is itself wrapped:
 *                           {
 *                             version: 2, kind: "readme-repair-audit-bundle",
 *                             timestamp, mode, totals, files: [ <single-file audit>, … ]
 *                           }
 *                       Single-file mode keeps the v1 schema unchanged.
 *
 *   --only=<ids>        Comma-separated allowlist of repair ids to run.
 *                       Mutually exclusive with --skip. Valid ids:
 *                         centered-hero, license-section, author-misorder.
 *
 *   --skip=<ids>        Comma-separated blocklist of repair ids to disable.
 *                       Mutually exclusive with --only.
 *
 * Exit code:
 *   0 — every matched file processed (whether or not repairs were needed).
 *   1 — invalid CLI input, no files matched, or an I/O error.
 *
 * Safety contract:
 *   - The script never edits content INSIDE existing badge blocks, code
 *     fences, or the author biography paragraphs.
 *   - Every repair is idempotent: running the same repair twice is a no-op.
 *   - In --apply mode, a `<file>.bak` backup is always written first PER file.
 *   - Repairs that cannot be performed safely (ambiguous structure, etc.)
 *     are reported with status "skipped" and a `reason` field.
 *
 * Companion to: scripts/check-readme-compliance.mjs
 *               (run that FIRST to discover violations, then run this with
 *               --apply to remediate; finally re-run the checker to confirm.)
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JSON_MODE = args.includes("--json");
const NO_DEFAULT_IGNORES = args.includes("--no-default-ignores");

const fileArgs = args.filter((a) => a.startsWith("--file="));
const filesArg = args.find((a) => a.startsWith("--files="));
const globArgs = args.filter((a) => a.startsWith("--glob="));

// --audit (no value) → default path; --audit=<path> → explicit path; absent → no audit log.
const auditFlag = args.find((a) => a === "--audit" || a.startsWith("--audit="));
const AUDIT_ENABLED = Boolean(auditFlag);
const AUDIT_PATH = (() => {
    if (!AUDIT_ENABLED) return null;
    if (auditFlag === "--audit") {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return resolve(REPO_ROOT, ".lovable/reports", `readme-repair-audit-${stamp}.json`);
    }
    return resolve(REPO_ROOT, auditFlag.slice("--audit=".length));
})();

// --only=<ids> / --skip=<ids> — toggle individual repair rules.
const VALID_REPAIR_IDS = new Set(["centered-hero", "license-section", "author-misorder"]);
const onlyArg = args.find((a) => a.startsWith("--only="));
const skipArg = args.find((a) => a.startsWith("--skip="));
if (onlyArg && skipArg) {
    die("--only and --skip are mutually exclusive — pass only one");
}
function parseIdList(flag) {
    const raw = flag.split("=")[1] ?? "";
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = ids.filter((id) => !VALID_REPAIR_IDS.has(id));
    if (invalid.length > 0) {
        die(`unknown repair id(s) in ${flag.split("=")[0]}: ${invalid.join(", ")} — valid: ${[...VALID_REPAIR_IDS].join(", ")}`);
    }
    return new Set(ids);
}
const ONLY_SET = onlyArg ? parseIdList(onlyArg) : null;
const SKIP_SET = skipArg ? parseIdList(skipArg) : null;

// ─── Resolve target file list ────────────────────────────────────────────────
const DEFAULT_GLOB_IGNORES = [
    "node_modules", "dist", "build", ".git", ".release", "skipped",
    "coverage", ".next", ".cache", ".turbo", ".lovable",
];

const targets = resolveTargets();
if (targets.length === 0) {
    die("no README files matched — check --file/--files/--glob inputs");
}

// ─── Per-file processing ─────────────────────────────────────────────────────
const perFileResults = [];
const perFileAudits = [];

for (const targetPath of targets) {
    const result = repairOneFile(targetPath);
    perFileResults.push(result.envelope);
    if (AUDIT_ENABLED) perFileAudits.push(result.auditPayload);
}

// ─── Audit log (single shared file in multi-file mode) ───────────────────────
let auditWritten = null;
if (AUDIT_ENABLED && AUDIT_PATH) {
    let payload;
    if (perFileAudits.length === 1) {
        payload = perFileAudits[0];
    } else {
        payload = {
            version: 2,
            kind: "readme-repair-audit-bundle",
            timestamp: new Date().toISOString(),
            mode: APPLY ? "apply" : "dry-run",
            totals: aggregateTotals(perFileResults),
            files: perFileAudits,
        };
    }
    mkdirSync(dirname(AUDIT_PATH), { recursive: true });
    writeFileSync(AUDIT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    auditWritten = AUDIT_PATH;
}

// ─── Output ──────────────────────────────────────────────────────────────────
if (JSON_MODE) {
    if (perFileResults.length === 1) {
        // v1-compatible single-file envelope
        process.stdout.write(JSON.stringify({
            ...perFileResults[0],
            auditLog: auditWritten,
        }, null, 2) + "\n");
    } else {
        process.stdout.write(JSON.stringify({
            version: 2,
            multi: true,
            totals: aggregateTotals(perFileResults),
            auditLog: auditWritten,
            results: perFileResults,
        }, null, 2) + "\n");
    }
    process.exit(0);
}

// Human output
const ICON = (s) => s === "applied" ? "✅" : s === "would-apply" ? "📝" : s === "skipped" ? "⚠️ " : "—";
const totals = aggregateTotals(perFileResults);
console.log("");
if (perFileResults.length === 1) {
    printFileReport(perFileResults[0]);
} else {
    console.log(`README repair — ${perFileResults.length} file(s) ${APPLY ? "(APPLY MODE)" : "(dry-run)"}`);
    console.log("═".repeat(72));
    for (const r of perFileResults) {
        printFileReport(r);
    }
    console.log("═".repeat(72));
    console.log(`  Aggregate: ${totals.applied} applied · ${totals.wouldApply} would-apply · ${totals.skipped} skipped · ${totals.notNeeded} not-needed across ${totals.files} file(s) (${totals.changed} changed)`);
}
if (auditWritten) {
    console.log(`  📒 audit log → ${relative(REPO_ROOT, auditWritten)}`);
}
console.log("");
process.exit(0);

// ─── Per-file repair driver ──────────────────────────────────────────────────

function repairOneFile(README_PATH) {
    if (!existsSync(README_PATH)) {
        die(`readme.md not found at: ${README_PATH}`);
    }
    const original = readFileSync(README_PATH, "utf8");
    let working = original;
    /** @type {Array<{ id: string; label: string; status: "applied"|"would-apply"|"skipped"|"not-needed"; reason?: string; preview?: string; before?: string; after?: string; beforeRange?: { startLine: number; endLine: number }; afterRange?: { startLine: number; endLine: number } }>} */
    const repairs = [];

    function enabled(id) {
        if (ONLY_SET) return ONLY_SET.has(id);
        if (SKIP_SET) return !SKIP_SET.has(id);
        return true;
    }
    function recordDisabled(id, label) {
        const reason = ONLY_SET ? "disabled by --only flag" : "disabled by --skip flag";
        repairs.push({ id, label, status: "skipped", reason });
    }

    // ─── Repair #1: centered-hero ────────────────────────────────────────────
    {
        const id = "centered-hero";
        const label = "Insert <div align=\"center\"> wrapper around hero block";
        if (!enabled(id)) { recordDisabled(id, label); }
        else {
        const lines = working.split(/\r?\n/);
        const h1Idx = lines.findIndex((l) => /^# (?!#)/.test(l));
        const head = h1Idx > 0 ? lines.slice(0, h1Idx).join("\n") : "";
        const alreadyCentered = /<div\s+align=["']center["']\s*>/i.test(head);

        if (h1Idx < 0) {
            repairs.push({ id, label, status: "skipped", reason: "no H1 heading found — cannot determine hero block boundary" });
        } else if (alreadyCentered) {
            const firstH2 = lines.findIndex((l, i) => i > h1Idx && /^## /.test(l));
            const heroEnd = firstH2 > 0 ? firstH2 : lines.length;
            const heroSlice = lines.slice(0, heroEnd).join("\n");
            const opens = (heroSlice.match(/<div\s+align=["']center["']\s*>/gi) ?? []).length;
            const closes = (heroSlice.match(/<\/div>/gi) ?? []).length;

            if (opens === closes) {
                repairs.push({ id, label, status: "not-needed", reason: "hero already wrapped with balanced <div align=\"center\"> … </div>" });
            } else if (closes < opens) {
                const insertAt = firstH2 > 0 ? firstH2 : lines.length;
                const newLines = [...lines];
                newLines.splice(insertAt, 0, "</div>", "");
                const next = newLines.join("\n");
                const beforeSnip = snippetFromLines(lines, insertAt - 1, insertAt, 3);
                const afterSnip = snippetFromLines(newLines, insertAt - 1, insertAt + 2, 3);
                repairs.push({
                    id, label,
                    status: APPLY ? "applied" : "would-apply",
                    preview: `+ insert </div> at line ${insertAt + 1} (before first ## heading) — close unbalanced opening`,
                    before: beforeSnip.text, beforeRange: beforeSnip.range,
                    after: afterSnip.text, afterRange: afterSnip.range,
                });
                working = next;
            } else {
                repairs.push({ id, label, status: "skipped", reason: `more closing </div> than opening (${opens} open / ${closes} close) — manual review required` });
            }
        } else {
            const isLogoLine = (l) =>
                /<img\s+[^>]*src=["'][^"']*\b(logo|icon|brand)[^"']*["'][^>]*>/i.test(l) ||
                /!\[[^\]]*(logo|icon|brand)[^\]]*\]\([^)]+\)/i.test(l);
            const logoIdx = lines.findIndex((l, i) => i < h1Idx && isLogoLine(l));
            const openAt = logoIdx >= 0 ? logoIdx : h1Idx;
            const firstH2 = lines.findIndex((l, i) => i > h1Idx && /^## /.test(l));
            const closeAt = firstH2 > 0 ? firstH2 : lines.length;

            const newLines = [...lines];
            newLines.splice(closeAt, 0, "</div>", "");
            newLines.splice(openAt, 0, "<div align=\"center\">", "");
            const next = newLines.join("\n");
            const previewParts = [
                `+ insert <div align="center"> at line ${openAt + 1}`,
                `+ insert </div> at line ${closeAt + 3} (before first ## heading)`,
            ];
            const beforeSnip = snippetFromLines(lines, openAt, Math.min(closeAt, openAt + 12), 2);
            const afterSnip = snippetFromLines(newLines, openAt, Math.min(closeAt + 2, openAt + 14), 2);
            repairs.push({
                id, label,
                status: APPLY ? "applied" : "would-apply",
                preview: previewParts.join("; "),
                before: beforeSnip.text, beforeRange: beforeSnip.range,
                after: afterSnip.text, afterRange: afterSnip.range,
            });
            working = next;
        }
        }
    }

    // ─── Repair #2: license-section ──────────────────────────────────────────
    {
        const id = "license-section";
        const label = "Append `## License` section if missing";
        if (!enabled(id)) { recordDisabled(id, label); }
        else {
        const linesNoCode = stripCodeFences(working).split(/\r?\n/);
        const hasLicenseHeading = linesNoCode.some((l) => /^##\s+License\b/i.test(l));

        if (hasLicenseHeading) {
            repairs.push({ id, label, status: "not-needed", reason: "## License heading already present" });
        } else {
            const stub = [
                "",
                "---",
                "",
                "## License",
                "",
                "See [`LICENSE.md`](./LICENSE.md) for the full license text.",
                "",
            ].join("\n");
            const trimmed = working.replace(/\s+$/, "");
            const next = `${trimmed}\n${stub}`;
            const workingLines = working.split(/\r?\n/);
            const nextLines = next.split(/\r?\n/);
            const beforeSnip = snippetFromLines(workingLines, Math.max(0, workingLines.length - 4), workingLines.length, 0);
            const afterSnip = snippetFromLines(nextLines, Math.max(0, workingLines.length - 4), nextLines.length, 0);
            repairs.push({
                id, label,
                status: APPLY ? "applied" : "would-apply",
                preview: `+ append 7-line "## License" section at end of file`,
                before: beforeSnip.text, beforeRange: beforeSnip.range,
                after: afterSnip.text, afterRange: afterSnip.range,
            });
            working = next;
        }
        }
    }

    // ─── Repair #3: author-misorder ──────────────────────────────────────────
    {
        const id = "author-misorder";
        const label = "Reorder Author/Company H3 sub-sections (Author first)";
        if (!enabled(id)) { recordDisabled(id, label); }
        else {
        const linesNoCode = stripCodeFences(working).split(/\r?\n/);
        const authorIdx = linesNoCode.findIndex((l) => /^##\s+Author\b/i.test(l));

        if (authorIdx < 0) {
            repairs.push({ id, label, status: "skipped", reason: "no `## Author` section found — repair not applicable" });
        } else {
            const linesArr = working.split(/\r?\n/);
            const sectionEnd = (() => {
                for (let i = authorIdx + 1; i < linesNoCode.length; i++) {
                    if (/^##\s+/.test(linesNoCode[i])) return i;
                }
                return linesArr.length;
            })();

            /** @type {Array<{ startIdx: number; endIdx: number; heading: string; isCompany: boolean; isAuthor: boolean }>} */
            const blocks = [];
            for (let i = authorIdx + 1; i < sectionEnd; i++) {
                if (/^###\s+/.test(linesNoCode[i])) {
                    const heading = linesArr[i];
                    let endIdx = sectionEnd;
                    for (let j = i + 1; j < sectionEnd; j++) {
                        if (/^###\s+/.test(linesNoCode[j])) { endIdx = j; break; }
                    }
                    const isAuthor = /^###\s+\[[^\]]+\]\([^)]+\)/.test(heading);
                    const isCompany = !isAuthor;
                    blocks.push({ startIdx: i, endIdx, heading: heading.trim(), isCompany, isAuthor });
                    i = endIdx - 1;
                }
            }

            if (blocks.length < 2) {
                repairs.push({ id, label, status: "not-needed", reason: `only ${blocks.length} H3 block(s) inside Author section — nothing to reorder` });
            } else {
                const firstAuthorIdx = blocks.findIndex((b) => b.isAuthor);
                const firstCompanyIdx = blocks.findIndex((b) => b.isCompany);

                if (firstAuthorIdx < 0 || firstCompanyIdx < 0) {
                    repairs.push({ id, label, status: "skipped", reason: "could not classify both an Author H3 (linked name) and a Company H3 (plain text)" });
                } else if (firstAuthorIdx < firstCompanyIdx) {
                    repairs.push({ id, label, status: "not-needed", reason: "Author H3 already appears before Company H3" });
                } else {
                    const authorBlock = blocks[firstAuthorIdx];
                    const companyBlock = blocks[firstCompanyIdx];
                    if (companyBlock.startIdx >= authorBlock.startIdx) {
                        repairs.push({ id, label, status: "skipped", reason: "Author/Company block ordering ambiguous — manual review required" });
                    } else {
                        const before = linesArr.slice(0, companyBlock.startIdx);
                        const companyContent = linesArr.slice(companyBlock.startIdx, companyBlock.endIdx);
                        const middle = linesArr.slice(companyBlock.endIdx, authorBlock.startIdx);
                        const authorContent = linesArr.slice(authorBlock.startIdx, authorBlock.endIdx);
                        const after = linesArr.slice(authorBlock.endIdx);
                        const reordered = [...before, ...authorContent, ...middle, ...companyContent, ...after];
                        working = reordered.join("\n");
                        const beforeSnip = snippetFromLines(linesArr, companyBlock.startIdx, authorBlock.endIdx, 1);
                        const afterSnip = snippetFromLines(reordered, companyBlock.startIdx, authorBlock.endIdx, 1);
                        repairs.push({
                            id,
                            label,
                            status: APPLY ? "applied" : "would-apply",
                            preview: `~ swap "${truncate(companyBlock.heading, 60)}" (lines ${companyBlock.startIdx + 1}-${companyBlock.endIdx}) with "${truncate(authorBlock.heading, 60)}" (lines ${authorBlock.startIdx + 1}-${authorBlock.endIdx})`,
                            before: beforeSnip.text, beforeRange: beforeSnip.range,
                            after: afterSnip.text, afterRange: afterSnip.range,
                        });
                    }
                }
            }
        }
        }
    }

    // ─── Apply ───────────────────────────────────────────────────────────────
    const changed = working !== original;
    if (APPLY && changed) {
        const backup = `${README_PATH}.bak`;
        copyFileSync(README_PATH, backup);
        writeFileSync(README_PATH, working, "utf8");
    }

    const envelope = {
        version: 1,
        file: README_PATH,
        relative: relative(REPO_ROOT, README_PATH),
        applied: APPLY && changed,
        dryRun: !APPLY,
        changedBytes: working.length - original.length,
        repairs,
    };

    const auditPayload = {
        version: 1,
        kind: "readme-repair-audit",
        timestamp: new Date().toISOString(),
        file: README_PATH,
        mode: APPLY ? "apply" : "dry-run",
        applied: APPLY && changed,
        changedBytes: working.length - original.length,
        summary: {
            total: repairs.length,
            applied: repairs.filter((r) => r.status === "applied").length,
            wouldApply: repairs.filter((r) => r.status === "would-apply").length,
            skipped: repairs.filter((r) => r.status === "skipped").length,
            notNeeded: repairs.filter((r) => r.status === "not-needed").length,
        },
        mutations: repairs
            .filter((r) => r.status === "applied" || r.status === "would-apply")
            .map((r) => ({
                id: r.id,
                label: r.label,
                status: r.status,
                preview: r.preview ?? null,
                before: { range: r.beforeRange ?? null, snippet: r.before ?? "" },
                after: { range: r.afterRange ?? null, snippet: r.after ?? "" },
            })),
        allRepairs: repairs.map((r) => ({
            id: r.id, label: r.label, status: r.status,
            reason: r.reason ?? null, preview: r.preview ?? null,
        })),
    };

    return { envelope, auditPayload };
}

// ─── Reporting helpers ───────────────────────────────────────────────────────

function printFileReport(r) {
    const appliedCount = r.repairs.filter((x) => x.status === "applied" || x.status === "would-apply").length;
    console.log(`README repair — ${r.relative} ${APPLY ? "(APPLY MODE)" : "(dry-run)"}`);
    console.log("─".repeat(72));
    for (const x of r.repairs) {
        console.log(`  ${ICON(x.status)} [${x.status}] ${x.label}`);
        if (x.preview) console.log(`         ${x.preview}`);
        if (x.reason) console.log(`         reason: ${x.reason}`);
    }
    console.log("─".repeat(72));
    if (APPLY) {
        if (r.applied) {
            console.log(`  ✅ ${appliedCount} repair(s) applied. Backup: ${r.relative}.bak`);
        } else {
            console.log(`  ✅ No repairs needed for ${r.relative}.`);
        }
    } else {
        if (appliedCount > 0) {
            console.log(`  📝 ${appliedCount} repair(s) would be applied to ${r.relative}. Re-run with --apply to write.`);
        } else {
            console.log(`  ✅ No repairs needed for ${r.relative}.`);
        }
    }
    console.log("");
}

function aggregateTotals(results) {
    const t = { files: results.length, changed: 0, applied: 0, wouldApply: 0, skipped: 0, notNeeded: 0 };
    for (const r of results) {
        if (r.changedBytes !== 0 || r.repairs.some((x) => x.status === "applied" || x.status === "would-apply")) {
            t.changed += 1;
        }
        for (const x of r.repairs) {
            if (x.status === "applied") t.applied += 1;
            else if (x.status === "would-apply") t.wouldApply += 1;
            else if (x.status === "skipped") t.skipped += 1;
            else if (x.status === "not-needed") t.notNeeded += 1;
        }
    }
    return t;
}

// ─── Target resolution ──────────────────────────────────────────────────────

function resolveTargets() {
    const fromFiles = fileArgs.map((a) => resolve(REPO_ROOT, a.slice("--file=".length)));
    const fromFilesCsv = filesArg
        ? filesArg.slice("--files=".length).split(",").map((s) => s.trim()).filter(Boolean).map((p) => resolve(REPO_ROOT, p))
        : [];
    const explicit = [...fromFiles, ...fromFilesCsv];

    const fromGlobs = [];
    for (const g of globArgs) {
        const patterns = g.slice("--glob=".length).split(",").map((s) => s.trim()).filter(Boolean);
        for (const pat of patterns) {
            for (const match of expandGlob(pat)) fromGlobs.push(match);
        }
    }

    const all = [...explicit, ...fromGlobs];

    if (all.length === 0) {
        // Backwards compatible default — operate on root readme.md.
        return [resolve(REPO_ROOT, "readme.md")];
    }

    // Dedupe + sort for deterministic order.
    return [...new Set(all)].sort();
}

/**
 * Minimal-but-correct glob expansion supporting `*`, `**`, `?`, character
 * classes, and brace expansion `{a,b}`. Walks the repo from REPO_ROOT and
 * returns absolute file paths whose relative path matches the pattern.
 *
 * Skips DEFAULT_GLOB_IGNORES unless --no-default-ignores is set.
 * Always skips `*.bak` files (we create them ourselves).
 */
function expandGlob(pattern) {
    const expanded = expandBraces(pattern);
    const matchers = expanded.map(globToRegExp);
    const out = [];
    walk(REPO_ROOT, "");
    return out;

    function walk(absDir, relDir) {
        let entries;
        try { entries = readdirSync(absDir, { withFileTypes: true }); }
        catch { return; }
        for (const ent of entries) {
            const name = ent.name;
            if (!NO_DEFAULT_IGNORES && DEFAULT_GLOB_IGNORES.includes(name)) continue;
            if (name.endsWith(".bak")) continue;
            const childAbs = join(absDir, name);
            const childRel = relDir ? `${relDir}/${name}` : name; // POSIX separators for matching
            if (ent.isDirectory()) {
                walk(childAbs, childRel);
            } else if (ent.isFile()) {
                if (matchers.some((re) => re.test(childRel))) out.push(childAbs);
            }
        }
    }
}

/** Expand `{a,b,c}` into multiple patterns (non-nested). */
function expandBraces(pattern) {
    const m = pattern.match(/\{([^{}]+)\}/);
    if (!m) return [pattern];
    const [whole, inner] = m;
    const parts = inner.split(",");
    const results = [];
    for (const p of parts) {
        results.push(...expandBraces(pattern.replace(whole, p)));
    }
    return results;
}

/** Convert a glob pattern (POSIX separators) to a RegExp. */
function globToRegExp(glob) {
    let re = "^";
    let i = 0;
    while (i < glob.length) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                // ** — match across directory separators
                re += ".*";
                i += 2;
                if (glob[i] === "/") i += 1; // consume trailing slash so `**/foo` matches `foo`
            } else {
                re += "[^/]*";
                i += 1;
            }
        } else if (c === "?") {
            re += "[^/]";
            i += 1;
        } else if (c === "[") {
            const close = glob.indexOf("]", i);
            if (close < 0) { re += "\\["; i += 1; }
            else { re += glob.slice(i, close + 1); i = close + 1; }
        } else if ("/.+()|^$".includes(c)) {
            re += "\\" + c;
            i += 1;
        } else {
            re += c;
            i += 1;
        }
    }
    re += "$";
    return new RegExp(re);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Blank out lines inside fenced code blocks; preserves line numbers. */
function stripCodeFences(text) {
    const ls = text.split(/\r?\n/);
    const out = new Array(ls.length);
    let inFence = false;
    let fenceMarker = "";
    for (let i = 0; i < ls.length; i++) {
        const l = ls[i];
        const m = l.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (m) {
            const marker = m[1][0];
            if (!inFence) { inFence = true; fenceMarker = marker; out[i] = ""; continue; }
            if (inFence && marker === fenceMarker) { inFence = false; fenceMarker = ""; out[i] = ""; continue; }
        }
        out[i] = inFence ? "" : l;
    }
    return out.join("\n");
}

function truncate(s, n) {
    if (!s) return "";
    return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function snippetFromLines(ls, from, to, pad = 0) {
    const start = Math.max(0, from - pad);
    const end = Math.min(ls.length, to + pad);
    return {
        text: ls.slice(start, end).join("\n"),
        range: { startLine: start + 1, endLine: end },
    };
}

function die(msg) {
    if (JSON_MODE) {
        process.stdout.write(JSON.stringify({ version: 2, ok: false, error: msg }, null, 2) + "\n");
    } else {
        console.error(`[repair-readme] FAIL: ${msg}`);
    }
    process.exit(1);
}
