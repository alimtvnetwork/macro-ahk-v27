import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions } from './fixtures';

/**
 * E2E-05 — Script Injection (Main World)
 *
 * Verify a script executes in the main page world with full page access.
 * Priority: P0 | Auto: ✅ | Est: 3 min
 *
 * Pass criteria:
 *   - Main world scripts access page globals
 *   - Errors route to errors.db
 */
test.describe('E2E-05 — Script Injection (Main World)', () => {
  test('main world script accesses page variables', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1–2: Create script, bind with world = Main
    const options = await openOptions(context, extensionId);
    // TODO: create script: console.log("MAIN:", window.__pageVar)

    // Step 3: Navigate to test page with window.__pageVar = 42
    const page = await context.newPage();
    // TODO: use test fixture page

    // Step 4: Verify console output "MAIN: 42"
    test.skip();

    await context.close();
  });

  test('script error captured in errors.db', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 5: Inject script that throws: throw new Error("test")
    // Step 6: Verify errors.db entry with stack trace, script_id, correlation_id
    // TODO: check Options → System → Errors

    test.skip();

    await context.close();
  });
});
