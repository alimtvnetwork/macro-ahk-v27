#!/usr/bin/env node
/**
 * report-spec-links-ci.mjs
 *
 * CI-friendly spec-link checker.
 *
 * What it adds on top of the basic checker:
 *  - Reads exclude/scan dirs and auto-resolve settings from a single
 *    on-disk config: `scripts/check-spec-links.config.json`. Adding a new
 *    archive folder is a JSON edit — no JS changes required.
 *  - Optional auto-resolver: when `autoResolve.enabled` is true (or
 *    `--auto-resolve` is passed) the checker tries to find a confident
 *    replacement target for each broken link via the same suffix-overlap
 *    algorithm `rewrite-spec-links.mjs` uses. Confidently-resolvable
 *    links are downgraded from ERROR → WARNING (build still passes); only
 *    truly-missing or ambiguous links remain hard errors.
 *  - Aggregates broken links per source file and prints a leaderboard.
 *  - Emits GitHub Actions inline annotations + a Markdown step-summary.
 *
 * Exit codes:
 *   0 — every link resolves (possibly via auto-resolve fallback).
 *   1 — at least one link could not be resolved (hard error).
 *   2 — usage error (missing spec root, malformed config used as hard fail).
 *
 * Flags (override config):
 *   --no-annotations    suppress GitHub Actions inline annotations
 *   --auto-resolve      force-enable the suffix-overlap fallback
 *   --no-auto-resolve   force-disable the suffix-overlap fallback
 *   --strict            shorthand for --no-auto-resolve (legacy CI contract)
 *
 * Output follows project Code Red logging: exact path, missing item, reason.
 */

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  REPO_ROOT,
  loadConfig,
  CONFIG_PATH,
  collectMarkdownFiles,
  extractLinks,
  isSkippableTarget,
  resolveLinkTarget,
  buildBasenameIndex,
  findReplacement,
  relativeFromSource,
} from "./lib/spec-links-core.mjs";

const SCRIPT_TAG = "[report-spec-links-ci]";

const argv = new Set(process.argv.slice(2));
const NO_ANNOTATIONS = argv.has("--no-annotations");
const FORCE_AUTO_RESOLVE = argv.has("--auto-resolve");
const FORCE_NO_AUTO_RESOLVE = argv.has("--no-auto-resolve") || argv.has("--strict");
const TOP_N = 10;
const MAX_DETAIL_LINKS = 50;

