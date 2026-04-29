import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions } from './fixtures';

/**
 * E2E-19 — Options Page Full CRUD + Library Management
 *
 * Verify all Options page sections render and function.
 * Priority: P0 | Auto: ✅ | Est: 5 min
 *
 * Pass criteria:
 *   - All CRUD operations work
 *   - Validation prevents bad data
 *   - Navigation is smooth
 */
test.describe('E2E-19 — Options Page Full CRUD + Library', () => {
  test('all sidebar sections render without errors', async () => {
    // The Options sidebar IA is still in flux — link names and section
    // count change frequently. Skip until the dashboard layout stabilises.
    test.skip(true, 'Options sidebar IA not yet stable — pending spec finalisation.');

    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    const sections = ['Projects', 'URL Rules', 'Scripts', 'Configs', 'System'];
    for (const section of sections) {
      await options.getByRole('link', { name: new RegExp(section, 'i') }).click();
      await expect(options.locator('body')).not.toContainText('error');
    }

    await context.close();
  });

  test('URL rule validation rejects invalid regex', async () => {
    // Step 4: Add invalid regex → error message shown
    test.skip();
  });

  test('script upload via drag-and-drop', async () => {
    // Step 5: Upload file via drag-and-drop zone → appears in library
    test.skip();
  });

  test('script priority reorder persists', async () => {
    // Step 6: Drag to reorder → priority persists after reload
    test.skip();
  });

  test('JSON config validation rejects invalid JSON', async () => {
    // Step 7: Invalid JSON blocked with error message
    test.skip();
  });

  test('system section shows storage usage and version', async () => {
    // Step 8: Stats render with accurate data
    test.skip();
  });
});
