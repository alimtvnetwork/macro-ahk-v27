import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { launchExtension, getExtensionId, openOptions, optionsUrl } from './fixtures';

/**
 * E2E-02 — Project CRUD Lifecycle
 *
 * Create, read, update, and delete a project through the Options page.
 *
 * Implementation notes
 * --------------------
 * - The Options page renders <OnboardingFlow /> when
 *   `marco_onboarding_complete` is not set in `chrome.storage.local`. Every
 *   CRUD test must seed that flag *before* the Options page loads, otherwise
 *   the dashboard never mounts and queries like `getByRole('button',
 *   { name: /new project/i })` time out.
 * - The "New Project" trigger comes from `ProjectsListView` (button label
 *   "New Project"). The form lives in `ProjectCreateForm` (placeholder
 *   "Project name", save button "Create") — see those components if
 *   selectors drift.
 * - Default sidebar section is "projects" (see Options.tsx parseHash), but we
 *   force `#projects` in the URL hash so a stale persisted hash from the
 *   service worker session can never land us on a different section.
 *
 * Priority: P0 | Auto: ✅ | Est: 3 min
 */

const SETUP_TIMEOUT_MS = 30_000;

/**
 * Seed the onboarding-complete flag in chrome.storage.local BEFORE the test's
 * Options page loads, so OnboardingFlow never renders.
 *
 * Uses chrome.storage.local.set's promise overload — the callback overload is
 * unavailable in MV3 service-worker contexts and would silently never resolve.
 */
async function seedOnboardingComplete(context: BrowserContext, extensionId: string): Promise<void> {
  const seedPage = await context.newPage();
  await seedPage.goto(optionsUrl(extensionId));
  await seedPage.waitForLoadState('domcontentloaded');
  await seedPage.evaluate(async () => {
    await chrome.storage.local.set({ marco_onboarding_complete: true });
  });
  await seedPage.close();
}

/**
 * Open the Options page on the projects section and wait until the
 * "New Project" CTA is visible. This collapses every "page never loaded" /
 * "wrong section" / "still in onboarding" failure into one clear assertion
 * instead of a generic 60s test-level timeout.
 */
async function openProjectsView(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await openOptions(context, extensionId);
  await page.evaluate(() => { window.location.hash = '#projects'; });
  const newProjectBtn = page.getByRole('button', { name: /^new project$/i });
  await expect(newProjectBtn).toBeVisible({ timeout: SETUP_TIMEOUT_MS });
  return page;
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^new project$/i }).click();
  const nameInput = page.getByPlaceholder(/^project name$/i);
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await nameInput.fill(name);
  await page.getByRole('button', { name: /^create$/i }).click();
  // Wait for the form to unmount (back on the list view).
  await expect(page.getByRole('button', { name: /^new project$/i })).toBeVisible({ timeout: 10_000 });
}

test.describe('E2E-02 — Project CRUD Lifecycle', () => {
  test('create a new project', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    await seedOnboardingComplete(context, extensionId);
    const options = await openProjectsView(context, extensionId);

    await createProject(options, 'Test Automation');

    await expect(options.getByText('Test Automation').first()).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test('update project name', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    await seedOnboardingComplete(context, extensionId);
    const options = await openProjectsView(context, extensionId);

    await createProject(options, 'Test Automation');

    // Navigate to project detail. The project card uses the same text as
    // the H2 inside the detail view, so use .first() to disambiguate.
    await options.getByText('Test Automation').first().click();

    // ProjectDetailView renders the name as a click-to-edit <h2>. We must
    // click it to mount the underlying <Input placeholder="Project name">
    // — otherwise getByPlaceholder will time out.
    const heading = options.getByRole('heading', { name: 'Test Automation' });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    await heading.click();

    const nameInput = options.getByPlaceholder(/^project name$/i);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill('Test Automation v2');

    await nameInput.press('Enter');
    const saveBtn = options.getByRole('button', { name: /save project/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await saveBtn.click();

    await expect(options.getByText('Test Automation v2').first()).toBeVisible({ timeout: 10_000 });

    await context.close();
  });

  test('delete project cleans up storage', async () => {
    const context = await launchExtension(chromium);
    const extensionId = await getExtensionId(context);
    await seedOnboardingComplete(context, extensionId);
    const options = await openProjectsView(context, extensionId);

    await createProject(options, 'Delete Me');

    await options.getByText('Delete Me').first().click();

    const deleteTrigger = options.getByRole('button', { name: /delete project/i });
    await expect(deleteTrigger).toBeVisible({ timeout: 10_000 });
    await deleteTrigger.click();

    const confirmBtn = options.getByRole('button', { name: /^delete$/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    await expect(options.getByText('Delete Me')).not.toBeVisible({ timeout: 10_000 });

    await context.close();
  });
});
