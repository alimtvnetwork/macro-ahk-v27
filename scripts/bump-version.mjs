#!/usr/bin/env node
/**
 * bump-version.mjs — Single source-of-truth version bump
 *
 * Usage:
 *   node scripts/bump-version.mjs <new-version>
 *   node scripts/bump-version.mjs patch|minor|major
 *
 * Updates ALL version files in one shot:
 *   - manifest.json                   (version)  ← Chrome extension manifest
 *   - src/shared/constants.ts         (EXTENSION_VERSION)
 *   - standalone-scripts/macro-controller/src/shared-state.ts (VERSION)
 *   - standalone-scripts/macro-controller/src/instruction.ts  (version)
 *   - standalone-scripts/macro-controller/dist/instruction.json (version)
 *   - standalone-scripts/marco-sdk/src/instruction.ts          (version)
 *   - standalone-scripts/marco-sdk/dist/instruction.json       (version)
 *   - standalone-scripts/xpath/src/instruction.ts              (version)
 *   - standalone-scripts/xpath/dist/instruction.json           (version)
 *
 * Also updates:
 *   - CHANGELOG.md              (inserts new version section header)
 *   - plan.md                   (updates Chrome Extension version refs)
 *
 * After running, both check-version-sync.mjs AND check-manifest-version.mjs will pass.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── Parse current version from constants.ts ─────────────────── */
