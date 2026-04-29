#!/usr/bin/env node
/**
 * check-contract-checkers-wired.mjs
 *
 * Pre-merge CI lint: enumerates every `scripts/check-*-contract*.mjs` file
 * (any contract validator/drift checker) and fails if any of them is NOT
 * invoked from at least one workflow under `.github/workflows/**`.
 *
 * Why: contract checkers are the only thing standing between
 * installer-contract.json (and any future *-contract.json) and silent drift
 * across install.sh, install.ps1, installer-constants.{sh,ps1}. A new
 * checker that is committed but never wired into CI provides zero
 * protection. This script makes "you forgot to add it to a workflow" a
 * red CI signal at PR review time.
 *
 * Detection rules:
 *  - Discovery: any file matching `scripts/check-*-contract*.mjs`
 *    (covers `check-installer-contract.mjs`,
 *     `check-installer-contract-acids.mjs`, and future `check-<x>-contract.mjs`).
 *  - "Invoked from a workflow" means the script's basename or
 *    `scripts/<basename>` path appears as a substring in at least one
 *    `.github/workflows/*.yml` or `*.yaml` file. Both `node scripts/foo.mjs`
 *    and `npm run check:foo` (which expands to that script in package.json)
 *    are accepted, by also resolving npm script names declared in
 *    package.json that exec the checker.
 *
 * Exit codes:
 *  0 — every contract checker is referenced by ≥1 workflow
 *  1 — one or more checkers are orphaned (full report printed)
 *  2 — repo layout problem (no workflows dir, no scripts dir, etc.)
 *
 * Resolves: pre-merge gate that catches "checker added but not wired".
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, basename, join } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCRIPTS_DIR = SCRIPT_DIR;
const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github', 'workflows');
const PACKAGE_JSON = resolve(REPO_ROOT, 'package.json');

const CHECKER_PATTERN = /^check-.*-contract.*\.mjs$/;

const rel = (p) => relative(REPO_ROOT, p) || p;

function bail(message, exitCode = 2) {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(exitCode);
}

if (!existsSync(SCRIPTS_DIR) || !statSync(SCRIPTS_DIR).isDirectory()) {
  bail(`scripts directory not found at ${rel(SCRIPTS_DIR)}`);
}
if (!existsSync(WORKFLOWS_DIR) || !statSync(WORKFLOWS_DIR).isDirectory()) {
  bail(`workflows directory not found at ${rel(WORKFLOWS_DIR)}`);
}

// ── Discover contract checkers ────────────────────────────────────────
const checkers = readdirSync(SCRIPTS_DIR)
  .filter((name) => CHECKER_PATTERN.test(name))
  .sort();

if (checkers.length === 0) {
  process.stdout.write(
    `✓ no scripts/check-*-contract*.mjs files found — nothing to lint\n`,
  );
  process.exit(0);
}

// ── Load workflow file contents ───────────────────────────────────────
const workflowFiles = readdirSync(WORKFLOWS_DIR)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({
    path: join(WORKFLOWS_DIR, name),
    name,
    content: readFileSync(join(WORKFLOWS_DIR, name), 'utf8'),
  }));

if (workflowFiles.length === 0) {
  bail(`no workflow files found under ${rel(WORKFLOWS_DIR)}`);
}

// ── Build npm-script → script-file map (for `npm run …` invocations) ──
// If a workflow runs `npm run check:foo` and package.json maps that to
// `node scripts/check-foo-contract.mjs`, we treat the workflow as
// referencing the checker.
const npmScriptToCheckerFile = new Map(); // npm script name -> basename
if (existsSync(PACKAGE_JSON)) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  } catch (err) {
    bail(`unable to parse ${rel(PACKAGE_JSON)}: ${err.message}`);
  }
  const scripts = pkg.scripts ?? {};
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') continue;
    for (const checker of checkers) {
      // Match `scripts/<checker>` or bare `<checker>` in the script command.
      if (
        command.includes(`scripts/${checker}`) ||
        command.includes(`scripts\\${checker}`)
      ) {
        if (!npmScriptToCheckerFile.has(scriptName)) {
          npmScriptToCheckerFile.set(scriptName, checker);
        }
      }
    }
  }
}

// ── For each checker, determine whether it is referenced ──────────────
const findings = []; // { checker, hint }
const referenceMap = new Map(); // checker -> [ "workflow.yml (direct|npm:foo)" ]

for (const checker of checkers) {
  const refs = [];

  for (const wf of workflowFiles) {
    // Direct reference: substring match on basename or scripts/<basename>.
    // Both forms are checked so we don't miss `node scripts/foo.mjs`,
    // `bash -c 'node scripts/foo.mjs'`, or workflow `paths:` filters.
    const directHit =
      wf.content.includes(`scripts/${checker}`) ||
      wf.content.includes(`scripts\\${checker}`);

    if (directHit) {
      refs.push(`${wf.name} (direct)`);
      continue;
    }

    // Indirect via `npm run <script>` / `pnpm run <script>` / `yarn <script>`
    // where that npm script command runs the checker.
    for (const [npmScriptName, mappedChecker] of npmScriptToCheckerFile) {
      if (mappedChecker !== checker) continue;
      const patterns = [
        `npm run ${npmScriptName}`,
        `npm run -s ${npmScriptName}`,
        `pnpm run ${npmScriptName}`,
        `pnpm ${npmScriptName}`,
        `yarn ${npmScriptName}`,
        `yarn run ${npmScriptName}`,
      ];
      if (patterns.some((p) => wf.content.includes(p))) {
        refs.push(`${wf.name} (npm:${npmScriptName})`);
        break;
      }
    }
  }

  // De-duplicate while preserving order.
  const uniqRefs = [...new Set(refs)];
  referenceMap.set(checker, uniqRefs);

  if (uniqRefs.length === 0) {
    findings.push({
      checker,
      hint:
        `Add a step to a workflow under .github/workflows/ that runs ` +
        `\`node scripts/${checker}\` (or define an npm script that does and ` +
        `invoke it via \`npm run …\`). Without this, the checker provides ` +
        `zero CI protection.`,
    });
  }
}

// ── Report ────────────────────────────────────────────────────────────
if (findings.length === 0) {
  process.stdout.write(
    `✓ all ${checkers.length} contract checker${
      checkers.length === 1 ? '' : 's'
    } wired into CI:\n`,
  );
  for (const checker of checkers) {
    const refs = referenceMap.get(checker) ?? [];
    process.stdout.write(`  • scripts/${checker}\n`);
    for (const r of refs) process.stdout.write(`      ↳ ${r}\n`);
  }
  process.exit(0);
}

process.stderr.write(
  `\n✗ contract checker wiring lint failed (${findings.length} orphaned ` +
    `checker${findings.length === 1 ? '' : 's'}):\n\n`,
);
for (const f of findings) {
  process.stderr.write(`  • scripts/${f.checker}\n`);
  process.stderr.write(`    hint: ${f.hint}\n\n`);
}
process.stderr.write(
  `Workflows scanned (${workflowFiles.length}): ` +
    workflowFiles.map((w) => w.name).join(', ') +
    `\n`,
);
process.exit(1);
