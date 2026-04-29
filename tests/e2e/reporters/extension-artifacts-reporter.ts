import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Reporter,
  TestCase,
  TestResult,
  FullConfig,
  FullResult,
} from '@playwright/test/reporter';

/*
 * Extension Artifacts Reporter
 *
 * Triggered when an E2E test fails with `net::ERR_FILE_NOT_FOUND` while
 * navigating to a `chrome-extension://…` URL. These failures almost always
 * indicate the extension build dir is missing the file Playwright tried to
 * load (popup.html, options.html, etc.).
 *
 * On every matching failure, this reporter writes a self-contained dump to
 * `test-results/extension-artifacts/<sanitized-test-id>/`:`
 *
 *   - directory-listing.txt   — full recursive `ls -la` of the resolved
 *                               extension build directory (the same probe
 *                               logic as fixtures.ts / global-setup.ts).
 *   - manifest.json           — verbatim copy of the built manifest.
 *   - manifest-resolved.json  — only the fields E2E tests actually navigate
 *                               to (action.default_popup, options_ui.page,
 *                               background.service_worker, web_accessible_…)
 *                               plus the *expected vs actual* path that
 *                               Chromium failed to load.
 *   - failure-context.txt     — test title, project, error message, stack.
 *
 * Aggregate index (`index.json`) is written at run end so CI consumers can
 * enumerate every captured failure without walking the directory tree.
 *
 * Spec authority: tests/e2e/fixtures.ts (path probing rules) + the existing
 * global-setup.ts (build-dir resolution).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ─── Config ──────────────────────────────────────────────────────────────────
// Mirror of fixtures.ts EXTENSION_CANDIDATES — duplicated here on purpose so
// the reporter has zero runtime imports from the extension fixture (keeps
// reporter robust even if fixtures.ts fails to load).
const EXTENSION_CANDIDATES = [
  path.join(REPO_ROOT, 'chrome-extension'),
  path.join(REPO_ROOT, 'dist'),
];

const ARTIFACTS_ROOT = path.join(
  REPO_ROOT,
  'test-results',
  'extension-artifacts',
);

const ERR_PATTERN = /ERR_FILE_NOT_FOUND/i;
const EXT_URL_RE = /(chrome-extension:\/\/[^/\s"']+\/[^/\s"')]+)/i;

// ─── Types ───────────────────────────────────────────────────────────────────
interface CapturedFailure {
  testId: string;
  title: string;
  projectName: string;
  attemptedUrl: string | null;
  expectedFilePath: string | null;
  artifactDir: string;
  capturedAt: string;
}

interface BuiltManifest {
  name?: string;
  version?: string;
  manifest_version?: number;
  action?: { default_popup?: string };
  options_page?: string;
  options_ui?: { page?: string };
  background?: { service_worker?: string; type?: string };
  web_accessible_resources?: unknown;
  content_scripts?: unknown;
  permissions?: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickExtensionDir(): string {
  for (const dir of EXTENSION_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  }
  return EXTENSION_CANDIDATES[0];
}

function readManifest(extDir: string): { raw: string; parsed: BuiltManifest | null } {
  const manifestPath = path.join(extDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { raw: '', parsed: null };
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    return { raw, parsed: JSON.parse(raw) as BuiltManifest };
  } catch {
    return { raw: '', parsed: null };
  }
}

/** Produce a stable, filesystem-safe id from the test's title path. */
function sanitizeTestId(test: TestCase): string {
  const parts = test.titlePath().filter(Boolean);
  const slug = parts
    .join('--')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180);
  return slug || `test-${test.id}`;
}

/** Recursive directory listing with sizes, similar to `ls -la -R`. */
function listDirectoryRecursive(root: string): string {
  if (!fs.existsSync(root)) {
    return `[reporter] directory does not exist: ${root}\n`;
  }
  const out: string[] = [];
  out.push(`# Recursive listing of: ${root}`);
  out.push(`# Generated: ${new Date().toISOString()}`);
  out.push('');

  function walk(dir: string, depth: number) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      out.push(`${'  '.repeat(depth)}[unreadable: ${(err as Error).message}]`);
      return;
    }
    // Sort directories first, then files, both alphabetical.
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full);
      if (ent.isDirectory()) {
        out.push(`${'  '.repeat(depth)}📁 ${ent.name}/`);
        walk(full, depth + 1);
      } else {
        let size = '?';
        try {
          size = fs.statSync(full).size.toString();
        } catch {
          /* ignore */
        }
        out.push(`${'  '.repeat(depth)}📄 ${ent.name}  (${size} bytes)  [${rel}]`);
      }
    }
  }
  walk(root, 0);
  return out.join('\n') + '\n';
}

