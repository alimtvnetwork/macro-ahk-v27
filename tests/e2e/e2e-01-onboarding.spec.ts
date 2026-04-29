import { test, expect, chromium } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions } from './fixtures';
import {
  ASSERT_TIMEOUT_MS,
  ONBOARDING_STEPS,
  advanceToReadyStep,
  installStepHistoryRecorder,
  readStepHistoryFromDom,
  readStepHistoryFromEvents,
  waitForGetStartedReady,
  waitForWelcomeReady,
} from './utils/onboarding';

/**
 * E2E-01 — First-Run Onboarding
 *
 * Verify the welcome flow appears on first install and the extension reaches
 * the "ready" state with the bundled default project (Macro Controller).
 *
 * Implementation notes
 * --------------------
 * - The OnboardingFlow renders inside the **Options page**, not the popup
 *   (`src/pages/Options.tsx` mounts `<OnboardingFlow />` when
 *   `useOnboarding().isComplete === false`).
 * - Storage key is `marco_onboarding_complete` (see
 *   `src/hooks/use-onboarding.ts`), not `onboarding_complete`.
 * - The default project is "Macro Controller" — Marco does not create a
 *   "My First Project". The wizard's project step is informational only.
 * - The "Get Started" button only appears on the final ("ready") step.
 *   Earlier steps show "Continue".
 *
 * Shared helpers (readiness gates, ARIA contract, error surfacing,
 * step-history instrumentation) live in `tests/e2e/utils/onboarding.ts`
 * so any future onboarding spec can import the same primitives.
 *
 * Priority: P0 | Auto: ✅ | Est: 2 min
 */

test.describe('E2E-01 — First-Run Onboarding', () => {
  test('welcome page displays on fresh install', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    // Single readiness gate covers root-mount, step="welcome", a11y
    // contract, heading visible, and Continue button visible+enabled.
    await waitForWelcomeReady(options);

    await context.close();
  });

  test('"Get Started" completes onboarding', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    await waitForWelcomeReady(options);
    await advanceToReadyStep(options);
    await waitForGetStartedReady(options);

    await options.getByTestId('onboarding-get-started').click();

    // After completion the wizard unmounts and the dashboard renders the
    // bundled default project ("Macro Controller").
    await expect(options.getByText(/macro controller/i).first()).toBeVisible({
      timeout: ASSERT_TIMEOUT_MS,
    });

    await context.close();
  });

  test('marco_onboarding_complete flag persisted in storage', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    await waitForWelcomeReady(options);
    await advanceToReadyStep(options);
    await waitForGetStartedReady(options);

    await options.getByTestId('onboarding-get-started').click();

    // Verify chrome.storage.local key written by useOnboarding().completeOnboarding()
    const flag = await options.evaluate(async () => {
      return new Promise(resolve =>
        chrome.storage.local.get('marco_onboarding_complete', d =>
          resolve(d.marco_onboarding_complete),
        ),
      );
    });
    expect(flag).toBe(true);

    await context.close();
  });

  test('records exact step sequence in DOM history and CustomEvent stream', async () => {
    const context = await launchExtension(chromium);
    // Install BEFORE the page loads so the listener catches the initial mount.
    await installStepHistoryRecorder(context);
    const extensionId = await getExtensionId(context);
    const options = await openOptions(context, extensionId);

    await waitForWelcomeReady(options);
    await advanceToReadyStep(options);
    await waitForGetStartedReady(options);

    const expectedSequence = [...ONBOARDING_STEPS];

    // 1. DOM-attribute history mirrors the same sequence.
    const root = options.locator('[data-testid="onboarding-flow"]').first();
    await expect(
      root,
      `DOM step-history attribute did not match expected sequence ${expectedSequence.join(' → ')}`,
    ).toHaveAttribute(
      'data-onboarding-step-history',
      expectedSequence.join(','),
      { timeout: ASSERT_TIMEOUT_MS },
    );
    await expect(root).toHaveAttribute(
      'data-onboarding-transition-count',
      String(expectedSequence.length),
    );
    expect(await readStepHistoryFromDom(options)).toEqual(expectedSequence);

    // 2. Event-based history dispatched the same transitions in order.
    const eventHistory = await readStepHistoryFromEvents(options);
    expect(
      eventHistory.map(e => e.to),
      `CustomEvent stream did not record expected sequence. Got: ${JSON.stringify(eventHistory)}`,
    ).toEqual(expectedSequence);

    // 3. The first transition's `from` is null (initial mount), then each
    //    `from` matches the previous `to` — proves no events were dropped.
    expect(eventHistory[0].from).toBeNull();
    for (let i = 1; i < eventHistory.length; i += 1) {
      expect(
        eventHistory[i].from,
        `Event #${i} "from" should equal previous "to" — gap detected in event stream`,
      ).toBe(eventHistory[i - 1].to);
      expect(eventHistory[i].index).toBe(i);
    }

    await context.close();
  });
});
