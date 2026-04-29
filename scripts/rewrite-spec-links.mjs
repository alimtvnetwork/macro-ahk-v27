#!/usr/bin/env node
/**
 * rewrite-spec-links.mjs
 *
 * Automatic link-rewriter for broken markdown links under `spec/`.
 *
 * What it does:
 *  - Scans every `.md` file under `spec/` for relative links (same parser
 *    rules as `scripts/check-spec-links.mjs`: skips fenced code blocks,
 *    external URLs, anchors, root-relative, mem://, knowledge://, and
 *    false-positive TS/Go generics).
 *  - For each link whose resolved target does not exist on disk, searches
 *    for a candidate replacement by matching the BASENAME across the
 *    indexable roots (`spec/`, `.lovable/`, repo root for top-level files).
 *  - Picks the best candidate using a path-suffix overlap score against the
 *    original (broken) target; ties are reported as ambiguous and skipped.
 *  - Rewrites the link in place, preserving `#anchor` and `?query` parts.
 *  - Defaults to dry-run. Pass `--apply` to actually write changes.
 *
 * Usage:
 *    node scripts/rewrite-spec-links.mjs            # dry-run (no writes)
 *    node scripts/rewrite-spec-links.mjs --apply    # write changes
 *    node scripts/rewrite-spec-links.mjs --apply --verbose
 *
 * Output (Code Red logging):
 *    For every change: source path, original link, new link, reason.
 *    For every skip:   source path, original link, reason.
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative, basename, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const SPEC_ROOT = join(REPO_ROOT, "spec");

const SCRIPT_TAG = "[rewrite-spec-links]";

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has("--apply");
const VERBOSE = argv.has("--verbose");

// --- Roots searched for candidate target files. Order matters for tie-break:
//     spec first, then .lovable, then repo root for top-level files.
const SEARCH_ROOTS = [
  { label: "spec", abs: SPEC_ROOT },
  { label: ".lovable", abs: join(REPO_ROOT, ".lovable") },
];

// --- Directories to skip when indexing (perf + noise reduction).
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".release",
  "skipped",
  "coverage",
]);

/** Recursively collect all files under a directory, honoring SKIP_DIRS. */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectFiles(full, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** Recursively collect only `.md` files under `spec/`. */
function collectMarkdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectMarkdownFiles(full, out);
    } else if (st.isFile() && entry.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip fenced code blocks so we don't rewrite code samples. */
function stripFencedBlocks(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push({ line, code: true });
      continue;
    }
    out.push({ line, code: inFence });
  }
  return out;
}

