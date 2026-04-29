import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openPopup, openOptions } from './fixtures';

/**
 * E2E-03 — URL Matching Rules
 *
 * Verify exact, prefix, and regex URL matching triggers correct project binding.
 * Priority: P0 | Auto: ✅ | Est: 3 min
 *
 * Pass criteria:
 *   - All 3 match types resolve correctly
 *   - Deletions take immediate effect
 */
test.describe('E2E-03 — URL Matching Rules', () => {
  test('exact match resolves correctly', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Setup: create project + exact URL rule via Options
    const options = await openOptions(context, extensionId);
    // TODO: create project "URL Test" and add exact rule: https://example.com/dashboard
    test.skip(); // remove when UI selectors are finalized

    await context.close();
  });

  test('prefix match resolves correctly', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // TODO: add prefix rule https://api.example.com/
    // Navigate to https://api.example.com/v2/users → expect match
    test.skip();

    await context.close();
  });

  test('regex match resolves correctly', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // TODO: add regex rule ^https://.*\.example\.com/app
    // Navigate to https://sub.example.com/app/home → expect match
    test.skip();

    await context.close();
  });

  test('no match on unrelated URL', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // TODO: navigate to https://other.com → popup shows ❌ no match
    test.skip();

    await context.close();
  });

  test('deleted rule stops matching immediately', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // TODO: delete prefix rule → verify previously matched URL now shows no match
    test.skip();

    await context.close();
  });
});
