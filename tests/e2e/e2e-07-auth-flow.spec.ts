import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openPopup } from './fixtures';

/**
 * E2E-07 — Authentication Flow
 *
 * Verify bearer token + cookie fallback authentication.
 * Priority: P0 | Auto: ⚠️ (requires manual setup) | Est: 5 min
 *
 * Pass criteria:
 *   - Primary bearer token works
 *   - Cookie fallback recovers session
 *   - Cleared state shows unauthenticated
 */
test.describe('E2E-07 — Authentication Flow', () => {
  test('session cookie extracted on login', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);

    // Step 1: Log in via target web app (requires test account)
    // Step 2: Open popup → extension reads cookie via chrome.cookies API
    // TODO: requires test backend session endpoint

    test.skip();
    await context.close();
  });

  test('bearer token stored in localStorage', async () => {
    // Step 3: Verify localStorage contains bearer token
    test.skip();
  });

  test('cookie fallback when bearer token cleared', async () => {
    // Step 4–5: Clear localStorage → reload → falls back to cookie
    test.skip();
  });

  test('authenticated API call includes bearer header', async () => {
    // Step 6: Intercept request → verify Authorization header
    test.skip();
  });

  test('cleared state shows unauthenticated', async () => {
    // Step 7: Clear both cookie + localStorage → "Not authenticated"
    test.skip();
  });
});
