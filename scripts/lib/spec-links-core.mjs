/**
 * scripts/lib/spec-links-core.mjs
 *
 * Shared primitives for the spec-link tooling family:
 *   - check-spec-links.mjs      (local, baseline-aware)
 *   - report-spec-links-ci.mjs  (CI strict + auto-resolve)
 *   - rewrite-spec-links.mjs    (auto-rewriter; uses suffixScore + buildIndex)
 *
 * Why centralise: the parser, skip rules, and exclude-dir logic MUST stay
 * byte-for-byte identical across the three scripts — drift between them
 * has historically caused false negatives in CI vs green local runs.
 *
 * All exports are pure functions or readers — no side effects at import time.
 *
 * Output convention follows the project's Code Red logging policy:
 *   exact path, missing item, reason — see
 *   mem://constraints/file-path-error-logging-code-red.md
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename, sep, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Repo root resolved relative to this file (`<root>/scripts/lib/…`). */
export const REPO_ROOT = resolve(__dirname, "..", "..");

/** Path to the shared on-disk config file. */
export const CONFIG_PATH = join(REPO_ROOT, "scripts", "check-spec-links.config.json");

/** Hard-coded fallbacks if the config file is missing or malformed. */
const DEFAULT_CONFIG = Object.freeze({
  scanRoots: ["spec"],
  excludeDirs: ["99-archive", "imported"],
  autoResolve: Object.freeze({
    enabled: false,
    minScore: 1,
    searchRoots: ["spec", ".lovable"],
  }),
});

/**
 * Load + normalise the on-disk config. Underscore-prefixed keys are stripped
 * (they are inline documentation in the JSON file). Missing fields fall back
 * to DEFAULT_CONFIG so a deleted/empty config still works.
 *
 * Returns an object of shape { config, source }:
 *   - config: fully-populated config (never null)
 *   - source: 'file' | 'defaults' | 'invalid'  — for diagnostic logging
 *
 * NEVER throws. A malformed config falls back to defaults with `source:'invalid'`
 * so the caller can warn but the build still proceeds.
 */
export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    return { config: cloneConfig(DEFAULT_CONFIG), source: "defaults", error: null };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    return {
      config: cloneConfig(DEFAULT_CONFIG),
      source: "invalid",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return { config: mergeConfig(DEFAULT_CONFIG, raw), source: "file", error: null };
}

function cloneConfig(c) {
  return {
    scanRoots: [...c.scanRoots],
    excludeDirs: [...c.excludeDirs],
    autoResolve: { ...c.autoResolve, searchRoots: [...c.autoResolve.searchRoots] },
  };
}

function mergeConfig(defaults, override) {
  const stripUnderscored = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith("_")));
  const o = stripUnderscored(override ?? {});
  const ar = stripUnderscored(o.autoResolve ?? {});
  return {
    scanRoots: Array.isArray(o.scanRoots) && o.scanRoots.length > 0
      ? o.scanRoots
      : [...defaults.scanRoots],
    excludeDirs: Array.isArray(o.excludeDirs)
      ? o.excludeDirs
      : [...defaults.excludeDirs],
    autoResolve: {
      enabled: typeof ar.enabled === "boolean" ? ar.enabled : defaults.autoResolve.enabled,
      minScore: typeof ar.minScore === "number" && ar.minScore >= 1
        ? ar.minScore
        : defaults.autoResolve.minScore,
      searchRoots: Array.isArray(ar.searchRoots) && ar.searchRoots.length > 0
        ? ar.searchRoots
        : [...defaults.autoResolve.searchRoots],
    },
  };
}

/* ------------------------------------------------------------------ */
/* Filesystem walking                                                 */
/* ------------------------------------------------------------------ */

/**
 * Recursively collect all `.md` files under `dir`, skipping any directory
 * whose own name appears in `excludeDirNames` (a Set of strings).
 */
export function collectMarkdownFiles(dir, excludeDirNames, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (excludeDirNames.has(entry)) continue;
      collectMarkdownFiles(full, excludeDirNames, out);
    } else if (st.isFile() && entry.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Markdown parsing (links + fenced-block stripping)                  */
/* ------------------------------------------------------------------ */

/** Strip fenced code blocks so we don't lint code samples. */
export function stripFencedBlocks(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    out.push(inFence ? "" : line);
  }
  return out.join("\n");
}

