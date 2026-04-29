import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openPopup } from './fixtures';

/**
 * E2E-08 — Popup Project Selection & Match Status
 *
 * Verify the popup correctly displays match status per tab and allows project switching.
 * Priority: P0 | Auto: ✅ | Est: 3 min
 *
 * Pass criteria:
 *   - Popup reflects real-time tab state
 *   - Project switching triggers re-evaluation
 */
test.describe('E2E-08 — Popup Project Selection & Match Status', () => {
  test('popup shows match on matched URL', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1: Open popup on matched URL → ✅ with project name, rule type, injection count
    // TODO: requires project with URL rules set up first

    test.skip();
    await context.close();
  });

  test('popup shows no match on unmatched URL', async () => {
    // Step 2: Open popup on unmatched URL → ❌ "No matching project"
    test.skip();
  });

  test('project switching re-evaluates match', async () => {
    // Step 3: Switch project via dropdown → match re-evaluates
    test.skip();
  });

  test('tab switching updates popup state', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 4: Open two tabs with different matches → switching tabs updates popup
    // TODO: requires two projects with different URL rules

    test.skip();
    await context.close();
  });

  test('inject now button executes script', async () => {
    // Step 5: Click "Inject Now" → console shows output, popup count increments
    test.skip();
  });
});