/** Append a chunk of markdown to $GITHUB_STEP_SUMMARY if defined. */
function appendStepSummary(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (!target) return;
  try {
    appendFileSync(target, markdown + "\n", "utf8");
  } catch (err) {
    console.warn(
      `${SCRIPT_TAG} could not write to GITHUB_STEP_SUMMARY.\n` +
        `  path:   ${target}\n` +
        `  reason: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Escape a string for safe use inside a GitHub Actions annotation message. */
function escapeAnnotation(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function main() {
  const { config, source: configSource, error: configError } = loadConfig();

  if (configSource === "invalid") {
    console.warn(
      `${SCRIPT_TAG} WARN — config file failed to parse, falling back to defaults.\n` +
        `  path:   ${relative(REPO_ROOT, CONFIG_PATH)}\n` +
        `  reason: ${configError}\n` +
        `  fix:    repair the JSON or delete the file to use built-in defaults.`
    );
  }

  // CLI flags override config.
  const autoResolveEnabled = FORCE_NO_AUTO_RESOLVE
    ? false
    : FORCE_AUTO_RESOLVE
      ? true
      : config.autoResolve.enabled;

  const excludeDirNames = new Set(config.excludeDirs);

  // Validate scan roots up front so a typo in config is a clear error,
  // not a silent "0 files scanned, all green" false-positive.
  const scanAbsRoots = [];
  for (const rel of config.scanRoots) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      console.error(
        `${SCRIPT_TAG} HARD ERROR — scan root not found.\n` +
          `  path:    ${rel}  (resolved: ${abs})\n` +
          `  missing: directory listed in scanRoots\n` +
          `  reason:  this script must be run from repo root and every scanRoots entry must exist.\n` +
          `  fix:     edit ${relative(REPO_ROOT, CONFIG_PATH)} → "scanRoots".`
      );
      process.exit(2);
    }
    scanAbsRoots.push(abs);
  }

  console.log(
    `${SCRIPT_TAG} config: source=${configSource}, scanRoots=[${config.scanRoots.join(", ")}], ` +
      `excludeDirs=[${config.excludeDirs.join(", ")}], autoResolve=${autoResolveEnabled ? "ON" : "off"}` +
      (autoResolveEnabled ? ` (minScore=${config.autoResolve.minScore})` : "")
  );

  // Collect every .md across all scanRoots, honouring excludeDirs.
  const files = [];
  for (const root of scanAbsRoots) {
    collectMarkdownFiles(root, excludeDirNames, files);
  }

  let totalLinks = 0;
  let checkedLinks = 0;
  const broken = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const links = extractLinks(source);
    totalLinks += links.length;

    for (const link of links) {
      if (isSkippableTarget(link.target)) continue;
      checkedLinks++;
      const resolved = resolveLinkTarget(file, link.target);
      if (!resolved) continue;
      if (!existsSync(resolved)) {
        broken.push({
          source: relative(REPO_ROOT, file),
          sourceAbs: file,
          line: link.lineNumber,
          text: link.text,
          target: link.target,
          resolved: relative(REPO_ROOT, resolved),
        });
      }
    }
  }

  const headline =
    `${SCRIPT_TAG} scanned ${files.length} markdown files, ` +
    `${totalLinks} total links, ${checkedLinks} relative links checked.`;

  if (broken.length === 0) {
    console.log(`${headline} OK — all relative links resolve.`);
    appendStepSummary(
      `## ✅ Spec links\n\n- Files scanned: **${files.length}**\n` +
        `- Relative links checked: **${checkedLinks}**\n- Broken links: **0**\n`
    );
    process.exit(0);
  }

  // ── Auto-resolve pass ────────────────────────────────────────────
  let autoResolved = [];
  let unresolved = broken;

  if (autoResolveEnabled) {
    console.log(
      `${SCRIPT_TAG} ${broken.length} broken link(s) detected — running auto-resolve ` +
        `against [${config.autoResolve.searchRoots.join(", ")}]…`
    );
    const index = buildBasenameIndex(config.autoResolve.searchRoots);
    autoResolved = [];
    unresolved = [];
    for (const b of broken) {
      const result = findReplacement(b.target, index, config.autoResolve.minScore);
      if (result.confident && result.winner) {
        autoResolved.push({
          ...b,
          suggested: relative(REPO_ROOT, result.winner),
          rewrittenTarget: relativeFromSource(b.sourceAbs, result.winner),
          score: result.candidates[0].score,
        });
      } else {
        unresolved.push({ ...b, autoResolveReason: result.reason });
      }
    }
    console.log(
      `${SCRIPT_TAG} auto-resolve summary: ${autoResolved.length} resolvable, ` +
        `${unresolved.length} truly missing.`
    );
  }

  // ── Console output (Code Red format) ──────────────────────────────
  if (autoResolved.length > 0) {
    console.warn(
      `\n${SCRIPT_TAG} WARN — ${autoResolved.length} broken link(s) auto-resolvable. ` +
        `Run \`pnpm check:spec-links:rewrite:apply\` to commit the fixes.`
    );
    for (const r of autoResolved.slice(0, MAX_DETAIL_LINKS)) {
      console.warn(
        `  source:    ${r.source}:${r.line}\n` +
          `  link:      [${r.text}](${r.target})\n` +
          `  suggested: ${r.suggested}  (score=${r.score})\n` +
          `  rewrite:   [${r.text}](${r.rewrittenTarget})\n`
      );
    }
    if (autoResolved.length > MAX_DETAIL_LINKS) {
      console.warn(`  …and ${autoResolved.length - MAX_DETAIL_LINKS} more.`);
    }
  }

  if (unresolved.length === 0) {
    console.log(
      `\n${headline} OK via auto-resolve — ${autoResolved.length} link(s) need rewriting ` +
        `but every target exists somewhere indexable.`
    );
    appendStepSummary(buildSummaryMarkdown({ files, checkedLinks, autoResolved, unresolved: [] }));
    process.exit(0);
  }

  // Aggregate per-file leaderboard for the unresolved set.
  const perFile = new Map();
  for (const b of unresolved) {
    perFile.set(b.source, (perFile.get(b.source) ?? 0) + 1);
  }
  const ranked = [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N);

  console.error(
    `\n${SCRIPT_TAG} HARD ERROR — ${unresolved.length} unresolvable broken link(s) ` +
      `across ${perFile.size} file(s).\n`
  );
  console.error(`Top ${ranked.length} failing files:`);
  for (const [src, count] of ranked) {
    console.error(`  ${count.toString().padStart(4)}  ${src}`);
  }
  console.error("");

  for (const b of unresolved) {
    const reason = b.autoResolveReason
      ? `auto-resolve failed: ${b.autoResolveReason}`
      : "target file does not exist on disk; rename or update the link.";
    console.error(
      `  source:   ${b.source}:${b.line}\n` +
        `  link:     [${b.text}](${b.target})\n` +
        `  missing:  ${b.resolved}\n` +
        `  reason:   ${reason}\n`
    );
    if (!NO_ANNOTATIONS && process.env.GITHUB_ACTIONS === "true") {
      const msg = escapeAnnotation(
        `Broken spec link: [${b.text}](${b.target}) — missing target ${b.resolved}`
      );
      console.log(`::error file=${b.source},line=${b.line},title=Broken spec link::${msg}`);
    }
  }

  console.error(headline);
  appendStepSummary(buildSummaryMarkdown({ files, checkedLinks, autoResolved, unresolved, ranked }));
  process.exit(1);
}