/** Returns true if the link target should be skipped (external / anchor / etc). */
export function isSkippableTarget(target) {
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

/** Markdown link regex — `[text](target "optional title")`. */
export const LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Extract markdown links (text, target, lineNumber) from a source string. */
export function extractLinks(source) {
  const stripped = stripFencedBlocks(source);
  const links = [];
  const lines = stripped.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    LINK_REGEX.lastIndex = 0;
    while ((match = LINK_REGEX.exec(line)) !== null) {
      links.push({ text: match[1], target: match[2], lineNumber: i + 1 });
    }
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* Path utilities                                                     */
/* ------------------------------------------------------------------ */

/** Convert any OS path to forward-slash form for matching/printing. */
export function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

/**
 * Resolve a markdown link's target to an absolute path on disk, after
 * stripping `#anchor` and `?query` parts.
 */
export function resolveLinkTarget(sourceFileAbs, target) {
  const cleanTarget = target.split("#")[0].split("?")[0];
  if (!cleanTarget) return null;
  return resolve(dirname(sourceFileAbs), cleanTarget);
}

/* ------------------------------------------------------------------ */
/* Auto-resolver: basename index + suffix-overlap scorer              */
/* (kept here so check + report + rewrite share IDENTICAL behaviour)  */
/* ------------------------------------------------------------------ */

/** Recursively collect all files (any extension) under `dir`. */
function collectAllFiles(dir, skipDirs, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (skipDirs.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectAllFiles(full, skipDirs, out);
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const INDEX_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".release",
  "skipped",
  "coverage",
]);

/**
 * Build an index: lowercase basename → array of absolute paths, scanning
 * every file under `searchRoots` (repo-relative). Missing roots are skipped
 * silently — the caller decides whether that's worth a warning.
 */
export function buildBasenameIndex(searchRoots) {
  const index = new Map();
  for (const rel of searchRoots) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = collectAllFiles(abs, INDEX_SKIP_DIRS);
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
 * Score a candidate absolute path against the original (broken) target by
 * counting how many trailing path segments match. Higher = better.
 *
 *   broken target `../../06-macro-controller/workspace-name/overview.md`
 *   candidate     `spec/21-app/02-features/macro-controller/workspace-name/overview.md`
 *   → trailing match = 3 (`workspace-name/overview.md` + numeric-prefix-shifted dir)
 *
 * Numeric-prefix swaps (`06-macro-controller` ↔ `10-macro-controller`) score
 * 0.9 instead of 1.0 so exact matches outrank renumberings.
 */
export function suffixScore(brokenTargetPath, candidateAbsPath) {
  const a = toPosix(brokenTargetPath).split("/").filter((s) => s && s !== ".");
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
    const stripPrefix = (s) => s.replace(/^\d+-/, "");
    if (stripPrefix(a[i]) === stripPrefix(b[j]) && stripPrefix(a[i]) !== a[i]) {
      score += 0.9;
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
 *
 * Returns:
 *   { winner: string|null,           // absolute path of best candidate, or null
 *     candidates: Array<{path,score}>,
 *     reason: string,                // why we chose / didn't choose
 *     confident: boolean }           // true when winner ≥ minScore AND beats runner-up
 */
export function findReplacement(brokenTarget, index, minScore) {
  const cleanTarget = brokenTarget.split("#")[0].split("?")[0];
  const base = basename(cleanTarget).toLowerCase();
  const candidates = index.get(base) ?? [];

  if (candidates.length === 0) {
    return {
      winner: null,
      candidates: [],
      reason: "no candidate file with matching basename",
      confident: false,
    };
  }

  const scored = candidates
    .map((c) => ({ path: c, score: suffixScore(cleanTarget, c) }))
    .sort((x, y) => y.score - x.score);

  const top = scored[0];
  const next = scored[1];

  if (top.score < minScore) {
    return {
      winner: null,
      candidates: scored,
      reason: `best candidate score ${top.score} below threshold ${minScore} (no path-suffix overlap)`,
      confident: false,
    };
  }
  if (next && next.score === top.score) {
    return {
      winner: top.path,
      candidates: scored,
      reason: `ambiguous — ${scored.filter((s) => s.score === top.score).length} candidates tied at score ${top.score}`,
      confident: false,
    };
  }
  return {
    winner: top.path,
    candidates: scored,
    reason: `top score ${top.score}`,
    confident: true,
  };
}

/** Compute a relative POSIX path from a markdown source file to a target. */
export function relativeFromSource(sourceFileAbs, targetAbs) {
  let rel = relative(dirname(sourceFileAbs), targetAbs);
  rel = toPosix(rel);
  if (!rel.startsWith(".") && !rel.startsWith("/")) rel = "./" + rel;
  return rel;
}
