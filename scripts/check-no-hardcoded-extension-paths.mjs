#!/usr/bin/env node
/**
 * check-no-hardcoded-extension-paths.mjs
 *
 * CI gate that enforces the manifest-derived navigation contract for E2E tests.
 *
 * Spec files (tests/e2e/*.spec.ts) MUST navigate to popup/options pages via
 * the shared helpers exported from `tests/e2e/fixtures.ts`:
 *
 *   import { openPopupPage, openOptionsPage, popupUrl, optionsUrl,
 *            extensionUrl, EXTENSION_PATHS } from './fixtures';
 *
 * They MUST NOT contain:
 *   - Literal `popup.html` or `options.html` strings
 *   - Hand-built `chrome-extension://${...}/...` template strings
 *
 * Why: the manifest is the single source of truth for both paths. Vite can
 * rename `src/popup/popup.html` at any time, and any spec that bypasses the
 * fixture helpers will silently break the next time the build layout shifts
 * (this is exactly what produced the ERR_FILE_NOT_FOUND wave in CI run #X).
 *
 * Flags:
 *   --json         JSON envelope for CI consumers
 *   --dir=<path>   Override scan directory (default: tests/e2e)
 *
 * Exit code 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const dirArg = args.find((a) => a.startsWith('--dir='));
const SCAN_DIR = dirArg
  ? resolve(REPO_ROOT, dirArg.slice('--dir='.length))
  : resolve(REPO_ROOT, 'tests/e2e');

// fixtures.ts is the SOLE place these literals/patterns are allowed.
const ALLOWED_FILES = new Set([resolve(SCAN_DIR, 'fixtures.ts')]);

// ─── Rules ───────────────────────────────────────────────────────────────────
//
// Each rule has:
//   - id     : stable identifier for CI consumers
//   - pattern: regex matched line-by-line
//   - hint   : actionable replacement guidance
//
// Patterns intentionally match WHOLE-LINE context (not just the literal) so
// false positives from inline comments are minimised.
const RULES = [
  {
    id: 'literal-popup-html',
    pattern: /\bpopup\.html\b/,
    hint: 'Replace `"popup.html"` with `EXTENSION_PATHS.popup` or use `popupUrl(extensionId)` / `openPopupPage(context, extensionId)`.',
  },
  {
    id: 'literal-options-html',
    pattern: /\boptions\.html\b/,
    hint: 'Replace `"options.html"` with `EXTENSION_PATHS.options` or use `optionsUrl(extensionId)` / `openOptionsPage(context, extensionId)`.',
  },
  {
    id: 'manual-chrome-extension-url',
    // matches:  `chrome-extension://${id}/...`  or  "chrome-extension://" + id + "/..."
    pattern: /chrome-extension:\/\/\$\{|['"`]chrome-extension:\/\/['"`]\s*\+/,
    hint: 'Do not template chrome-extension:// URLs by hand. Use `popupUrl()`, `optionsUrl()`, or `extensionUrl(id, EXTENSION_PATHS.<key>)` from fixtures.',
  },
];

// ─── Scan ────────────────────────────────────────────────────────────────────
function listSpecs(dir) {
  const out = [];
  for (const ent of readdirSync(dir)) {
    const full = join(dir, ent);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listSpecs(full));
    } else if (ent.endsWith('.spec.ts') || ent.endsWith('.spec.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
const specs = listSpecs(SCAN_DIR);

for (const file of specs) {
  if (ALLOWED_FILES.has(file)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);

  // Track simple `// eslint-disable-next-line` style escape hatch:
  // a line containing `allow-extension-path-literal` will skip the NEXT line.
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (/allow-extension-path-literal/.test(line)) {
      skipNext = true;
      continue;
    }

    // Skip lines that are pure comments (JSDoc / line comments). We test
    // whether the FIRST non-whitespace character starts a comment, because a
    // naive `replace(/\/\/.*$/)` strip would eat the `//` inside legitimate
    // `chrome-extension://...` URLs and silently mask violations.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relative(REPO_ROOT, file),
          line: i + 1,
          ruleId: rule.id,
          snippet: trimmed,
          hint: rule.hint,
        });
      }
    }
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────
const ok = violations.length === 0;

if (JSON_MODE) {
  process.stdout.write(
    JSON.stringify(
      {
        version: 1,
        ok,
        scanDir: relative(REPO_ROOT, SCAN_DIR),
        scannedFiles: specs.length,
        violations,
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(ok ? 0 : 1);
}

console.log('');
console.log(`E2E hard-coded extension path check`);
console.log(`Scanned: ${relative(REPO_ROOT, SCAN_DIR)}/  (${specs.length} spec file(s))`);
console.log('─'.repeat(72));

if (ok) {
  console.log('  ✅ No hard-coded popup.html / options.html / chrome-extension:// templates found.');
  console.log('');
  process.exit(0);
}

for (const v of violations) {
  console.log(`  ❌ ${v.file}:${v.line}  [${v.ruleId}]`);
  console.log(`        ${v.snippet}`);
  console.log(`        → ${v.hint}`);
}
console.log('─'.repeat(72));
console.log(`  ${violations.length} violation(s) across ${new Set(violations.map((v) => v.file)).size} file(s)`);
console.log('');
console.log('Spec files MUST use the shared helpers from tests/e2e/fixtures.ts:');
console.log('  popupUrl(id)         | optionsUrl(id)        | extensionUrl(id, path)');
console.log('  openPopupPage(ctx,id)| openOptionsPage(ctx,id)');
console.log('');
console.log('Escape hatch (use sparingly): place a `// allow-extension-path-literal`');
console.log('comment on the line immediately ABOVE an intentional literal.');
console.log('');
process.exit(1);
