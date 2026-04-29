import { expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Shared onboarding test utilities.
 * ---------------------------------
 * Extracted from `e2e-01-onboarding.spec.ts` so any future onboarding spec
 * can import the same readiness gates, error-surfacing helpers, ARIA
 * contract checks, and step-history instrumentation.
 *
 * Selector strategy
 *   Use the `data-testid` attributes added to OnboardingFlow.tsx for
 *   resilience against copy / animation changes. Fall back to role-based
 *   selectors only when the testid does not exist (e.g. the "Continue"
 *   button is keyed by step).
 *
 * Why a shared module?
 *   - Single source of truth for the ordered step list and timeout budget.
 *   - Guarantees every spec surfaces the same diagnostic error messages
 *     (step-error boundary, stuck-loading gate) instead of generic
 *     locator timeouts.
 *   - Lets new specs (e.g. resume-from-mid-step, back-navigation) share
 *     the readiness gates without copy-pasting brittle waits.
 */

/** Ordered step IDs as they appear in OnboardingFlow.tsx. */
export const ONBOARDING_STEPS = ['welcome', 'project', 'permissions', 'ready'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Total number of steps — matches `STEPS.length` in OnboardingFlow.tsx. */
export const STEP_COUNT = ONBOARDING_STEPS.length;

/** CI cold-start can be slow; give React time to hydrate. */
export const ASSERT_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  Error surfacing                                                    */
/* ------------------------------------------------------------------ */

/**
 * If the onboarding flow rendered its error UI (either the per-step error
 * boundary or the stuck-loading gate in Options.tsx), grab the visible
 * error message and throw with it. This converts a generic Playwright
 * timeout into a clear failure like "Onboarding step 'welcome' failed:
 * <real error>" so CI logs point at the actual bug instead of a missing
 * locator.
 */
export async function throwIfOnboardingErrorVisible(page: Page): Promise<void> {
  // Step-level boundary (rendered inside <OnboardingFlow />).
  const stepError = page.locator('[data-testid="onboarding-step-error"]').first();
  if ((await stepError.count()) > 0 && (await stepError.isVisible().catch(() => false))) {
    const failedStep = await stepError.getAttribute('data-onboarding-error-step');
    const message = await page
      .locator('[data-testid="onboarding-step-error-message"]')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Onboarding step "${failedStep ?? 'unknown'}" failed to render: ${message?.trim() ?? '(no message)'}`,
    );
  }

  // Page-level "stuck loading" gate (rendered by Options.tsx if the
  // useOnboarding() promise never resolves).
  const loadError = page.locator('[data-testid="onboarding-load-error"]').first();
  if ((await loadError.count()) > 0 && (await loadError.isVisible().catch(() => false))) {
    const message = await page
      .locator('[data-testid="onboarding-load-error-message"]')
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Onboarding never finished loading: ${message?.trim() ?? '(no message)'}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Readiness gates                                                    */
/* ------------------------------------------------------------------ */

/**
 * Wait until the onboarding flow has mounted AND its root reports the
 * expected step via `data-onboarding-step`. This double-check avoids a
 * race where the container is in the DOM but the inner step component
 * (welcome/project/permissions/ready) hasn't rendered yet because of the
 * `page-enter` animation wrapper.
 */
export async function waitForOnboardingStep(
  page: Page,
  expectedStep: OnboardingStep,
): Promise<void> {
  // 1. Root container is in the DOM and visible.
  const root = page.locator('[data-testid="onboarding-flow"]').first();
  try {
    await root.waitFor({ state: 'visible', timeout: ASSERT_TIMEOUT_MS });
  } catch (err) {
    await throwIfOnboardingErrorVisible(page);
    throw err;
  }

  // 2. Root reports the expected step. Using `toHaveAttribute` lets
  //    Playwright auto-retry while React commits the next step.
  try {
    await expect(root).toHaveAttribute('data-onboarding-step', expectedStep, {
      timeout: ASSERT_TIMEOUT_MS,
    });
  } catch (err) {
    await throwIfOnboardingErrorVisible(page);
    throw err;
  }
}

/**
 * Verify the onboarding wizard exposes the expected ARIA contract:
 *  - Root has role="dialog" with aria-modal and points at the active heading.
 *  - Progress bar has role="progressbar" with valid aria-value* attributes.
 *  - The active step's CTA is a real <button> with a non-empty aria-label.
 *
 * Run this BEFORE asserting visibility/enabled state so a missing role or
 * aria-label fails with "ARIA contract broken: …" instead of a generic
 * locator timeout further downstream.
 */
export async function assertOnboardingA11yContract(
  page: Page,
  expectedStep: 'welcome' | 'ready',
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /welcome to marco|you're all set/i });
  await expect(dialog, 'Onboarding root must expose role="dialog" with an accessible name')
    .toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAttribute('aria-labelledby', 'onboarding-active-heading');

  const progressbar = page.getByRole('progressbar', { name: /onboarding step \d+ of \d+/i });
  await expect(progressbar, 'Onboarding progress bar must expose role="progressbar" with aria-label')
    .toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
  await expect(progressbar).toHaveAttribute('aria-valuemin', '1');
  await expect(progressbar).toHaveAttribute('aria-valuemax', String(STEP_COUNT));

  const ctaName =
    expectedStep === 'welcome'
      ? /continue to next onboarding step/i
      : /get started and finish onboarding/i;
  const cta = page.getByRole('button', { name: ctaName });
  await expect(cta, `CTA for "${expectedStep}" step must be a button with descriptive aria-label`)
    .toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
  const ariaLabel = await cta.getAttribute('aria-label');
  if (!ariaLabel || ariaLabel.trim().length === 0) {
    throw new Error(`ARIA contract broken: CTA on "${expectedStep}" step is missing aria-label.`);
  }

  const headingPattern = expectedStep === 'welcome' ? /welcome to marco/i : /you're all set/i;
  const heading = page.getByRole('heading', { name: headingPattern });
  await expect(heading, `Heading for "${expectedStep}" step must use a real heading role`)
    .toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
}

/**
 * Wait for the welcome step to be fully interactive: root mounted on
 * step="welcome", a11y contract verified, heading rendered, and the
 * Continue button visible AND enabled. Use this as the single readiness
 * gate at the start of every onboarding test instead of asserting
 * individual locators ad-hoc.
 */
export async function waitForWelcomeReady(page: Page): Promise<void> {
  await waitForOnboardingStep(page, 'welcome');
  try {
    await assertOnboardingA11yContract(page, 'welcome');
    await expect(page.getByTestId('onboarding-welcome-heading')).toBeVisible({
      timeout: ASSERT_TIMEOUT_MS,
    });
    const continueBtn = page.getByTestId('onboarding-continue');
    await expect(continueBtn).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
    await expect(continueBtn).toBeEnabled({ timeout: ASSERT_TIMEOUT_MS });
  } catch (err) {
    await throwIfOnboardingErrorVisible(page);
    throw err;
  }
}

/**
 * Wait for the final step's CTA to be present, visible, and enabled.
 * Mirrors `waitForWelcomeReady()` so the "Get Started" click is never
 * dispatched against a stale or animating button.
 */
export async function waitForGetStartedReady(page: Page): Promise<void> {
  await waitForOnboardingStep(page, 'ready');
  try {
    await assertOnboardingA11yContract(page, 'ready');
    await expect(page.getByTestId('onboarding-ready-heading')).toBeVisible({
      timeout: ASSERT_TIMEOUT_MS,
    });
    const cta = page.getByTestId('onboarding-get-started');
    await expect(cta).toBeVisible({ timeout: ASSERT_TIMEOUT_MS });
    await expect(cta).toBeEnabled({ timeout: ASSERT_TIMEOUT_MS });
  } catch (err) {
    await throwIfOnboardingErrorVisible(page);
    throw err;
  }
}

/**
 * Click "Continue" until we land on the final ("ready") step. Each click
 * waits for the button to be visible+enabled before dispatching, and
 * after every click we assert the root's `data-onboarding-step` advanced
 * — so a missed click fails fast with a clear "stuck on <step>" message
 * instead of timing out later on a missing locator.
 */
export async function advanceToReadyStep(page: Page): Promise<void> {
  for (let i = 0; i < STEP_COUNT - 1; i += 1) {
    const fromStep = ONBOARDING_STEPS[i];
    const toStep = ONBOARDING_STEPS[i + 1];
    const continueBtn = page.getByTestId('onboarding-continue');
    try {
      await expect(continueBtn, `Continue button missing on step "${fromStep}"`).toBeVisible({
        timeout: ASSERT_TIMEOUT_MS,
      });
      await expect(continueBtn, `Continue button disabled on step "${fromStep}"`).toBeEnabled({
        timeout: ASSERT_TIMEOUT_MS,
      });
    } catch (err) {
      await throwIfOnboardingErrorVisible(page);
      throw err;
    }
    await continueBtn.click();
    await waitForOnboardingStep(page, toStep);
  }
}

/* ------------------------------------------------------------------ */
/*  Step-history instrumentation                                       */
/* ------------------------------------------------------------------ */

export interface OnboardingStepChangeRecord {
  from: string | null;
  to: string;
  index: number;
}

/**
 * Install a window-scoped listener for the `marco:onboarding-step-change`
 * CustomEvent dispatched by OnboardingFlow. Records every transition into
 * `window.__marcoOnboardingHistory` so tests can later read out the EXACT
 * sequence (including initial mount + any back-navigation).
 *
 * Must be called BEFORE the options page is opened — uses
 * `context.addInitScript` so the hook is in place before React mounts.
 */
export async function installStepHistoryRecorder(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    interface MarcoWindow {
      __marcoOnboardingHistory?: OnboardingStepChangeRecord[];
    }
    interface OnboardingStepChangeRecord {
      from: string | null;
      to: string;
      index: number;
    }
    const w = window as unknown as MarcoWindow;
    w.__marcoOnboardingHistory = [];
    window.addEventListener('marco:onboarding-step-change', (ev: Event) => {
      const detail = (ev as CustomEvent<{ from: string | null; to: string; index: number }>).detail;
      if (detail && typeof detail.to === 'string') {
        w.__marcoOnboardingHistory!.push({
          from: detail.from,
          to: detail.to,
          index: detail.index,
        });
      }
    });
  });
}

/** Read the captured event-based step history out of the page. */
export async function readStepHistoryFromEvents(
  page: Page,
): Promise<OnboardingStepChangeRecord[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __marcoOnboardingHistory?: OnboardingStepChangeRecord[] };
    return w.__marcoOnboardingHistory ?? [];
  });
}

/** Read the DOM-attribute step history out of the onboarding root. */
export async function readStepHistoryFromDom(page: Page): Promise<string[]> {
  const root = page.locator('[data-testid="onboarding-flow"]').first();
  const raw = await root.getAttribute('data-onboarding-step-history');
  return raw ? raw.split(',').filter(Boolean) : [];
}