function getCurrentVersion() {
  const constants = readFileSync(resolve(ROOT, "src/shared/constants.ts"), "utf-8");
  const m = constants.match(/EXTENSION_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
  if (!m) throw new Error("Cannot parse EXTENSION_VERSION from src/shared/constants.ts");
  return m[1];
}

/* ── Resolve target version ──────────────────────────────────── */
function resolveVersion(input) {
  const current = getCurrentVersion();
  const parts = current.split(".").map(Number);

  if (/^\d+\.\d+\.\d+$/.test(input)) return input;

  switch (input) {
    case "patch":
      parts[2]++;
      return parts.join(".");
    case "minor":
      parts[1]++;
      parts[2] = 0;
      return parts.join(".");
    case "major":
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      return parts.join(".");
    default:
      console.error(`Usage: node scripts/bump-version.mjs <version|patch|minor|major>`);
      console.error(`  Current version: ${current}`);
      process.exit(1);
  }
}

/* ── Replacement targets ─────────────────────────────────────── */
function getTargets(ver) {
  return [
    {
      // Chrome extension manifest — top-level "version" field.
      // Pattern is anchored to the first JSON key so we don't accidentally
      // match nested fields like minimum_chrome_version.
      path: "manifest.json",
      replacements: [
        { pattern: /("[Vv]ersion"\s*:\s*")[\d.]+(")/,         replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "src/shared/constants.ts",
      replacements: [
        { pattern: /(EXTENSION_VERSION\s*=\s*")[\d.]+(")/,  replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/macro-controller/src/shared-state.ts",
      replacements: [
        { pattern: /(VERSION\s*=\s*['"])[\d.]+(["'])/,      replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/macro-controller/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/macro-controller/dist/instruction.json",
      optional: true,
      replacements: [
        { pattern: /("[Vv]ersion"\s*:\s*")[\d.]+(")/,          replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/marco-sdk/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/marco-sdk/dist/instruction.json",
      optional: true,
      replacements: [
        { pattern: /("[Vv]ersion"\s*:\s*")[\d.]+(")/,          replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/xpath/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/xpath/dist/instruction.json",
      optional: true,
      replacements: [
        { pattern: /("[Vv]ersion"\s*:\s*")[\d.]+(")/,          replacement: `$1${ver}$2` },
      ],
    },
    {
      // P20 — Lovable Owner Switch / User Add / Common (registered for unified bump)
      path: "standalone-scripts/lovable-common/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/lovable-owner-switch/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
    {
      path: "standalone-scripts/lovable-user-add/src/instruction.ts",
      replacements: [
        { pattern: /([Vv]ersion:\s*")[\d.]+(")/,               replacement: `$1${ver}$2` },
      ],
    },
  ];
}

/* ── Main ────────────────────────────────────────────────────── */
const input = process.argv[2];
if (!input) {
  console.error(`Usage: node scripts/bump-version.mjs <version|patch|minor|major>`);
  console.error(`  Current version: ${getCurrentVersion()}`);
  process.exit(1);
}

const oldVer = getCurrentVersion();
const newVer = resolveVersion(input);

console.log(`Bumping version: ${oldVer} -> ${newVer}\n`);

let updated = 0;
let skipped = 0;

for (const target of getTargets(newVer)) {
  const fullPath = resolve(ROOT, target.path);

  if (!existsSync(fullPath)) {
    if (target.optional) {
      console.log(`  [SKIP] ${target.path} (not found — optional)`);
      skipped++;
      continue;
    }
    console.error(`  [FAIL] ${target.path} — required file not found`);
    process.exit(1);
  }

  let content = readFileSync(fullPath, "utf-8");
  let changed = false;

  for (const { pattern, replacement } of target.replacements) {
    const before = content;
    content = content.replace(pattern, replacement);
    if (content !== before) changed = true;
  }

  if (changed) {
    writeFileSync(fullPath, content, "utf-8");
    console.log(`  [OK]   ${target.path}`);
    updated++;
  } else {
    console.log(`  [--]   ${target.path} (already at ${newVer})`);
  }
}

/* ── Changelog: insert new version section ───────────────────── */
function updateChangelog(oldV, newV) {
  const changelogPath = resolve(ROOT, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    console.log(`  [SKIP] CHANGELOG.md (not found)`);
    return false;
  }

  const content = readFileSync(changelogPath, "utf-8");

  // Don't insert if section already exists
  if (content.includes(`## [v${newV}]`)) {
    console.log(`  [--]   CHANGELOG.md (v${newV} section already exists)`);
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  const newSection = [
    `## [v${newV}] — ${today}`,
    "",
    "### Added",
    "",
    "### Fixed",
    "",
    "### Changed",
    `- Version bump: ${oldV} → ${newV} (all version files synced)`,
    "",
    "---",
    "",
  ].join("\n");

  // Insert after the first "---" separator (which follows the header)
  const firstSepIdx = content.indexOf("\n---\n");
  if (firstSepIdx === -1) {
    console.log(`  [SKIP] CHANGELOG.md (could not find insertion point)`);
    return false;
  }

  const insertAt = firstSepIdx + "\n---\n".length;
  const updatedContent = content.slice(0, insertAt) + "\n" + newSection + content.slice(insertAt);
  writeFileSync(changelogPath, updatedContent, "utf-8");
  console.log(`  [OK]   CHANGELOG.md (inserted v${newV} section)`);
  return true;
}

/* ── plan.md: update extension version references ────────────── */
function updatePlan(oldV, newV) {
  const planPath = resolve(ROOT, "plan.md");
  if (!existsSync(planPath)) {
    console.log(`  [SKIP] plan.md (not found)`);
    return false;
  }

  let content = readFileSync(planPath, "utf-8");
  const before = content;

  // Update "Chrome Extension: vX.Y.Z" and "Extension vX.Y.Z" references
  content = content.replace(
    new RegExp(`Extension(?: v|: v?)${oldV.replace(/\./g, "\\.")}`, "g"),
    (m) => m.replace(oldV, newV),
  );
  // Update "at v2.X.Y with" pattern
  content = content.replace(
    new RegExp(`at v${oldV.replace(/\./g, "\\.")} with`, "g"),
    `at v${newV} with`,
  );

  if (content !== before) {
    writeFileSync(planPath, content, "utf-8");
    console.log(`  [OK]   plan.md (updated version refs)`);
    return true;
  }
  console.log(`  [--]   plan.md (no refs to update)`);
  return false;
}

/* ── Post-version-file updates ───────────────────────────────── */
const changelogUpdated = updateChangelog(oldVer, newVer);
const planUpdated = updatePlan(oldVer, newVer);

if (changelogUpdated) updated++;
if (planUpdated) updated++;

console.log(`\nDone: ${updated} file(s) updated, ${skipped} skipped.`);
console.log(`Run: node scripts/check-version-sync.mjs`);
