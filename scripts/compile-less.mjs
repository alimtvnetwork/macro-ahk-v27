#!/usr/bin/env node
/**
 * compile-less.mjs — LESS -> CSS compiler (CLI-independent) with content-hash cache.
 *
 * Usage: node scripts/compile-less.mjs <input.less> <output.css>
 *
 * Caching strategy
 * ────────────────
 * Computes a SHA-256 fingerprint over:
 *   - every *.less file in the input file's directory tree
 *   - the installed `less` package version (from node_modules/less/package.json)
 *   - the absolute output path (so two outputs from the same input don't collide)
 *
 * The fingerprint is written to:
 *   <outputDir>/.cache/<outputBaseName>.fingerprint.json
 *
 * On subsequent runs, if BOTH the output CSS exists AND the fingerprint matches,
 * the compiler is skipped entirely and we report "[CACHE HIT]". Otherwise we
 * recompile and rewrite the fingerprint.
 *
 * CI can additionally cache the output dir + .cache sidecar with actions/cache
 * keyed on the *.less source hash for cross-run persistence.
 *
 * Logs the exact invocation, resolved absolute input/output paths, and output
 * size on success so CI failures and successes are easy to scan.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
} from "fs";
import { dirname, resolve, relative, join, basename } from "path";
import { createHash } from "crypto";
import less from "less";

/* ─── arg parsing & banner ─────────────────────────────────────── */

const [, , inputFile, outputFile] = process.argv;

const cwd = process.cwd();
const argv = process.argv.slice(1).map((a) => {
  const rel = relative(cwd, a);
  return rel && !rel.startsWith("..") ? rel : a;
});
const cmdLine = `node ${argv.join(" ")}`;

console.log(`[compile-less] cwd     : ${cwd}`);
console.log(`[compile-less] command : ${cmdLine}`);

if (!inputFile || !outputFile) {
  console.error("[compile-less] FAIL: missing arguments");
  console.error("  Usage: node scripts/compile-less.mjs <input.less> <output.css>");
  process.exit(1);
}

const inputAbs = resolve(inputFile);
const outputAbs = resolve(outputFile);
const outputDir = dirname(outputAbs);
const cacheDir = join(outputDir, ".cache");
const fingerprintPath = join(cacheDir, `${basename(outputAbs)}.fingerprint.json`);

console.log(`[compile-less] input   : ${inputFile}`);
console.log(`[compile-less]   (abs) : ${inputAbs}`);
console.log(`[compile-less] output  : ${outputFile}`);
console.log(`[compile-less]   (abs) : ${outputAbs}`);
console.log(`[compile-less] cache   : ${relative(cwd, fingerprintPath) || fingerprintPath}`);

if (!existsSync(inputAbs)) {
  console.error(`[compile-less] FAIL: input file not found`);
  console.error(`  Path     : ${inputAbs}`);
  console.error(`  Argument : ${inputFile}`);
  console.error(`  Reason   : file does not exist on disk`);
  process.exit(1);
}

/* ─── fingerprint helpers ──────────────────────────────────────── */

/**
 * Recursively collect every *.less file under the input's directory.
 * We hash the whole tree (not just the entrypoint) because @import siblings
 * can be edited without touching index.less.
 */
function collectLessSources(rootDir) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip nested .cache / node_modules / dist so we never hash our own outputs.
        if (entry.name === ".cache" || entry.name === "node_modules" || entry.name === "dist") continue;
        walk(abs);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".less")) {
        out.push(abs);
      }
    }
  };
  walk(rootDir);
  return out.sort();
}

function getLessPackageVersion() {
  // less is a direct devDependency — try the standard resolution.
  try {
    const lessPkgPath = require.resolve("less/package.json");
    return JSON.parse(readFileSync(lessPkgPath, "utf-8")).version ?? "unknown";
  } catch {
    // ESM fallback: reach into node_modules manually from cwd upwards.
    let dir = cwd;
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, "node_modules", "less", "package.json");
      if (existsSync(candidate)) {
        try {
          return JSON.parse(readFileSync(candidate, "utf-8")).version ?? "unknown";
        } catch {
          return "unknown";
        }
      }
      dir = dirname(dir);
    }
    return "unknown";
  }
}

// Tiny CommonJS-style require shim for ESM (used only by getLessPackageVersion).
import { createRequire } from "module";
const require = createRequire(import.meta.url);

function computeFingerprint(sources, lessVersion) {
  const hash = createHash("sha256");
  hash.update(`less@${lessVersion}\n`);
  hash.update(`output:${outputAbs}\n`);
  hash.update(`schema:v1\n`);
  for (const src of sources) {
    let content;
    try {
      content = readFileSync(src);
    } catch (err) {
      // Treat unreadable files as fingerprint differences so we always recompile.
      content = Buffer.from(`<unreadable:${err && err.message ? err.message : "?"}>`);
    }
    const fileHash = createHash("sha256").update(content).digest("hex");
    hash.update(`${relative(cwd, src) || src}\t${fileHash}\n`);
  }
  return hash.digest("hex");
}

