#!/usr/bin/env node
/**
 * generate-spec-consistency-report.mjs
 *
 * On-demand generator for spec consistency reports (the same shape as
 * the Phase 8–10 closure note in `spec/99-consistency-report.md`).
 *
 * What it does:
 *   1. Inventories every top-level folder under `spec/` and checks for
 *      `00-overview.md` + `99-consistency-report.md`.
 *   2. Runs the link checker (`scripts/check-spec-links.mjs --strict`)
 *      and captures pass/fail + counts.
 *   3. Reads `.lovable/memory/index.md` and reports whether
 *      `mem://architecture/spec-organization` is referenced (Phase 9
 *      "memory sync" check).
 *   4. Lists files in `spec/validation-reports/` (Phase 10 evidence).
 *   5. Writes a timestamped Markdown report to
 *      `spec/validation-reports/<YYYY-MM-DD>-consistency-report.md`
 *      (the canonical location all prior audit reports live in).
 *
 * Output mirrors the existing `spec/99-consistency-report.md` sections
 * (Folder Inventory, Audit Checklist, Phase notes, Cross-References)
 * so the generated file can be linked from PRs verbatim.
 *
 * Run locally:    node scripts/generate-spec-consistency-report.mjs
 * Strict mode:    node scripts/generate-spec-consistency-report.mjs --strict
 *                   exits 1 if link check fails or memory sync row missing
 * Custom out:     node scripts/generate-spec-consistency-report.mjs --out=path/to/report.md
 *
 * Pure Node built-ins. Designed to be wired into CI or invoked manually.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SPEC_DIR = join(REPO_ROOT, 'spec');
const VALIDATION_DIR = join(SPEC_DIR, 'validation-reports');
const MEMORY_INDEX = join(REPO_ROOT, '.lovable', 'memory', 'index.md');

const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const outArg = argv.find((a) => a.startsWith('--out='));
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC; close enough for filenames)
const DEFAULT_OUT = join(VALIDATION_DIR, `${TODAY}-consistency-report.md`);
const outValue = outArg ? outArg.slice('--out='.length) : null;
const OUT_PATH = outValue
  ? (outValue.startsWith('/') ? outValue : join(REPO_ROOT, outValue))
  : DEFAULT_OUT;

// ─────────────────────────────────────────────────────────────
// Section 1 — Folder inventory
// ─────────────────────────────────────────────────────────────

function inventorySpecFolders() {
  if (!existsSync(SPEC_DIR)) {
    return { rows: [], error: `spec/ directory missing at ${SPEC_DIR}` };
  }
  const entries = readdirSync(SPEC_DIR)
    .filter((name) => {
      const p = join(SPEC_DIR, name);
      return statSync(p).isDirectory() && !name.startsWith('.');
    })
    .sort();

  const rows = entries.map((folder) => {
    const folderPath = join(SPEC_DIR, folder);
    const hasOverview = existsSync(join(folderPath, '00-overview.md'));
    const hasReport = existsSync(join(folderPath, '99-consistency-report.md'));
    const hasReadme = existsSync(join(folderPath, 'readme.md'));
    let status;
    if (hasOverview && hasReport) status = '✅ Compliant';
    else if (folder === '99-archive' && hasReadme) status = '✅ Compliant (archive)';
    else if (folder === 'validation-reports' && hasReadme) status = '✅ Populated';
    else if (!hasOverview && !hasReport && hasReadme) status = '📂 Notes-only';
    else status = '🟡 Incomplete';
    return { folder, hasOverview, hasReport, status };
  });
  return { rows, error: null };
}

// ─────────────────────────────────────────────────────────────
// Section 2 — Link check
// ─────────────────────────────────────────────────────────────

function runLinkCheck() {
  const scriptPath = join(REPO_ROOT, 'scripts', 'check-spec-links.mjs');
  if (!existsSync(scriptPath)) {
    return { passed: false, summary: 'check-spec-links.mjs not found', raw: '' };
  }
  const result = spawnSync('node', [scriptPath, '--strict'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const raw = `${result.stdout || ''}${result.stderr || ''}`.trim();
  // Pull a count line if the checker emits one (best-effort, format-agnostic)
  const filesMatch = raw.match(/(\d+)\s+(?:markdown\s+)?files?/i);
  const linksMatch = raw.match(/(\d+)\s+(?:relative\s+)?links?/i);
  const summary = result.status === 0
    ? `Pass — ${linksMatch ? linksMatch[0] : 'all relative links'} resolve${filesMatch ? ` across ${filesMatch[0]}` : ''}.`
    : `Fail — exit ${result.status}. See raw output below.`;
  return { passed: result.status === 0, summary, raw };
}

// ─────────────────────────────────────────────────────────────
// Section 3 — Memory sync
// ─────────────────────────────────────────────────────────────

function checkMemorySync() {
  if (!existsSync(MEMORY_INDEX)) {
    return {
      passed: false,
      summary: `memory index missing at ${relative(REPO_ROOT, MEMORY_INDEX)}`,
    };
  }
  const contents = readFileSync(MEMORY_INDEX, 'utf8');
  const hasSpecOrgEntry = /mem:\/\/architecture\/spec-organization/i.test(contents);
  // Count Core rules and Memories listed for at-a-glance reporting.
  const coreLines = (contents.match(/^- \*\*[^*]+\*\*:/gm) || []).length;
  const memoriesLines = (contents.match(/^- \[[^\]]+\]\(mem:\/\//gm) || []).length;
  return {
    passed: hasSpecOrgEntry,
    summary: hasSpecOrgEntry
      ? `Pass — spec-organization rule referenced; ${coreLines} Core rules, ${memoriesLines} Memories listed.`
      : `Fail — mem://architecture/spec-organization not referenced in mem://index.md.`,
    coreLines,
    memoriesLines,
    hasSpecOrgEntry,
  };
}

// ─────────────────────────────────────────────────────────────
// Section 4 — Validation reports inventory
// ─────────────────────────────────────────────────────────────

function inventoryValidationReports() {
  if (!existsSync(VALIDATION_DIR)) return { files: [], exists: false };
  const files = readdirSync(VALIDATION_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'readme.md')
    .sort();
  return { files, exists: true };
}

// ─────────────────────────────────────────────────────────────
// Compose Markdown report
// ─────────────────────────────────────────────────────────────

function compose({ inventory, linkCheck, memSync, validation }) {
  const compliant = inventory.rows.filter((r) => r.status.startsWith('✅')).length;
  const incomplete = inventory.rows.filter((r) => r.status.startsWith('🟡')).length;
  const total = inventory.rows.length;

  // Health score: 100 - (2 per incomplete) - (10 if link-check fails) - (10 if memory sync fails)
  let score = 100;
  score -= incomplete * 2;
  if (!linkCheck.passed) score -= 10;
  if (!memSync.passed) score -= 10;
  if (score < 0) score = 0;
  const grade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D';

  const inventoryRows = inventory.rows
    .map((r) => `| \`${r.folder}/\` | ${r.hasOverview ? '✅' : '—'} | ${r.hasReport ? '✅' : '—'} | ${r.status} |`)
    .join('\n');

  const validationList = validation.exists
    ? validation.files.length > 0
      ? validation.files.map((f) => `- \`${f}\``).join('\n')
      : '_(empty)_'
    : '_(folder missing)_';

  return `# Spec Consistency Report — ${TODAY}

**Generated by:** \`scripts/generate-spec-consistency-report.mjs\`
**Health Score:** ${score}/100 (${grade})
**Folders:** ${compliant} compliant / ${incomplete} incomplete / ${total} total

---

## 1. Top-Level Folder Inventory

| Folder | \`00-overview.md\` | \`99-consistency-report.md\` | Status |
|--------|-------------------|------------------------------|--------|
${inventoryRows}

---

## 2. Cross-Reference Repair (Phase 8 equivalent) — Link Check

**Result:** ${linkCheck.passed ? '✅ Pass' : '❌ Fail'}
**Summary:** ${linkCheck.summary}
**Command:** \`node scripts/check-spec-links.mjs --strict\`

${linkCheck.passed ? '' : `\n<details><summary>Raw checker output</summary>\n\n\`\`\`\n${linkCheck.raw}\n\`\`\`\n\n</details>\n`}

---

## 3. Memory Sync (Phase 9 equivalent)

**Result:** ${memSync.passed ? '✅ Pass' : '❌ Fail'}
**Summary:** ${memSync.summary}
**Index file:** \`${relative(REPO_ROOT, MEMORY_INDEX)}\`

| Check | Result |
|-------|--------|
| \`mem://architecture/spec-organization\` referenced | ${memSync.hasSpecOrgEntry ? '✅' : '❌'} |
| Core rules listed | ${memSync.coreLines ?? 'n/a'} |
| Memories listed | ${memSync.memoriesLines ?? 'n/a'} |

---

## 4. Final Validation (Phase 10 equivalent) — Reports Folder

**Folder:** \`spec/validation-reports/\` (${validation.exists ? validation.files.length + ' report(s)' : 'missing'})

${validationList}

---

## 5. Audit Checklist

| Check | Result |
|-------|--------|
| Every top-level folder has \`00-overview.md\` | ${inventory.rows.every((r) => r.hasOverview || r.status.includes('archive') || r.status.includes('Notes-only') || r.status.includes('Populated')) ? '✅ Pass' : '🟡 Partial'} |
| Every top-level folder has \`99-consistency-report.md\` | ${inventory.rows.every((r) => r.hasReport || r.status.includes('archive') || r.status.includes('Notes-only') || r.status.includes('Populated')) ? '✅ Pass' : '🟡 Partial'} |
| Cross-references resolve (Phase 8) | ${linkCheck.passed ? '✅ Pass' : '❌ Fail'} |
| Memory index synced (Phase 9) | ${memSync.passed ? '✅ Pass' : '❌ Fail'} |
| Validation reports populated (Phase 10) | ${validation.exists && validation.files.length > 0 ? '✅ Pass' : '🟡 Empty'} |

---

## Cross-References

- Master index: [\`../00-overview.md\`](../00-overview.md)
- Root consistency report: [\`../99-consistency-report.md\`](../99-consistency-report.md)
- Link checker: \`scripts/check-spec-links.mjs\`
- Memory index: \`.lovable/memory/index.md\`
- Generator: \`scripts/generate-spec-consistency-report.mjs\`
`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

function main() {
  const inventory = inventorySpecFolders();
  if (inventory.error) {
    console.error(`❌ ${inventory.error}`);
    process.exit(1);
  }

  const linkCheck = runLinkCheck();
  const memSync = checkMemorySync();
  const validation = inventoryValidationReports();

  const md = compose({ inventory, linkCheck, memSync, validation });

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md);

  console.log(`✓ Spec consistency report written to ${relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`  - Folders:    ${inventory.rows.length} (${inventory.rows.filter((r) => r.status.startsWith('✅')).length} compliant)`);
  console.log(`  - Link check: ${linkCheck.passed ? 'PASS' : 'FAIL'} — ${linkCheck.summary}`);
  console.log(`  - Memory sync: ${memSync.passed ? 'PASS' : 'FAIL'} — ${memSync.summary}`);
  console.log(`  - Validation reports: ${validation.exists ? validation.files.length : 'folder missing'}`);

  if (STRICT && (!linkCheck.passed || !memSync.passed)) {
    console.error('\n❌ --strict mode: failing because link-check or memory-sync did not pass.');
    process.exit(1);
  }
}

main();
