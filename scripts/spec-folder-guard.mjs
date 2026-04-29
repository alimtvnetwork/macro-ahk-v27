#!/usr/bin/env node
/**
 * spec-folder-guard.mjs
 *
 * Idempotent guard against Lovable's auto-cleanup pruning sparse or newly
 * created spec/ directories.
 *
 * What it does:
 *   1. Reads spec/.spec-folder-registry.json
 *   2. Re-creates any required folder that has been pruned
 *   3. Drops a `.lovable-keep` sentinel into every directory that contains
 *      zero direct files (subdirectory-only or empty), so the directory is
 *      never seen as "empty" by any heuristic
 *   4. Reports any required folder that is missing both a sentinel and
 *      direct files (impossible after step 3, but defensive-checked)
 *
 * Usage:
 *   node scripts/spec-folder-guard.mjs            # repair + report
 *   node scripts/spec-folder-guard.mjs --check    # report only, exit 1 if drift
 *   node scripts/spec-folder-guard.mjs --verbose  # print every action
 *
 * Run this:
 *   - Before starting any multi-phase spec work
 *   - At the end of each phase (catches drift introduced by the phase)
 *   - In CI as a pre-commit / pre-build check (use --check)
 *
 * Exit codes:
 *   0  — all clean, or repairs successful
 *   1  — drift detected in --check mode (no repairs made)
 *   2  — registry missing or malformed
 *   3  — filesystem error during repair
 */

import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const REGISTRY_PATH = join(REPO_ROOT, 'spec', '.spec-folder-registry.json');
const SENTINEL_NAME = '.lovable-keep';

const SENTINEL_BODY = `# Auto-cleanup safeguard

This sentinel file exists to prevent Lovable's auto-cleanup process from
pruning this directory. Do not delete it manually — it is regenerated on
every run of \`scripts/spec-folder-guard.mjs\`.

If you remove all "real" content from this directory, the sentinel ensures
the directory itself survives so future restoration is straightforward.

Registry: spec/.spec-folder-registry.json
Guard:    scripts/spec-folder-guard.mjs
`;

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const VERBOSE = args.has('--verbose');

const log = {
  info: (msg) => console.log(`[guard] ${msg}`),
  verbose: (msg) => VERBOSE && console.log(`[guard] · ${msg}`),
  warn: (msg) => console.warn(`[guard] ⚠ ${msg}`),
  error: (msg) => console.error(`[guard] ✖ ${msg}`),
  ok: (msg) => console.log(`[guard] ✓ ${msg}`),
};

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(p) {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function hasDirectFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.some((e) => e.isFile());
  } catch {
    return false;
  }
}

async function loadRegistry() {
  if (!(await exists(REGISTRY_PATH))) {
    log.error(`Registry missing at ${relative(REPO_ROOT, REGISTRY_PATH)}`);
    log.error('Cannot operate without the registry. Restore it from version control.');
    process.exit(2);
  }
  try {
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
    const json = JSON.parse(raw);
    if (!Array.isArray(json.requiredFolders)) {
      throw new Error('registry.requiredFolders must be an array');
    }
    return json;
  } catch (err) {
    log.error(`Registry malformed: ${err.message}`);
    process.exit(2);
  }
}

async function walkSpecTree() {
  const root = join(REPO_ROOT, 'spec');
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    out.push(dir);
    for (const e of entries) {
      if (e.isDirectory()) {
        await walk(join(dir, e.name));
      }
    }
  }
  await walk(root);
  return out;
}

async function main() {
  log.info(`Repo root: ${REPO_ROOT}`);
  log.info(`Mode: ${CHECK_ONLY ? 'CHECK (read-only)' : 'REPAIR'}`);

  const registry = await loadRegistry();
  log.info(`Registry version: ${registry.version} — ${registry.requiredFolders.length} required folders`);

  let missing = 0;
  let recreated = 0;
  let sentinelsAdded = 0;
  let driftReports = [];

  // Pass 1 — every registered folder must exist
  for (const entry of registry.requiredFolders) {
    const abs = join(REPO_ROOT, entry.path);
    if (!(await isDirectory(abs))) {
      missing += 1;
      driftReports.push(`MISSING DIR: ${entry.path}`);
      if (CHECK_ONLY) continue;
      try {
        await fs.mkdir(abs, { recursive: true });
        recreated += 1;
        log.ok(`Recreated ${entry.path}`);
      } catch (err) {
        log.error(`Cannot recreate ${entry.path}: ${err.message}`);
        process.exit(3);
      }
    } else {
      log.verbose(`exists: ${entry.path}`);
    }
  }

  // Pass 2 — every directory in spec/ that lacks direct files gets a sentinel
  const allDirs = await walkSpecTree();
  for (const dir of allDirs) {
    const rel = relative(REPO_ROOT, dir);
    const sentinelPath = join(dir, SENTINEL_NAME);
    const hasFiles = await hasDirectFiles(dir);
    if (hasFiles) {
      // If a sentinel exists in a now-populated dir, leave it (harmless,
      // and removing it would itself constitute a write we don't want
      // to make in --check mode).
      log.verbose(`populated: ${rel}`);
      continue;
    }
    if (await exists(sentinelPath)) {
      log.verbose(`sentinel-ok: ${rel}`);
      continue;
    }
    driftReports.push(`MISSING SENTINEL: ${rel}/.lovable-keep`);
    if (CHECK_ONLY) continue;
    try {
      await fs.writeFile(sentinelPath, SENTINEL_BODY, 'utf8');
      sentinelsAdded += 1;
      log.ok(`Sentinel added: ${rel}/.lovable-keep`);
    } catch (err) {
      log.error(`Cannot write sentinel in ${rel}: ${err.message}`);
      process.exit(3);
    }
  }

  // Summary
  console.log('');
  log.info('───── Summary ─────');
  log.info(`Registered folders : ${registry.requiredFolders.length}`);
  log.info(`Folders missing    : ${missing}`);
  log.info(`Folders recreated  : ${recreated}`);
  log.info(`Sentinels added    : ${sentinelsAdded}`);
  log.info(`Total spec/ dirs   : ${allDirs.length}`);

  if (driftReports.length > 0 && CHECK_ONLY) {
    console.log('');
    log.warn(`Drift detected (${driftReports.length} issue${driftReports.length === 1 ? '' : 's'}):`);
    for (const r of driftReports) console.warn(`  · ${r}`);
    console.log('');
    log.warn('Run without --check to repair.');
    process.exit(1);
  }

  if (driftReports.length === 0) {
    log.ok('All clean — no action needed.');
  } else {
    log.ok(`Repaired ${driftReports.length} issue${driftReports.length === 1 ? '' : 's'}.`);
  }
  process.exit(0);
}

main().catch((err) => {
  log.error(`Unexpected failure: ${err.stack || err.message}`);
  process.exit(3);
});