/** Same skip rules as check-spec-links.mjs. */
function isSkippableTarget(target) {
  if (!target) return true;
  if (target.startsWith("#")) return true;
  if (target.startsWith("/")) return true;
  if (target.startsWith("mem://")) return true;
  if (target.startsWith("knowledge://")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return true;
  if (!/[/.#]/.test(target)) return true;
  if (target === "..." || target.endsWith("(") || target.includes("(")) return true;
  return false;
}

/** Convert any path to forward-slash form for matching/printing. */
function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

/**
 * Build an index: basename (lowercase) -> array of absolute paths.
 * We index every file under SEARCH_ROOTS (not just .md) because some links
 * point at .json / .ts fixtures.
 */
function buildIndex() {
  const index = new Map();
  for (const root of SEARCH_ROOTS) {
    if (!existsSync(root.abs)) continue;
    const files = collectFiles(root.abs);
    for (const f of files) {
      const key = basename(f).toLowerCase();
      const arr = index.get(key) ?? [];
      arr.push(f);
      index.set(key, arr);
    }
  }
  return index;
}

/**
 * Score a candidate path against the broken target by counting how many
 * trailing path segments match. Higher = better.
 *
 * Example: broken target `../../06-macro-controller/workspace-name/overview.md`
 *          candidate     `spec/21-app/02-features/macro-controller/workspace-name/overview.md`
 *          → trailing match = 3 (`workspace-name/overview.md` + numeric-prefix-shifted dir)
 */
function suffixScore(brokenTargetPath, candidateAbsPath) {
  const a = toPosix(brokenTargetPath).split("/").filter((s) => s && s !== ".");
  // Strip leading `..` from broken target — they are navigation, not identity.
  while (a.length > 0 && a[0] === "..") a.shift();
  const b = toPosix(candidateAbsPath).split("/").filter(Boolean);
  let i = a.length - 1;
  let j = b.length - 1;
  let score = 0;
  while (i >= 0 && j >= 0) {
    if (a[i] === b[j]) {
      score++;
      i--;
      j--;
      continue;
    }
    // Allow numeric-prefix swap: `06-macro-controller` ↔ `10-macro-controller`.
    const stripPrefix = (s) => s.replace(/^\d+-/, "");
    if (stripPrefix(a[i]) === stripPrefix(b[j]) && stripPrefix(a[i]) !== a[i]) {
      score += 0.9; // slightly less than exact
      i--;
      j--;
      continue;
    }
    break;
  }
  return score;
}

/**
 * Find the best replacement absolute path for a broken target.
 * Returns { winner, candidates, reason }.
 */
function findReplacement(sourceFileAbs, brokenTarget, index) {
  const cleanTarget = brokenTarget.split("#")[0].split("?")[0];
  const base = basename(cleanTarget).toLowerCase();
  const candidates = index.get(base) ?? [];

  if (candidates.length === 0) {
    return { winner: null, candidates: [], reason: "no candidate file with matching basename" };
  }

  const scored = candidates
    .map((c) => ({ path: c, score: suffixScore(cleanTarget, c) }))
    .sort((x, y) => y.score - x.score);

  const top = scored[0];
  const next = scored[1];

  // Need a clear winner: best score >= 1 and strictly greater than runner-up.
  if (top.score < 1) {
    return {
      winner: null,
      candidates: scored,
      reason: `best candidate score ${top.score} below threshold 1 (no path-suffix overlap)`,
    };
  }
  if (next && next.score === top.score) {
    return {
      winner: null,
      candidates: scored,
      reason: `ambiguous — ${scored.filter((s) => s.score === top.score).length} candidates tied at score ${top.score}`,
    };
  }

  return { winner: top.path, candidates: scored, reason: `top score ${top.score}` };
}

/** Compute a relative POSIX path from sourceFile's directory to targetAbs. */
function relativeFromSource(sourceFileAbs, targetAbs) {
  let rel = relative(dirname(sourceFileAbs), targetAbs);
  rel = toPosix(rel);
  if (!rel.startsWith(".") && !rel.startsWith("/")) rel = "./" + rel;
  return rel;
}

/** Markdown link regex (text, target). Same as check-spec-links. */
const LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function main() {
  if (!existsSync(SPEC_ROOT)) {
    console.error(
      `${SCRIPT_TAG} HARD ERROR — spec root not found.\n` +
        `  path: ${SPEC_ROOT}\n` +
        `  missing: directory 'spec/'\n` +
        `  reason: this script must be run from repo root and 'spec/' must exist.`
    );
    process.exit(1);
  }

  console.log(`${SCRIPT_TAG} mode: ${APPLY ? "APPLY (will write changes)" : "DRY-RUN (no writes)"}`);
  console.log(`${SCRIPT_TAG} indexing candidate files...`);
  const index = buildIndex();
  console.log(`${SCRIPT_TAG} indexed ${[...index.values()].reduce((n, a) => n + a.length, 0)} files across ${index.size} unique basenames.`);

  const mdFiles = collectMarkdownFiles(SPEC_ROOT);
  console.log(`${SCRIPT_TAG} scanning ${mdFiles.length} markdown files under spec/...`);

  let totalLinks = 0;
  let brokenLinks = 0;
  let rewritten = 0;
  let skippedAmbiguous = 0;
  let skippedNoCandidate = 0;
  const filesChanged = new Set();

  for (const file of mdFiles) {
    const original = readFileSync(file, "utf8");
    const lineMeta = stripFencedBlocks(original);
    const lines = lineMeta.map((m) => m.line);
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      if (lineMeta[i].code) continue; // never rewrite inside code fences

      let line = lines[i];
      LINK_REGEX.lastIndex = 0;
      let match;
      const replacements = [];

      while ((match = LINK_REGEX.exec(line)) !== null) {
        const fullMatch = match[0];
        const text = match[1];
        const target = match[2];

        if (isSkippableTarget(target)) continue;
        totalLinks++;

        const cleanTarget = target.split("#")[0].split("?")[0];
        if (!cleanTarget) continue;

        const resolved = resolve(dirname(file), cleanTarget);
        if (existsSync(resolved)) continue; // not broken

        brokenLinks++;

        const { winner, candidates, reason } = findReplacement(file, target, index);

        if (!winner) {
          if (candidates.length === 0) skippedNoCandidate++;
          else skippedAmbiguous++;
          if (VERBOSE) {
            console.log(
              `${SCRIPT_TAG} SKIP\n` +
                `  source:   ${relative(REPO_ROOT, file)}:${i + 1}\n` +
                `  link:     [${text}](${target})\n` +
                `  reason:   ${reason}\n` +
                (candidates.length > 0
                  ? `  candidates:\n${candidates
                      .slice(0, 5)
                      .map((c) => `    - ${relative(REPO_ROOT, c.path)} (score ${c.score})`)
                      .join("\n")}\n`
                  : "")
            );
          }
          continue;
        }

        // Build new target preserving #anchor and ?query.
        const fragment = target.includes("#") ? "#" + target.split("#").slice(1).join("#") : "";
        const query = target.includes("?")
          ? "?" + target.split("?").slice(1).join("?").split("#")[0]
          : "";
        const newRel = relativeFromSource(file, winner);
        const newTarget = newRel + query + fragment;
        const newLink = `[${text}](${newTarget})`;

        replacements.push({ from: fullMatch, to: newLink, target, newTarget, line: i + 1 });
      }

      if (replacements.length > 0) {
        let newLine = line;
        for (const r of replacements) {
          newLine = newLine.split(r.from).join(r.to); // safe: link text is unique within line in practice
        }
        if (newLine !== line) {
          lines[i] = newLine;
          changed = true;
          for (const r of replacements) {
            rewritten++;
            console.log(
              `${SCRIPT_TAG} REWRITE\n` +
                `  source:   ${relative(REPO_ROOT, file)}:${r.line}\n` +
                `  before:   ${r.target}\n` +
                `  after:    ${r.newTarget}\n`
            );
          }
        }
      }
    }

    if (changed) {
      filesChanged.add(file);
      if (APPLY) {
        writeFileSync(file, lines.join("\n"), "utf8");
      }
    }
  }

  console.log(
    `\n${SCRIPT_TAG} summary:\n` +
      `  scanned files:       ${mdFiles.length}\n` +
      `  total links checked: ${totalLinks}\n` +
      `  broken links:        ${brokenLinks}\n` +
      `  rewritten:           ${rewritten}\n` +
      `  skipped (ambiguous): ${skippedAmbiguous}\n` +
      `  skipped (no match):  ${skippedNoCandidate}\n` +
      `  files changed:       ${filesChanged.size}\n` +
      `  mode:                ${APPLY ? "APPLY (written)" : "DRY-RUN (no writes)"}\n`
  );

  if (!APPLY && rewritten > 0) {
    console.log(`${SCRIPT_TAG} re-run with --apply to write changes.`);
  }
}

main();
