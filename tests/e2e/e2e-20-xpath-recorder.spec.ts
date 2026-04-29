import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId } from './fixtures';

/**
 * E2E-20 — XPath Recorder Toggle + Capture Flow
 *
 * Verify the XPath recording mode captures and exports paths.
 * Priority: P2 | Auto: ⚠️ | Est: 5 min
 *
 * Pass criteria:
 *   - Hover highlighting works
 *   - XPath priority strategy produces optimal paths
 *   - Export is valid
 */
test.describe('E2E-20 — XPath Recorder', () => {
  test('Ctrl+Shift+R activates recorder overlay', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1: Press Ctrl+Shift+R on a matched page
    const page = await context.newPage();
    await page.goto('https://example.com');
    await page.keyboard.press('Control+Shift+R');

    // TODO: verify overlay with "Recording" badge appears

    test.skip();
    await context.close();
  });

  test('hover highlights elements', async () => {
    // Step 2: Hover over element → colored border highlight
    test.skip();
  });

  test('click captures XPath with priority strategy', async () => {
    // Step 3: Click element → XPath captured (ID > testid > Role+Text > Positional)
    // Step 4: Capture 3 elements → overlay dashboard shows 3 entries
    test.skip();
  });

  test('copy all exports to clipboard', async () => {
    // Step 5: "Copy All" → XPaths on clipboard as formatted list
    test.skip();
  });

  test('export downloads JSON with metadata', async () => {
    // Step 6: "Export" → JSON file with XPaths + metadata
    test.skip();
  });

  test('Ctrl+Shift+R again deactivates recorder', async () => {
    // Step 7: Toggle off → overlay removed
    test.skip();
  });
});