function buildSummaryMarkdown({ files, checkedLinks, autoResolved, unresolved, ranked = [] }) {
  const parts = [];
  if (unresolved.length === 0 && autoResolved.length === 0) {
    parts.push(`## ✅ Spec links`);
    parts.push(`\n- Files scanned: **${files.length}**`);
    parts.push(`- Relative links checked: **${checkedLinks}**`);
    parts.push(`- Broken links: **0**`);
    return parts.join("\n");
  }
  if (unresolved.length === 0) {
    parts.push(`## ⚠️ Spec links — ${autoResolved.length} auto-resolvable`);
    parts.push(`\n- Files scanned: **${files.length}**`);
    parts.push(`- Relative links checked: **${checkedLinks}**`);
    parts.push(`- Auto-resolved (warning): **${autoResolved.length}**`);
    parts.push(`- Hard-failed: **0**`);
    parts.push(`\nRun \`pnpm check:spec-links:rewrite:apply\` to commit the suggested fixes.`);
    return parts.join("\n");
  }
  parts.push(`## ❌ Spec links — ${unresolved.length} broken`);
  parts.push(`\n- Files scanned: **${files.length}**`);
  parts.push(`- Relative links checked: **${checkedLinks}**`);
  if (autoResolved.length > 0) {
    parts.push(`- Auto-resolved (warning): **${autoResolved.length}**`);
  }
  parts.push(`- Hard-failed: **${unresolved.length}** across **${new Set(unresolved.map((u) => u.source)).size}** file(s)`);
  parts.push("");
  parts.push(`### Top ${ranked.length} failing files`);
  parts.push("\n| Broken | File |\n|-------:|------|");
  for (const [src, count] of ranked) parts.push(`| ${count} | \`${src}\` |`);
  parts.push("");
  parts.push(`### First ${Math.min(unresolved.length, MAX_DETAIL_LINKS)} broken link(s)`);
  parts.push("\n| Source | Line | Link | Missing target |\n|--------|-----:|------|----------------|");
  for (const b of unresolved.slice(0, MAX_DETAIL_LINKS)) {
    const safeText = b.text.replace(/\|/g, "\\|");
    const safeTarget = b.target.replace(/\|/g, "\\|");
    parts.push(`| \`${b.source}\` | ${b.line} | \`[${safeText}](${safeTarget})\` | \`${b.resolved}\` |`);
  }
  if (unresolved.length > MAX_DETAIL_LINKS) {
    parts.push(`\n_…and ${unresolved.length - MAX_DETAIL_LINKS} more — see the job log._`);
  }
  parts.push("\n**How to fix:**\n");
  parts.push("```bash\npnpm check:spec-links:rewrite:apply\npnpm check:spec-links:strict\n```");
  return parts.join("\n");
}

main();
