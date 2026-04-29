import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions } from './fixtures';

/**
 * E2E-04 — Script Injection (Isolated World)
 *
 * Verify a content script executes in the isolated world without page variable access.
 * Priority: P0 | Auto: ✅ | Est: 3 min
 *
 * Pass criteria:
 *   - Script runs in isolation; window.__pageVar is undefined
 *   - Log entry created in logs.db
 */
test.describe('E2E-04 — Script Injection (Isolated World)', () => {
  test('isolated script cannot access page variables', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1: Create script via Options → Script Library
    const options = await openOptions(context, extensionId);
    // TODO: create script with content: console.log("ISOLATED:", typeof window.__pageVar)
    // TODO: bind to project, set world = Isolated

    // Step 3: Navigate to test page that sets window.__pageVar = 42
    const page = await context.newPage();
    await page.goto('https://example.com'); // replace with test fixture page
    // TODO: inject __pageVar on page before extension script runs

    // Step 4: Verify console output shows "ISOLATED: undefined"
    // const messages: string[] = [];
    // page.on('console', msg => messages.push(msg.text()));
    // expect(messages).toContainEqual(expect.stringContaining('ISOLATED: undefined'));

    test.skip(); // remove when test fixture page is available

    await context.close();
  });

  test('log entry created for isolated injection', async () => {
    // Step 5: Verify logs.db entry via Options page data view
    // TODO: check Options → System → Logs for script_id, project_id, status = success
    test.skip();
  });
});
