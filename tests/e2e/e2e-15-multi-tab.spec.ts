import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openPopup } from './fixtures';

/**
 * E2E-15 — Multi-Tab Tracking + Independent Injection
 *
 * Verify independent injection state per tab.
 * Priority: P1 | Auto: ✅ | Est: 4 min
 *
 * Pass criteria:
 *   - Each tab maintains independent state
 *   - Cleanup on close/navigate
 */
test.describe('E2E-15 — Multi-Tab Tracking', () => {
  test('tabs inject independently for different projects', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1: Tab A on site-a.com (matched, project A) → scripts injected
    // Step 2: Tab B on site-b.com (matched, project B) → different scripts injected
    // Step 3: Tab C on unmatched.com → no injection
    // TODO: create two projects with different URL rules

    test.skip();
    await context.close();
  });

  test('popup reflects active tab project', async () => {
    // Step 4-5: Switch between tabs → popup shows correct project match
    test.skip();
  });

  test('tab close cleans up tracking state', async () => {
    // Step 6: Close Tab A → tracking cleared; Tab B unaffected
    test.skip();
  });

  test('navigating away clears injection state', async () => {
    // Step 7: Tab B navigates to unmatched URL → state cleared
    test.skip();
  });
});