/**
 * Extract the path Chromium tried to load from an error message of the form:
 *   page.goto: net::ERR_FILE_NOT_FOUND at chrome-extension://abcd…/popup.html
 */
function parseAttemptedUrl(errorMessage: string): {
  url: string | null;
  filePath: string | null;
} {
  const match = errorMessage.match(EXT_URL_RE);
  if (!match) return { url: null, filePath: null };
  const url = match[1];
  const filePath = url.replace(/^chrome-extension:\/\/[^/]+\//, '');
  return { url, filePath };
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeWrite(file: string, content: string | Buffer) {
  try {
    fs.writeFileSync(file, content);
  } catch (err) {
    console.error(`[extension-artifacts-reporter] write failed: ${file} — ${(err as Error).message}`);
  }
}

// ─── Reporter ────────────────────────────────────────────────────────────────

export default class ExtensionArtifactsReporter implements Reporter {
  private captured: CapturedFailure[] = [];
  private rootDir: string = '';

  onBegin(_config: FullConfig): void {
    this.rootDir = ARTIFACTS_ROOT;
    // Fresh output dir per run so stale captures don't leak between runs.
    try {
      if (fs.existsSync(this.rootDir)) {
        fs.rmSync(this.rootDir, { recursive: true, force: true });
      }
      ensureDir(this.rootDir);
    } catch {
      // Non-fatal: reporter will still try to write per-test dirs below.
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;

    // Aggregate every error/attachment message; bail early if no
    // ERR_FILE_NOT_FOUND signal anywhere.
    const errorMessages = result.errors
      .map((e) => `${e.message ?? ''}\n${e.stack ?? ''}`)
      .join('\n');
    if (!ERR_PATTERN.test(errorMessages)) return;

    // ─── Resolve the same extension dir the fixture would have used ────────
    const extDir = pickExtensionDir();
    const { raw: manifestRaw, parsed: manifest } = readManifest(extDir);

    // ─── Per-test artifact dir ──────────────────────────────────────────────
    const testId = sanitizeTestId(test);
    const dir = path.join(this.rootDir, testId);
    ensureDir(dir);

    // 1. Full directory listing
    safeWrite(
      path.join(dir, 'directory-listing.txt'),
      listDirectoryRecursive(extDir),
    );

    // 2. Verbatim manifest (if present)
    if (manifestRaw) {
      safeWrite(path.join(dir, 'manifest.json'), manifestRaw);
    } else {
      safeWrite(
        path.join(dir, 'manifest.json'),
        '[reporter] manifest.json not present in build dir\n',
      );
    }

    // 3. Resolved fields the E2E layer actually relies on, plus the diff
    //    between expected (manifest-declared) and attempted (Chromium URL).
    const { url: attemptedUrl, filePath: expectedFilePath } =
      parseAttemptedUrl(errorMessages);

    const popupDeclared = manifest?.action?.default_popup ?? null;
    const optionsDeclared =
      manifest?.options_page ?? manifest?.options_ui?.page ?? null;
    const swDeclared = manifest?.background?.service_worker ?? null;

    const popupExists = popupDeclared
      ? fs.existsSync(path.join(extDir, popupDeclared))
      : false;
    const optionsExists = optionsDeclared
      ? fs.existsSync(path.join(extDir, optionsDeclared))
      : false;
    const expectedExists = expectedFilePath
      ? fs.existsSync(path.join(extDir, expectedFilePath))
      : null;

    const resolved = {
      extensionDir: extDir,
      probeOrder: EXTENSION_CANDIDATES,
      manifest: {
        name: manifest?.name,
        version: manifest?.version,
        manifest_version: manifest?.manifest_version,
        popup: { declared: popupDeclared, existsOnDisk: popupExists },
        options: { declared: optionsDeclared, existsOnDisk: optionsExists },
        serviceWorker: { declared: swDeclared, existsOnDisk: swDeclared ? fs.existsSync(path.join(extDir, swDeclared)) : false },
        webAccessibleResources: manifest?.web_accessible_resources ?? null,
        contentScripts: manifest?.content_scripts ?? null,
      },
      failure: {
        attemptedUrl,
        expectedFilePath,
        expectedFileExistsOnDisk: expectedExists,
        diagnosis: this.diagnose(expectedFilePath, popupDeclared, optionsDeclared, expectedExists),
      },
    };

    safeWrite(
      path.join(dir, 'manifest-resolved.json'),
      JSON.stringify(resolved, null, 2) + '\n',
    );

    // 4. Failure context for human readers
    const ctx = [
      `Test:       ${test.titlePath().filter(Boolean).join(' › ')}`,
      `Project:    ${test.parent.project()?.name ?? '(unknown)'}`,
      `Status:     ${result.status}`,
      `Duration:   ${result.duration}ms`,
      `Captured:   ${new Date().toISOString()}`,
      ``,
      `Attempted URL:        ${attemptedUrl ?? '(could not parse)'}`,
      `Expected file path:   ${expectedFilePath ?? '(could not parse)'}`,
      `Resolved ext dir:     ${extDir}`,
      ``,
      `─── Errors ───`,
      ...result.errors.map((e, i) => `[${i}] ${e.message ?? ''}\n${e.stack ?? ''}`),
    ].join('\n');
    safeWrite(path.join(dir, 'failure-context.txt'), ctx);

    // 5. Track for end-of-run index
    this.captured.push({
      testId,
      title: test.titlePath().filter(Boolean).join(' › '),
      projectName: test.parent.project()?.name ?? 'unknown',
      attemptedUrl,
      expectedFilePath,
      artifactDir: path.relative(REPO_ROOT, dir),
      capturedAt: new Date().toISOString(),
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (this.captured.length === 0) return;

    const indexPath = path.join(this.rootDir, 'index.json');
    safeWrite(
      indexPath,
      JSON.stringify(
        {
          version: 1,
          generatedAt: new Date().toISOString(),
          totalCaptured: this.captured.length,
          extensionDir: pickExtensionDir(),
          failures: this.captured,
        },
        null,
        2,
      ) + '\n',
    );

    console.log(
      `\n📦 [extension-artifacts-reporter] Captured ${this.captured.length} ERR_FILE_NOT_FOUND failure(s) → ${path.relative(REPO_ROOT, this.rootDir)}/`,
    );
    for (const cap of this.captured) {
      console.log(`   • ${cap.title}\n     → ${cap.artifactDir}`);
    }
  }

  /** Produce a one-line plain-English diagnosis pointing at the most likely root cause. */
  private diagnose(
    expectedFilePath: string | null,
    popupDeclared: string | null,
    optionsDeclared: string | null,
    expectedExists: boolean | null,
  ): string {
    if (!expectedFilePath) return 'No chrome-extension URL parsed from error.';
    if (expectedExists) {
      return `File EXISTS in build dir — failure cause is unrelated to missing file (check permissions or service-worker readiness).`;
    }
    if (popupDeclared && expectedFilePath !== popupDeclared && /popup\.html$/i.test(expectedFilePath)) {
      return `Test navigated to "${expectedFilePath}" but manifest declares popup at "${popupDeclared}". Spec/test path drift — update the test or fixture to use the manifest-declared path.`;
    }
    if (optionsDeclared && expectedFilePath !== optionsDeclared && /options\.html$/i.test(expectedFilePath)) {
      return `Test navigated to "${expectedFilePath}" but manifest declares options at "${optionsDeclared}". Spec/test path drift — update the test or fixture to use the manifest-declared path.`;
    }
    return `File "${expectedFilePath}" not present in build dir — likely missing from vite extension build output. Check vite.config.extension.ts inputs and copyProjectScripts() plugin.`;
  }
}
