import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import Reporter from './extension-artifacts-reporter';

/*
 * Smoke test: synthesise an ERR_FILE_NOT_FOUND failure and verify the
 * reporter writes the expected artifact set.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const EXT_DIR = path.join(REPO_ROOT, 'chrome-extension');
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'test-results', 'extension-artifacts');

let createdExt = false;

beforeAll(() => {
  if (!fs.existsSync(EXT_DIR)) {
    createdExt = true;
    fs.mkdirSync(path.join(EXT_DIR, 'src/popup'), { recursive: true });
    fs.mkdirSync(path.join(EXT_DIR, 'src/options'), { recursive: true });
    fs.writeFileSync(
      path.join(EXT_DIR, 'manifest.json'),
      JSON.stringify(
        {
          manifest_version: 3,
          name: 'Smoke Ext',
          version: '0.0.0',
          action: { default_popup: 'src/popup/popup.html' },
          options_ui: { page: 'src/options/options.html' },
          background: { service_worker: 'background.js' },
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(EXT_DIR, 'src/popup/popup.html'), '<!doctype html>');
    fs.writeFileSync(path.join(EXT_DIR, 'src/options/options.html'), '<!doctype html>');
  }
});

afterAll(() => {
  if (createdExt) fs.rmSync(EXT_DIR, { recursive: true, force: true });
  if (fs.existsSync(ARTIFACTS_DIR)) fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
});

describe('ExtensionArtifactsReporter', () => {
  it('captures dir listing + resolved manifest fields on ERR_FILE_NOT_FOUND', async () => {
    const reporter = new Reporter();
    reporter.onBegin({} as never);

    const fakeTest = {
      id: 't1',
      titlePath: () => ['', 'chrome-extension', 'cold-start.spec.ts', 'Cold Start', 'svc worker'],
      parent: { project: () => ({ name: 'chrome-extension' }) },
    } as unknown as Parameters<Reporter['onTestEnd']>[0];

    const fakeResult = {
      status: 'failed',
      duration: 1234,
      errors: [
        {
          message: 'page.goto: net::ERR_FILE_NOT_FOUND at chrome-extension://abcd1234/popup.html',
          stack: 'at openPopup (tests/e2e/fixtures.ts:54)',
        },
      ],
    } as unknown as Parameters<Reporter['onTestEnd']>[1];

    reporter.onTestEnd(fakeTest, fakeResult);
    await reporter.onEnd({} as never);

    // index.json exists with one capture
    const indexPath = path.join(ARTIFACTS_DIR, 'index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(idx.totalCaptured).toBe(1);
    expect(idx.failures[0].attemptedUrl).toContain('chrome-extension://');
    expect(idx.failures[0].expectedFilePath).toBe('popup.html');

    // Per-test files
    const subdirs = fs.readdirSync(ARTIFACTS_DIR).filter((f) =>
      fs.statSync(path.join(ARTIFACTS_DIR, f)).isDirectory(),
    );
    expect(subdirs).toHaveLength(1);
    const sub = path.join(ARTIFACTS_DIR, subdirs[0]);
    for (const f of [
      'directory-listing.txt',
      'manifest.json',
      'manifest-resolved.json',
      'failure-context.txt',
    ]) {
      expect(fs.existsSync(path.join(sub, f))).toBe(true);
    }

    // Resolved manifest contains diagnosis pointing at path drift
    const resolved = JSON.parse(fs.readFileSync(path.join(sub, 'manifest-resolved.json'), 'utf8'));
    expect(resolved.manifest.popup.declared).toBe('src/popup/popup.html');
    expect(resolved.failure.expectedFilePath).toBe('popup.html');
    expect(resolved.failure.expectedFileExistsOnDisk).toBe(false);
    expect(resolved.failure.diagnosis).toMatch(/path drift|not present/i);
  });

  it('ignores failures unrelated to ERR_FILE_NOT_FOUND', async () => {
    const reporter = new Reporter();
    reporter.onBegin({} as never);

    const fakeTest = {
      id: 't2',
      titlePath: () => ['', 'chrome-extension', 'other.spec.ts', 'unrelated'],
      parent: { project: () => ({ name: 'chrome-extension' }) },
    } as unknown as Parameters<Reporter['onTestEnd']>[0];
    const fakeResult = {
      status: 'failed',
      duration: 100,
      errors: [{ message: 'expect(received).toBe(true)', stack: '' }],
    } as unknown as Parameters<Reporter['onTestEnd']>[1];

    reporter.onTestEnd(fakeTest, fakeResult);
    await reporter.onEnd({} as never);

    expect(fs.existsSync(path.join(ARTIFACTS_DIR, 'index.json'))).toBe(false);
  });
});