function readStoredFingerprint() {
  if (!existsSync(fingerprintPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(fingerprintPath, "utf-8"));
    if (raw && typeof raw.fingerprint === "string") return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStoredFingerprint(record) {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  writeFileSync(fingerprintPath, JSON.stringify(record, null, 2), "utf-8");
}

/* ─── cache check ──────────────────────────────────────────────── */

const lessVersion = getLessPackageVersion();
const sources = collectLessSources(dirname(inputAbs));
const currentFingerprint = computeFingerprint(sources, lessVersion);
const stored = readStoredFingerprint();

if (
  process.env.MARCO_LESS_NO_CACHE !== "1" &&
  stored !== null &&
  stored.fingerprint === currentFingerprint &&
  existsSync(outputAbs)
) {
  const sizeKb = (statSync(outputAbs).size / 1024).toFixed(2);
  console.log(
    `[compile-less] CACHE HIT (less@${lessVersion}, ${sources.length} source(s)) — skipping recompile`,
  );
  console.log(
    `[compile-less] OK      : ${inputFile} -> ${outputFile} (${sizeKb} KB, cached)`,
  );
  process.exit(0);
}

if (process.env.MARCO_LESS_NO_CACHE === "1") {
  console.log("[compile-less] cache   : DISABLED via MARCO_LESS_NO_CACHE=1");
} else if (stored === null) {
  console.log(`[compile-less] cache   : MISS (no prior fingerprint)`);
} else if (!existsSync(outputAbs)) {
  console.log(`[compile-less] cache   : MISS (output missing)`);
} else {
  console.log(`[compile-less] cache   : MISS (sources changed)`);
}

/* ─── compile ──────────────────────────────────────────────────── */

const startedAt = Date.now();

try {
  const lessSource = readFileSync(inputAbs, "utf-8");
  const rendered = await less.render(lessSource, {
    filename: inputAbs,
    paths: [dirname(inputAbs)],
    javascriptEnabled: true,
  });

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`[compile-less] mkdir   : ${outputDir}`);
  }

  const css = rendered.css || "";
  writeFileSync(outputAbs, css, "utf-8");

  // Persist fingerprint AFTER successful write so a failed compile never
  // poisons the cache.
  writeStoredFingerprint({
    fingerprint: currentFingerprint,
    lessVersion,
    sourceCount: sources.length,
    output: outputAbs,
    generatedAt: new Date().toISOString(),
  });

  const sizeBytes = statSync(outputAbs).size;
  const sizeKb = (sizeBytes / 1024).toFixed(2);
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `[compile-less] OK      : ${inputFile} -> ${outputFile} (${sizeKb} KB, ${elapsedMs} ms, ${sources.length} source(s))`,
  );
} catch (error) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  const elapsedMs = Date.now() - startedAt;

  // Reproducer block — print every datum needed to re-run this compile by
  // hand. Keep keys aligned for easy scanning in CI logs.
  console.error(`[compile-less] FAIL: ${message}`);
  console.error(`  Command       : ${cmdLine}`);
  console.error(`  CWD           : ${cwd}`);
  console.error(`  Input (arg)   : ${inputFile}`);
  console.error(`  Input (abs)   : ${inputAbs}`);
  console.error(`  Input exists  : ${existsSync(inputAbs) ? "yes" : "NO"}`);
  console.error(`  Output (arg)  : ${outputFile}`);
  console.error(`  Output (abs)  : ${outputAbs}`);
  console.error(`  Output dir    : ${outputDir}`);
  console.error(`  Output dir ok : ${existsSync(outputDir) ? "yes" : "NO (will be created on success)"}`);
  console.error(`  Cache file    : ${fingerprintPath}`);
  console.error(`  less version  : ${lessVersion}`);
  console.error(`  Source files  : ${sources.length} *.less under ${dirname(inputAbs)}`);
  console.error(`  Fingerprint   : ${currentFingerprint.slice(0, 16)}…`);
  console.error(`  Elapsed       : ${elapsedMs} ms`);

  if (error && typeof error === "object") {
    if ("filename" in error && error.filename) {
      console.error(`  Error file    : ${error.filename}`);
    }
    if ("line" in error) {
      console.error(`  Error location: line ${error.line}, column ${error.column ?? "?"}`);
    }
    if ("type" in error && error.type) {
      console.error(`  Error type    : ${error.type}`);
    }
    if ("extract" in error && Array.isArray(error.extract)) {
      console.error(`  Source extract:`);
      for (const line of error.extract) {
        if (line !== undefined && line !== null) console.error(`    | ${line}`);
      }
    }
  }

  console.error(`[compile-less] Re-run locally with:`);
  console.error(`  ${cmdLine}`);

  // Compact one-line CI summary — grep-friendly, fits in a single GitHub
  // Actions log row, includes the most actionable fields:
  //   less version, elapsed ms, error type/location, and the first 1–2
  //   trimmed lines of the source extract (joined with " ⏎ " so it stays
  //   on a single physical line).
  const errExtract = (error && typeof error === "object" && "extract" in error && Array.isArray(error.extract))
    ? error.extract
        .filter((l) => l !== undefined && l !== null && String(l).trim() !== "")
        .slice(0, 2)
        .map((l) => String(l).trim().slice(0, 120))
        .join(" ⏎ ")
    : "";
  const errType = (error && typeof error === "object" && "type" in error && error.type) ? String(error.type) : "Error";
  const errLoc = (error && typeof error === "object" && "line" in error)
    ? `:${error.line}:${error.column ?? "?"}`
    : "";
  const summaryParts = [
    `less@${lessVersion}`,
    `${elapsedMs}ms`,
    `${errType}${errLoc}`,
    errExtract !== "" ? `extract="${errExtract}"` : null,
  ].filter((p) => p !== null);
  console.error(`[compile-less] SUMMARY ${inputFile} -> ${outputFile} | ${summaryParts.join(" | ")}`);

  process.exit(1);
}
