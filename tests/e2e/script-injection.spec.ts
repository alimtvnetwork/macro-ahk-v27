import { test, expect, openPopupPage } from './fixtures';
import type { BrowserContext, Page } from '@playwright/test';
import type { InjectScriptsResponse, InjectionResult } from '../../src/shared/injection-types';

/**
 * Script Injection E2E Suite
 *
 * Validates that after a successful cold start, the extension can:
 * 1. Save a script via messaging
 * 2. Inject it into a test page via INJECT_SCRIPTS
 * 3. Observe the script's side-effect on the page DOM
 * 4. Confirm the injection result reports success
 * 5. Verify no console errors from the injected script
 *
 * Test target page strategy
 * -------------------------
 * Earlier versions tried `about:blank`, `data:text/html`, and live
 * `https://example.com/`. All three were unreliable in CI:
 *   - about:blank → opaque origin, executeScript rejected with
 *     "Cannot access contents of the page".
 *   - data: URLs   → opaque origin (RFC 6454), Chromium rejects even with
 *     `<all_urls>` host_permissions.
 *   - example.com  → real origin works, but CI runners may have throttled
 *     or absent outbound network access, so navigation times out
 *     intermittently and the title-change assertion sees `""`.
 *
 * Resolution: serve a tiny stub HTML for `https://example.com/` from a
 * Playwright `context.route()` interceptor. The page now loads
 * deterministically with a real https:// origin (which Chromium accepts
 * for `chrome.scripting.executeScript`) and zero outbound network calls.
 */

const TEST_PAGE_URL = 'https://example.com/';
const TEST_PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Marco E2E Stub</title>
  </head>
  <body>
    <h1>Marco E2E Stub</h1>
    <p>Static page served by Playwright's request interceptor.</p>
  </body>
