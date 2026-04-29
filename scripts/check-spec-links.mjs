#!/usr/bin/env node
/**
 * check-spec-links.mjs
 *
 * Build-time guard for relative links under `spec/`.
 *
 * Behaviour is driven by `scripts/check-spec-links.config.json`:
 *   - `scanRoots`   — directories scanned for .md files
 *   - `excludeDirs` — directory NAMES skipped during scan (archives)
 *   - `autoResolve` — see scripts/lib/spec-links-core.mjs (used by report-spec-links-ci.mjs)
 *
 * Modes:
 *   (default)            baseline-aware — pre-existing breaks pass, new ones fail
 *   --strict             ignore baseline; fail on ANY broken link
 *   --update-baseline    snapshot current breaks into baseline file and exit OK
 *
 * Output follows project Code Red logging: exact path, missing item, reason.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  REPO_ROOT,
  loadConfig,
  CONFIG_PATH,
  collectMarkdownFiles,
  extractLinks,
  isSkippableTarget,
  resolveLinkTarget,
} from "./lib/spec-links-core.mjs";

const BASELINE_PATH = join(REPO_ROOT, "scripts", "check-spec-links.baseline.json");
const SCRIPT_TAG = "[check-spec-links]";

const argv = new Set(process.argv.slice(2));
const UPDATE_BASELINE = argv.has("--update-baseline");
const STRICT = argv.has("--strict");

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

  const excludeDirNames = new Set(config.excludeDirs);

  const scanAbsRoots = [];
  for (const rel of config.scanRoots) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) {
      console.error(
        `${SCRIPT_TAG} HARD ERROR — scan root not found.\n` +
          `  path:    ${rel}  (resolved: ${abs})\n` +
          `  missing: directory listed in scanRoots\n` +
          `  reason:  every scanRoots entry must exist on disk.\n` +
          `  fix:     edit ${relative(REPO_ROOT, CONFIG_PATH)} → "scanRoots".`
      );
      process.exit(1);
    }
    scanAbsRoots.push(abs);
  }

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
          line: link.lineNumber,
          text: link.text,
          target: link.target,
          resolved: relative(REPO_ROOT, resolved),
        });
      }
    }
  }

  const summary =
    `${SCRIPT_TAG} scanned ${files.length} markdown files, ` +
    `${totalLinks} total links, ${checkedLinks} relative links checked.`;

  // Baseline survives unrelated edits — key on (source, target), not line.
  const keyOf = (b) => `${b.source}|${b.target}`;
  const currentKeys = new Set(broken.map(keyOf));

  if (UPDATE_BASELINE) {
    const payload = {
      generatedAt: new Date().toISOString(),
      note: "Pre-existing broken relative links allowed to pass build. New breaks fail. Regenerate with: node scripts/check-spec-links.mjs --update-baseline",
      entries: broken
        .map((b) => ({ source: b.source, target: b.target }))
        .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(
      `${SCRIPT_TAG} baseline updated: ${broken.length} entries written to ` +
        relative(REPO_ROOT, BASELINE_PATH) + "."
    );
    return;
  }

  let baselineKeys = new Set();
  if (!STRICT && existsSync(BASELINE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
      const entries = Array.isArray(raw?.entries) ? raw.entries : [];
      baselineKeys = new Set(entries.map((e) => `${e.source}|${e.target}`));
    } catch (err) {
      console.error(
        `${SCRIPT_TAG} HARD ERROR — failed to parse baseline.\n` +
          `  path:   ${relative(REPO_ROOT, BASELINE_PATH)}\n` +
          `  reason: ${err instanceof Error ? err.message : String(err)}\n` +
          `  fix:    delete the file or regenerate via 'node scripts/check-spec-links.mjs --update-baseline'.`
      );
      process.exit(1);
    }
  }

  const newlyBroken = broken.filter((b) => !baselineKeys.has(keyOf(b)));
  const stale = [...baselineKeys].filter((k) => !currentKeys.has(k));

  if (broken.length === 0) {
    console.log(`${summary} OK — all relative links resolve.`);
    return;
  }

  if (newlyBroken.length === 0) {
    console.log(
      `${summary} OK — ${broken.length} pre-existing broken link(s) match baseline.` +
        (stale.length > 0
          ? ` Note: ${stale.length} baseline entr${stale.length === 1 ? "y is" : "ies are"} stale (resolved or removed); run --update-baseline to clean.`
          : "")
    );
    return;
  }

  console.error(
    `${SCRIPT_TAG} HARD ERROR — ${newlyBroken.length} NEW broken relative link(s) detected ` +
      `(${broken.length - newlyBroken.length} pre-existing in baseline).\n`
  );
  for (const b of newlyBroken) {
    console.error(
      `  source:   ${b.source}:${b.line}\n` +
        `  link:     [${b.text}](${b.target})\n` +
        `  missing:  ${b.resolved}\n` +
        `  reason:   target file does not exist on disk; rename or update the link.\n`
    );
  }
  console.error(
    summary +
      `\n${SCRIPT_TAG} If these breaks are intentional/pre-existing, run: node scripts/check-spec-links.mjs --update-baseline`
  );
  process.exit(1);
}

main();
