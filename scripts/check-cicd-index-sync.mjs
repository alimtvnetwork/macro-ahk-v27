#!/usr/bin/env node
/**
 * check-cicd-index-sync.mjs
 *
 * Cross-checks `.lovable/cicd-index.md` against the per-issue files in
 * `.lovable/cicd-issues/*.md` and fails the build when they drift.
 *
 * What this guards against:
 *   1. An issue file exists on disk but is NOT listed in the index.
 *   2. The index lists a file that does NOT exist on disk.
 *   3. The index says "Active" but the issue file's `## Status` line
 *      contains "Resolved" (or vice-versa) — the exact desync that
 *      hid issue #01 (`installer-contract`) for two days.
 *
 * Pure Node built-ins. Exits with code 1 on any mismatch and prints
 * `::error file=…::` annotations so GitHub Actions surfaces them
 * inline on the PR diff.
 *
 * Run locally:   node scripts/check-cicd-index-sync.mjs
 * Run in CI:     wired into `.github/workflows/ci.yml` (preflight job).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INDEX_PATH = join(REPO_ROOT, '.lovable', 'cicd-index.md');
const ISSUES_DIR = join(REPO_ROOT, '.lovable', 'cicd-issues');

const errors = [];

/** Emit a GitHub Actions error annotation + accumulate for final exit. */
function fail(file, line, message) {
  const rel = relative(REPO_ROOT, file).replace(/\\/g, '/');
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    const lineAttr = line ? `,line=${line}` : '';
    console.log(`::error file=${rel}${lineAttr}::${message}`);
  }
  errors.push(`${rel}${line ? `:${line}` : ''} — ${message}`);
}

// ─────────────────────────────────────────────────────────────
// 1. Load index + parse rows
// ─────────────────────────────────────────────────────────────

if (!existsSync(INDEX_PATH)) {
  console.error(`❌ Missing index: ${relative(REPO_ROOT, INDEX_PATH)}`);
  process.exit(1);
}
if (!existsSync(ISSUES_DIR)) {
  console.error(`❌ Missing issues dir: ${relative(REPO_ROOT, ISSUES_DIR)}`);
  process.exit(1);
}

const indexLines = readFileSync(INDEX_PATH, 'utf8').split('\n');

/**
 * Parse one section of the index (Active or Resolved) into rows of
 * { file, status, lineNumber } by walking lines and reading any markdown
 * table rows that contain a link to `./cicd-issues/...`.
 */
function parseSection(sectionHeader) {
  const startIdx = indexLines.findIndex((l) => l.trim() === sectionHeader);
  if (startIdx === -1) return [];
  const rows = [];
  for (let i = startIdx + 1; i < indexLines.length; i++) {
    const line = indexLines[i];
    if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
    // Match: | … | [`name.md`](./cicd-issues/name.md) | … | … | ✅ Resolved | … |
    const linkMatch = line.match(/\(\.\/cicd-issues\/([^)]+\.md)\)/);
    if (!linkMatch) continue;
    const fileName = linkMatch[1];
    const statusMatch = line.match(/(✅\s*Resolved|🔴\s*Active|🟡\s*In Progress|⚠️\s*Active|Active|Resolved|In Progress)/i);
    const status = statusMatch ? statusMatch[0].toLowerCase() : '(none)';
    rows.push({ file: fileName, status, lineNumber: i + 1 });
  }
  return rows;
}

const activeRows = parseSection('## Active').map((r) => ({ ...r, section: 'active' }));
const resolvedRows = parseSection('## Resolved').map((r) => ({ ...r, section: 'resolved' }));
const allIndexRows = [...activeRows, ...resolvedRows];
const indexedFiles = new Set(allIndexRows.map((r) => r.file));

// ─────────────────────────────────────────────────────────────
// 2. Load issue files on disk
// ─────────────────────────────────────────────────────────────

const diskFiles = readdirSync(ISSUES_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

// ─────────────────────────────────────────────────────────────
// 3. Check A — every disk file is listed in the index
// ─────────────────────────────────────────────────────────────

for (const f of diskFiles) {
  if (!indexedFiles.has(f)) {
    fail(
      INDEX_PATH,
      null,
      `cicd-issues/${f} exists on disk but is not listed in .lovable/cicd-index.md (add it under ## Active or ## Resolved).`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Check B — every indexed row points to a real file
// ─────────────────────────────────────────────────────────────

for (const row of allIndexRows) {
  const diskPath = join(ISSUES_DIR, row.file);
  if (!existsSync(diskPath)) {
    fail(
      INDEX_PATH,
      row.lineNumber,
      `Index references cicd-issues/${row.file} but that file does not exist on disk.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 5. Check C — index status matches the file's `## Status` line
// ─────────────────────────────────────────────────────────────

function statusFromFile(fileContents) {
  const lines = fileContents.split('\n');
  const headerIdx = lines.findIndex((l) => /^##\s+Status\b/i.test(l));
  if (headerIdx === -1) return { kind: 'unknown', lineNumber: null };
  // Look at the next non-blank line for the actual status text.
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^##\s/.test(t)) break;
    if (/resolved/i.test(t)) return { kind: 'resolved', lineNumber: i + 1 };
    if (/active|open|in.?progress/i.test(t)) return { kind: 'active', lineNumber: i + 1 };
    return { kind: 'unknown', lineNumber: i + 1 };
  }
  return { kind: 'unknown', lineNumber: null };
}

for (const row of allIndexRows) {
  const diskPath = join(ISSUES_DIR, row.file);
  if (!existsSync(diskPath)) continue; // already reported above
  const contents = readFileSync(diskPath, 'utf8');
  const fileStatus = statusFromFile(contents);
  const indexSaysResolved = /resolved/i.test(row.status);
  const indexSaysActive = /active|in.?progress/i.test(row.status);

  if (fileStatus.kind === 'resolved' && row.section === 'active') {
    fail(
      diskPath,
      fileStatus.lineNumber,
      `Issue file is Resolved but index lists it under ## Active. Move row to ## Resolved in .lovable/cicd-index.md.`,
    );
  }
  if (fileStatus.kind === 'active' && row.section === 'resolved') {
    fail(
      diskPath,
      fileStatus.lineNumber,
      `Issue file is still Active but index lists it under ## Resolved. Update one or the other.`,
    );
  }
  if (fileStatus.kind === 'resolved' && indexSaysActive) {
    fail(
      INDEX_PATH,
      row.lineNumber,
      `Index status column says "Active" but cicd-issues/${row.file} ## Status is Resolved.`,
    );
  }
  if (fileStatus.kind === 'active' && indexSaysResolved) {
    fail(
      INDEX_PATH,
      row.lineNumber,
      `Index status column says "Resolved" but cicd-issues/${row.file} ## Status is Active.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Final report
// ─────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error('\n❌ .lovable/cicd-index.md is out of sync with cicd-issues/:\n');
  for (const e of errors) console.error(`   - ${e}`);
  console.error(`\n${errors.length} mismatch${errors.length === 1 ? '' : 'es'} found.\n`);
  process.exit(1);
}

console.log(
  `✓ .lovable/cicd-index.md in sync with ${diskFiles.length} cicd-issues/*.md file${diskFiles.length === 1 ? '' : 's'}.`,
);
