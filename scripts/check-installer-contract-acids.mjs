#!/usr/bin/env node
/**
 * check-installer-contract-acids.mjs
 *
 * Validates that AC-IDs in scripts/installer-contract.json (specSteps section)
 * are well-formed and unique BEFORE the drift checker runs. A malformed or
 * duplicated AC-ID would silently corrupt the contract used by both
 * install.sh and install.ps1.
 *
 * Rules enforced:
 *  1. specSteps section MUST exist and be a non-empty object.
 *  2. Each key MUST match /^AC-[1-9][0-9]*$/ (no leading zero, no AC-0).
 *  3. Each key MUST be unique in the raw JSON text (catches the case where
 *     a permissive JSON parser silently dedupes duplicate keys).
 *  4. Each value MUST be a non-empty string description.
 *
 * Exit codes:
 *  0 — all AC-IDs valid
 *  1 — one or more violations (full report printed)
 *  2 — contract file missing or unreadable
 *
 * Resolves: pre-flight gate for scripts/check-installer-contract.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const CONTRACT_PATH = resolve(SCRIPT_DIR, 'installer-contract.json');
const AC_ID_REGEX = /^AC-[1-9][0-9]*$/;

const rel = (p) => relative(REPO_ROOT, p) || p;

function fail(message, exitCode = 1) {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(exitCode);
}

if (!existsSync(CONTRACT_PATH)) {
  fail(`installer contract not found at ${rel(CONTRACT_PATH)}`, 2);
}

let raw;
try {
  raw = readFileSync(CONTRACT_PATH, 'utf8');
} catch (err) {
  fail(`unable to read ${rel(CONTRACT_PATH)}: ${err.message}`, 2);
}

let contract;
try {
  contract = JSON.parse(raw);
} catch (err) {
  fail(`${rel(CONTRACT_PATH)} is not valid JSON: ${err.message}`, 2);
}

const findings = [];

// ── Rule 1: specSteps must exist and be a non-empty object ────────────
const specSteps = contract.specSteps;
if (!specSteps || typeof specSteps !== 'object' || Array.isArray(specSteps)) {
  findings.push({
    rule: 'specSteps shape',
    location: `${rel(CONTRACT_PATH)}`,
    detail: '"specSteps" section is missing or not an object',
    hint: 'Add a "specSteps": { "AC-1": "…", … } section to the contract.',
  });
}

const specStepKeys = specSteps && typeof specSteps === 'object' && !Array.isArray(specSteps)
  ? Object.keys(specSteps)
  : [];

if (specSteps && specStepKeys.length === 0) {
  findings.push({
    rule: 'specSteps non-empty',
    location: `${rel(CONTRACT_PATH)}`,
    detail: '"specSteps" object is empty',
    hint: 'Add at least one AC-ID entry, e.g. "AC-1": "…".',
  });
}

// ── Locate line numbers for every AC-ID occurrence in the raw text ────
// Match the JSON key form: "AC-<digits>" appearing as a property.
// We scan the raw text so duplicates aren't silently collapsed by JSON.parse.
const lines = raw.split(/\r?\n/);
const occurrencesByKey = new Map(); // key -> [{line, raw}]
const keyLineRegex = /"(AC-[^"\\]*)"\s*:/g;

lines.forEach((lineText, idx) => {
  let match;
  keyLineRegex.lastIndex = 0;
  while ((match = keyLineRegex.exec(lineText)) !== null) {
    const key = match[1];
    if (!occurrencesByKey.has(key)) occurrencesByKey.set(key, []);
    occurrencesByKey.get(key).push({ line: idx + 1, raw: lineText.trim() });
  }
});

// ── Rule 2: well-formedness ────────────────────────────────────────────
for (const key of specStepKeys) {
  if (!AC_ID_REGEX.test(key)) {
    const occ = occurrencesByKey.get(key) ?? [];
    const where = occ.length
      ? occ.map((o) => `${rel(CONTRACT_PATH)}:${o.line}`).join(', ')
      : `${rel(CONTRACT_PATH)}`;
    findings.push({
      rule: 'AC-ID well-formed',
      location: where,
      detail: `"${key}" does not match /^AC-[1-9][0-9]*$/`,
      hint:
        'AC-IDs must be "AC-" followed by a positive integer with no leading zero ' +
        '(e.g. AC-1, AC-23). No suffixes, no AC-0, no AC-01.',
    });
  }
}

// ── Rule 3: uniqueness in the raw text (catches silent JSON dedupe) ────
for (const [key, occ] of occurrencesByKey) {
  if (occ.length > 1) {
    findings.push({
      rule: 'AC-ID unique',
      location: occ.map((o) => `${rel(CONTRACT_PATH)}:${o.line}`).join(', '),
      detail: `"${key}" is declared ${occ.length} times`,
      hint:
        'Remove the duplicate entry. JSON parsers silently keep the last value, ' +
        'which would corrupt the spec mapping without this check.',
    });
  }
}

// ── Rule 4: each value is a non-empty string ───────────────────────────
for (const key of specStepKeys) {
  const value = specSteps[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    const occ = occurrencesByKey.get(key) ?? [];
    const where = occ.length
      ? `${rel(CONTRACT_PATH)}:${occ[0].line}`
      : `${rel(CONTRACT_PATH)}`;
    findings.push({
      rule: 'AC-ID has description',
      location: where,
      detail: `"${key}" value is missing or not a non-empty string (got ${
        value === undefined ? 'undefined' : JSON.stringify(value)
      })`,
      hint: 'Provide a one-line human-readable description for the acceptance criterion.',
    });
  }
}

// ── Report ─────────────────────────────────────────────────────────────
if (findings.length === 0) {
  const validCount = specStepKeys.filter((k) => AC_ID_REGEX.test(k)).length;
  process.stdout.write(
    `✓ installer-contract AC-IDs OK (${validCount} well-formed, unique entries in ${rel(CONTRACT_PATH)})\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `\n✗ installer-contract AC-ID validation failed (${findings.length} finding${
    findings.length === 1 ? '' : 's'
  }):\n\n`,
);

const grouped = new Map();
for (const f of findings) {
  if (!grouped.has(f.rule)) grouped.set(f.rule, []);
  grouped.get(f.rule).push(f);
}

for (const [rule, items] of grouped) {
  process.stderr.write(`── ${rule} (${items.length}) ─────────────────────────\n`);
  for (const f of items) {
    process.stderr.write(`  • ${f.detail}\n`);
    process.stderr.write(`    at:   ${f.location}\n`);
    process.stderr.write(`    hint: ${f.hint}\n\n`);
  }
}

process.exit(1);