</html>`;

/**
 * Install a route handler that serves a static HTML stub for the test
 * page. Must be called BEFORE any `page.goto(TEST_PAGE_URL)`.
 */
async function stubTestPage(context: BrowserContext): Promise<void> {
  await context.route(TEST_PAGE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: TEST_PAGE_HTML,
    });
  });
}

/** Wait for the SW to ack a __PING__. Fails the test if it never replies. */
async function waitForServiceWorkerReady(extPage: Page): Promise<void> {
  const pong = await extPage.evaluate(async () => {
    return new Promise<unknown>((resolve) => {
      const t = setTimeout(() => resolve(null), 5000);
      chrome.runtime.sendMessage({ type: '__PING__' }, (res) => {
        clearTimeout(t);
        resolve(res);
      });
    });
  });
  expect(pong).toBeTruthy();
}

/** Resolve the tabId of the open test page by URL prefix. */
async function findTestTabId(extPage: Page): Promise<number> {
  const tabId = await extPage.evaluate(async (urlPrefix: string) => {
    return new Promise<number | null>((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        const target = tabs.find((t) => (t.url ?? '').startsWith(urlPrefix));
        resolve(target?.id ?? null);
      });
    });
  }, TEST_PAGE_URL);
  expect(tabId, 'test page tab not found').not.toBeNull();
  return tabId as number;
}

/* ------------------------------------------------------------------ */
/*  Result-shape helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * The handler returns a richer payload than this file needs (full
 * `InjectionResult` rows with timing + injection-path metadata). Aliasing
 * keeps the tests readable while staying structurally bound to the
 * shared type — adding/renaming a field on `InjectScriptsResponse`
 * automatically propagates here.
 */
type InjectionScriptResult = Pick<
  InjectionResult,
  'scriptId' | 'isSuccess' | 'errorMessage' | 'skipReason'
>;
type InjectionResponse = InjectScriptsResponse;

/**
 * Render the entire results array into a multi-line diagnostic string so
 * test failures point at *why* a particular script failed (or was missing)
 * instead of just `expected true, got false`. Includes the returned
 * `errorMessage` and `skipReason` for each entry.
 */
function formatResultsForFailure(results: readonly InjectionScriptResult[]): string {
  if (results.length === 0) return '(no results returned)';
  return results
    .map((r) => {
      const status = r.isSuccess ? 'OK' : 'FAIL';
      const why = r.errorMessage ?? r.skipReason ?? '(no errorMessage)';
      return `  - ${r.scriptId} [${status}]: ${why}`;
    })
    .join('\n');
}

/**
 * Locate a script result by id and assert it succeeded. On failure, the
 * thrown assertion message includes the script's own `errorMessage` plus
 * the full results array — so a CI failure is self-diagnosing without
 * needing to crack open the trace viewer.
 */
function expectScriptSucceeded(
  response: InjectionResponse,
  scriptId: string,
): InjectionScriptResult {
  const result = response.results.find((r) => r.scriptId === scriptId);
  expect(
    result,
    `Missing result for "${scriptId}". Returned results:\n${formatResultsForFailure(response.results)}`,
  ).toBeDefined();
  expect(
    result!.isSuccess,
    `Script "${scriptId}" failed: ${result!.errorMessage ?? '(no errorMessage)'}.\nAll results:\n${formatResultsForFailure(response.results)}`,
  ).toBe(true);
  return result!;
}

/**
 * Locate a script result by id and assert it failed *with* an error
 * message present. Surfaces the full results table on assertion failure
 * so the CI log explains which script was actually returned.
 */
function expectScriptFailedWithError(
  response: InjectionResponse,
  scriptId: string,
): InjectionScriptResult {
  const result = response.results.find((r) => r.scriptId === scriptId);
  expect(
    result,
    `Missing result for "${scriptId}". Returned results:\n${formatResultsForFailure(response.results)}`,
  ).toBeDefined();
  expect(
    result!.isSuccess,
    `Expected "${scriptId}" to fail, but it succeeded. All results:\n${formatResultsForFailure(response.results)}`,
  ).toBe(false);
  expect(
    result!.errorMessage,
    `Expected "${scriptId}" to report an errorMessage, got undefined. All results:\n${formatResultsForFailure(response.results)}`,
  ).toBeDefined();
  return result!;
}

/**
 * Asserts the value of `inlineSyntaxErrorDetected` on an injection
 * response.
 *
 * Why a dedicated helper:
 *   - The flag is the *only* reliable signal that the inline syntax
 *     preflight ran and tripped. Looking at `isSuccess` or
 *     `errorMessage` text is brittle because malformed-entry skips,
 *     CSP fallbacks, and runtime errors can all produce similar shapes.
 *   - The handler must return `true` *only* when the preflight detected
 *     a parse error, and `false` for every other path (cache hit,
 *     `forceReload: true` bypass, restricted URL, all-good requests).
 *
 * On failure the assertion message includes the full results table so
 * CI logs explain which scripts were in the request — without that
 * context "expected true got false" is unactionable.
 */
function expectInlineSyntaxFlag(
  response: InjectionResponse,
  expected: boolean,
  context: string,
): void {
  expect(
    response.inlineSyntaxErrorDetected,
    `Expected inlineSyntaxErrorDetected=${expected} (${context}), got ${String(
      response.inlineSyntaxErrorDetected,
    )}. All results:\n${formatResultsForFailure(response.results)}`,
  ).toBe(expected);
}

test.describe('Script Injection', () => {

  test('injects a script that modifies the DOM on a test page', async ({ context, extensionId }) => {
    await stubTestPage(context);
    const extPage = await openPopupPage(context, extensionId);
    await waitForServiceWorkerReady(extPage);

    const testPage = await context.newPage();
    await testPage.goto(TEST_PAGE_URL);
    await testPage.waitForLoadState('domcontentloaded');

    const allTabId = await findTestTabId(extPage);

    // Inject a script that creates a DOM element
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-test-script-001',
                name: 'E2E Test Script',
                code: `
                  (function() {
                    var el = document.createElement('div');
                    el.id = 'marco-e2e-injected';
                    el.textContent = 'Marco was here';
                    el.style.cssText = 'position:fixed;top:0;left:0;background:lime;padding:8px;z-index:99999;';
                    document.body.appendChild(el);
                  })();
                `,
                order: 0,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, allTabId);

    // Verify the injection result indicates success — uses shared helper so
    // any failure surfaces the script's `errorMessage` plus the full results
    // table directly in the assertion message.
    const response = injectionResult as InjectionResponse;
    expect(response.results, 'INJECT_SCRIPTS returned no results array').toBeDefined();
    expectScriptSucceeded(response, 'e2e-test-script-001');
    // Clean inline script — preflight ran and passed, flag must be false.
    expectInlineSyntaxFlag(response, false, 'clean inline script — preflight should pass');

    // Verify the DOM side-effect on the test page
    const injectedElement = testPage.locator('#marco-e2e-injected');
    await expect(injectedElement).toBeVisible({ timeout: 5000 });
    await expect(injectedElement).toHaveText('Marco was here');

    await extPage.close();
  });

  test('reports failure for a script with a syntax error', async ({ context, extensionId }) => {
    await stubTestPage(context);
    const extPage = await openPopupPage(context, extensionId);
    await waitForServiceWorkerReady(extPage);

    const testPage = await context.newPage();
    await testPage.goto(TEST_PAGE_URL);
    await testPage.waitForLoadState('domcontentloaded');

    const blankTabId = await findTestTabId(extPage);

    // Inject a script with intentional syntax error
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-bad-script-001',
                name: 'Bad Script',
                code: 'function(( { broken syntax here',
                order: 0,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, blankTabId);

    const response = injectionResult as InjectionResponse;
    expect(response.results, 'INJECT_SCRIPTS returned no results array').toBeDefined();
    expectScriptFailedWithError(response, 'e2e-bad-script-001');
    // Bad-syntax inline script — preflight must trip and surface the flag.
    expectInlineSyntaxFlag(response, true, 'inline syntax error — preflight should trip');

    await extPage.close();
  });

  test('inlineSyntaxErrorDetected is false on forceReload and cache-hit paths', async ({ context, extensionId }) => {
    // This test pins the flag's contract for the *non-error* code paths:
    //   1. `forceReload: true`  → preflight is explicitly skipped → flag MUST be false
    //   2. Repeat identical request without forceReload → cache hit  → flag MUST be false
    // If the handler ever leaks `true` on either path, this test fails
    // immediately and points at the regression — without log scraping.
    await stubTestPage(context);
    const extPage = await openPopupPage(context, extensionId);
    await waitForServiceWorkerReady(extPage);

    const testPage = await context.newPage();
    await testPage.goto(TEST_PAGE_URL);
    await testPage.waitForLoadState('domcontentloaded');

    const tabId = await findTestTabId(extPage);

    const sendInjection = async (forceReload: boolean): Promise<InjectionResponse> => {
      const result = await extPage.evaluate(
        async ({ targetTabId, force }: { targetTabId: number; force: boolean }) => {
          return new Promise<unknown>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
            chrome.runtime.sendMessage(
              {
                type: 'INJECT_SCRIPTS',
                tabId: targetTabId,
                forceReload: force,
                scripts: [
                  {
                    id: 'e2e-flag-cache-script',
                    name: 'Flag Cache Script',
                    code: `document.title = 'Marco E2E Flag';`,
                    order: 0,
                  },
                ],
              },
              (res) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(res);
                }
              },
            );
          });
        },
        { targetTabId: tabId, force: forceReload },
      );
      return result as InjectionResponse;
    };

    // Pass 1: forceReload=true — preflight must be skipped, flag false.
    const forced = await sendInjection(true);
    expectScriptSucceeded(forced, 'e2e-flag-cache-script');
    expectInlineSyntaxFlag(forced, false, 'forceReload bypass — preflight skipped');

    // Pass 2: identical request, no forceReload — should hit the cache,
    // and the cached path returns inlineSyntaxErrorDetected=false because
    // the request's fingerprint already matched a validated payload.
    const cached = await sendInjection(false);
    expectScriptSucceeded(cached, 'e2e-flag-cache-script');
    expectInlineSyntaxFlag(cached, false, 'cache-hit path — preflight not re-run');

    await extPage.close();
  });

  test('safely handles malformed entries (missing id/code) without false positives', async ({ context, extensionId }) => {
    await stubTestPage(context);
    const extPage = await openPopupPage(context, extensionId);
    await waitForServiceWorkerReady(extPage);

    const testPage = await context.newPage();
    await testPage.goto(TEST_PAGE_URL);
    await testPage.waitForLoadState('domcontentloaded');

    const tabId = await findTestTabId(extPage);

    // Send a mix: 1 valid script + 3 malformed entries. The handler must
    // (a) execute the valid one successfully, and (b) report each malformed
    // entry as a failure with an errorMessage — never silently as success.
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            forceReload: true, // bypass any cached payload from prior tests
            scripts: [
              {
                id: 'e2e-good-script',
                name: 'Good Script',
                code: `document.title = 'Marco E2E Mixed';`,
                order: 0,
              },
              // Missing `id`
              {
                name: 'No-Id Script',
                code: `void 0;`,
                order: 1,
              },
              // Missing `code`
              {
                id: 'e2e-no-code-script',
                name: 'No-Code Script',
                order: 2,
              },
              // Empty `code` string
              {
                id: 'e2e-empty-code-script',
                name: 'Empty-Code Script',
                code: '',
                order: 3,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, tabId);

    const response = injectionResult as InjectionResponse;
    expect(response.results, 'INJECT_SCRIPTS returned no results array').toBeDefined();

    // The good script must succeed.
    expectScriptSucceeded(response, 'e2e-good-script');

    // The malformed entries must each surface as failures with errorMessage.
    // Their reported scriptIds come from the resolver's display-id fallback:
    //   - missing id   → "unknown-<index>"
    //   - present id   → echoed back
    expectScriptFailedWithError(response, 'e2e-no-code-script');
    expectScriptFailedWithError(response, 'e2e-empty-code-script');

    // Missing-id entry — id falls back to "unknown-<index>". Locate it by
    // scanning for any failure whose name matches what we sent. This guards
    // against silent drops: if the resolver had quietly discarded it,
    // there'd be no result row at all.
    const noIdResult = response.results.find(
      (r) => r.scriptId.startsWith('unknown-') && r.isSuccess === false,
    );
    expect(
      noIdResult,
      `Expected a "unknown-*" failure row for the missing-id entry. All results:\n${formatResultsForFailure(response.results)}`,
    ).toBeDefined();
    expect(noIdResult!.errorMessage).toBeDefined();

    // Verify the good script's side-effect actually applied to the page,
    // proving the malformed entries did not block the valid one.
    await expect.poll(
      async () => testPage.title(),
      { timeout: 5000, message: 'document.title was never updated by the valid script' },
    ).toBe('Marco E2E Mixed');

    await extPage.close();
  });

  test('injected script does not leak console errors', async ({ context, extensionId }) => {
    await stubTestPage(context);
    const extPage = await openPopupPage(context, extensionId);
    await waitForServiceWorkerReady(extPage);

    const testPage = await context.newPage();

    // Collect console errors on the test page. Filter out console output
    // produced by Marco's own post-injection diagnostics — those are
    // expected on a stub page where the macro globals (MacroController,
    // RiseupAsiaMacroExt, etc.) intentionally don't exist. The assertion
    // is about the *user's* injected script, not the extension's own
    // verification log. Patterns are intentionally broad: console.error
    // calls with %c style tokens get split across argument boundaries and
    // 404s from blob: cleanup land here too. We want to surface only
    // genuine errors raised by `e2e-clean-script`, which has none.
    const ignoredPatterns = [
      /macrocontroller/i,
      /riseupasiamacroext/i,
      /window\.marco/i,
      /\bmarco\b/i,
      /post-injection/i,
      /failed to load resource/i,
      /favicon/i,
      /404/,
      /\bblob:/i,
      /color:#/i, // %c style tokens leak as standalone console args
    ];
    const isIgnored = (text: string) => ignoredPatterns.some((rx) => rx.test(text));

    const pageErrors: string[] = [];
    testPage.on('console', (msg) => {
      if (msg.type() === 'error' && !isIgnored(msg.text())) {
        pageErrors.push(msg.text());
      }
    });
    testPage.on('pageerror', (err) => {
      if (!isIgnored(err.message)) {
        pageErrors.push(err.message);
      }
    });

    await testPage.goto(TEST_PAGE_URL);
    await testPage.waitForLoadState('domcontentloaded');

    const tabId = await findTestTabId(extPage);

    // Inject a clean script that mutates document.title
    const injectionResult = await extPage.evaluate(async (targetTabId: number) => {
      return new Promise<unknown>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Injection timed out')), 10000);
        chrome.runtime.sendMessage(
          {
            type: 'INJECT_SCRIPTS',
            tabId: targetTabId,
            scripts: [
              {
                id: 'e2e-clean-script',
                name: 'Clean Script',
                code: `document.title = 'Marco E2E Clean';`,
                order: 0,
              },
            ],
          },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(res);
            }
          },
        );
      });
    }, tabId);

    // Confirm the injection itself succeeded — uses the shared helper so
    // failures include the returned `errorMessage` and the full result
    // table, instead of an unhelpful empty-string title diff later.
    const response = injectionResult as InjectionResponse;
    expectScriptSucceeded(response, 'e2e-clean-script');
    // Clean inline script — preflight passes, flag must be false.
    expectInlineSyntaxFlag(response, false, 'clean inline script — preflight should pass');

    // Wait for the title mutation to apply (poll instead of fixed sleep).
    await expect.poll(
      async () => testPage.title(),
      { timeout: 5000, message: 'document.title was never updated by injected script' },
    ).toBe('Marco E2E Clean');

    // No console errors from the injected script
    expect(pageErrors).toEqual([]);

    await extPage.close();
  });
});
