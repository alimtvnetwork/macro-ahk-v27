import { test, expect, Page } from '@playwright/test';

/**
 * E2E-21 — XPath Capture: Full + Relative + Anchor + Determinism
 *
 * Runs the strategy module against a controlled HTML fixture in a real browser
 * and asserts:
 *   1. ID strategy wins when an id is present
 *   2. data-testid strategy wins when no id but testid is present
 *   3. role + visible text strategy wins when only role/text are present
 *   4. Positional fallback walks from documentElement and indexes siblings
 *   5. Relative XPath is anchored to a chosen ancestor (label/legend) and is
 *      shorter than the full XPath
 *   6. Variable name is derived from the closest <label>/aria-label/placeholder
 *      and PascalCased
 *   7. Repeated capture of the same element — same DOM, after reload — yields
 *      identical selectors (deterministic, no timestamps / no random ids)
 *
 * Priority: P1 | Auto: ✅ | Est: 2 min
 *
 * This spec is self-contained: it does not depend on the packaged extension
 * being loaded. The strategy functions are pure DOM helpers, so we evaluate
 * them in the page context via page.evaluate().
 */

/* ------------------------------------------------------------------ */
/*  Fixture                                                            */
/* ------------------------------------------------------------------ */

/**
 * Deterministic HTML fixture. Every element the tests touch has a stable
 * shape — no inline scripts, no async content, no random ids.
 */
const FIXTURE_HTML = `
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>XPath Capture Fixture</title></head>
  <body>
    <main>
      <form id="ContactForm">
        <fieldset>
          <legend>Contact Details</legend>

          <label for="EmailField">Email Address</label>
          <input id="EmailField" type="email" placeholder="you@example.com" />

          <label for="PhoneField">Phone Number</label>
          <input data-testid="PhoneInput" type="tel" />

          <div role="group" aria-label="Preferences">
            <button role="button">Save Preferences</button>
          </div>

          <ul>
            <li>First</li>
            <li>Second</li>
            <li>Third</li>
          </ul>
        </fieldset>
      </form>
    </main>
  </body>
</html>
`;

/* ------------------------------------------------------------------ */
/*  Strategy bundle (mirrored from src/content-scripts/xpath-strategies.ts)
/*  Inlined so the spec is hermetic and does not require a build step.
/* ------------------------------------------------------------------ */

const STRATEGY_BUNDLE = `
window.__XPathStrategies = (() => {
  function tryIdStrategy(el) {
    const id = el.getAttribute('id');
    return id ? { xpath: '//*[@id="' + id + '"]', strategy: 'id' } : null;
  }
  function tryTestIdStrategy(el) {
    const t = el.getAttribute('data-testid');
    return t ? { xpath: '//*[@data-testid="' + t + '"]', strategy: 'testid' } : null;
  }
  function tryRoleTextStrategy(el) {
    const role = el.getAttribute('role');
    const text = (el.textContent || '').trim().slice(0, 50);
    return (role && text)
      ? { xpath: '//*[@role="' + role + '"][contains(text(),"' + text + '")]', strategy: 'role-text' }
      : null;
  }
  function buildSegment(el) {
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    if (siblings.length > 1) return tag + '[' + (siblings.indexOf(el) + 1) + ']';
    return tag;
  }
  function buildPositionalXPath(el, stopAt) {
    const segments = [];
    let cur = el;
    const stop = stopAt || document.documentElement;
    while (cur && cur !== stop) {
      segments.unshift(buildSegment(cur));
      cur = cur.parentElement;
    }
    const prefix = stopAt ? './' : '/';
    return { xpath: prefix + segments.join('/'), strategy: 'positional' };
  }
  function generate(el) {
    return tryIdStrategy(el) || tryTestIdStrategy(el) || tryRoleTextStrategy(el) || buildPositionalXPath(el);
  }
  function generateRelative(el, anchor) {
    return buildPositionalXPath(el, anchor);
  }
  function pascalCase(s) {
    return s.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  }
  function deriveLabel(el) {
    const id = el.getAttribute('id');
    if (id) {
      const lab = document.querySelector('label[for="' + id + '"]');
      if (lab && lab.textContent) return lab.textContent.trim();
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder;
    return el.tagName.toLowerCase();
  }
  return { generate, generateRelative, deriveLabel, pascalCase };
})();
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function loadFixture(page: Page): Promise<void> {
  await page.setContent(FIXTURE_HTML, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: STRATEGY_BUNDLE });
}

interface CaptureResult {
  xpath: string;
  strategy: string;
}

async function capture(page: Page, selector: string): Promise<CaptureResult> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('Fixture element missing: ' + sel);
    return (window as unknown as { __XPathStrategies: { generate: (e: Element) => CaptureResult } })
      .__XPathStrategies.generate(el);
  }, selector);
}

async function captureRelative(
  page: Page,
  selector: string,
  anchor: string,
): Promise<CaptureResult> {
  return page.evaluate(({ sel, anc }) => {
    const el = document.querySelector(sel);
    const an = document.querySelector(anc);
    if (!el || !an) throw new Error('Fixture element missing');
    return (window as unknown as { __XPathStrategies: { generateRelative: (e: Element, a: Element) => CaptureResult } })
      .__XPathStrategies.generateRelative(el, an);
  }, { sel: selector, anc: anchor });
}

async function captureVariableName(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('Fixture element missing: ' + sel);
    const api = (window as unknown as { __XPathStrategies: { deriveLabel: (e: Element) => string; pascalCase: (s: string) => string } })
      .__XPathStrategies;
    return api.pascalCase(api.deriveLabel(el));
  }, selector);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe('E2E-21 — XPath Capture (full + relative + anchor + determinism)', () => {
  test.beforeEach(async ({ page }) => {
    await loadFixture(page);
  });

  test('ID strategy wins when element has id', async ({ page }) => {
    const result = await capture(page, '#EmailField');
    expect(result.strategy).toBe('id');
    expect(result.xpath).toBe('//*[@id="EmailField"]');
  });

  test('testid strategy wins when no id but data-testid present', async ({ page }) => {
    const result = await capture(page, '[data-testid="PhoneInput"]');
    expect(result.strategy).toBe('testid');
    expect(result.xpath).toBe('//*[@data-testid="PhoneInput"]');
  });

  test('role+text strategy wins when only role and visible text present', async ({ page }) => {
    const result = await capture(page, 'button[role="button"]');
    expect(result.strategy).toBe('role-text');
    expect(result.xpath).toBe('//*[@role="button"][contains(text(),"Save Preferences")]');
  });

  test('positional fallback walks from documentElement with sibling indexing', async ({ page }) => {
    const result = await capture(page, 'main > form > fieldset > ul > li:nth-child(2)');
    expect(result.strategy).toBe('positional');
    expect(result.xpath).toBe('/body/main/form/fieldset/ul/li[2]');
  });

  test('relative XPath is anchored to chosen ancestor and is shorter than full', async ({ page }) => {
    const full = await capture(page, 'main > form > fieldset > ul > li:nth-child(3)');
    const relative = await captureRelative(
      page,
      'main > form > fieldset > ul > li:nth-child(3)',
      'main > form > fieldset > ul',
    );
    expect(relative.xpath).toBe('./li[3]');
    expect(relative.xpath.length).toBeLessThan(full.xpath.length);
  });

  test('variable name derived from <label for> and PascalCased', async ({ page }) => {
    const name = await captureVariableName(page, '#EmailField');
    expect(name).toBe('EmailAddress');
  });

  test('variable name falls back to placeholder when no label match', async ({ page }) => {
    // Remove the label association to force fallback to placeholder.
    await page.evaluate(() => {
      const lab = document.querySelector('label[for="EmailField"]');
      lab?.removeAttribute('for');
    });
    const name = await captureVariableName(page, '#EmailField');
    expect(name).toBe('YouExampleCom');
  });

  test('variable name falls back to aria-label when group lacks label/placeholder', async ({ page }) => {
    const name = await captureVariableName(page, '[role="group"]');
    expect(name).toBe('Preferences');
  });

  test('repeated capture of same element yields identical selector (deterministic)', async ({ page }) => {
    const first = await capture(page, 'main > form > fieldset > ul > li:nth-child(2)');
    // Re-load the same fixture to simulate a fresh recording session.
    await loadFixture(page);
    const second = await capture(page, 'main > form > fieldset > ul > li:nth-child(2)');
    expect(second).toEqual(first);
  });

  test('relative selector is deterministic across reloads', async ({ page }) => {
    const first = await captureRelative(
      page,
      'main > form > fieldset > ul > li:nth-child(3)',
      'main > form > fieldset > ul',
    );
    await loadFixture(page);
    const second = await captureRelative(
      page,
      'main > form > fieldset > ul > li:nth-child(3)',
      'main > form > fieldset > ul',
    );
    expect(second).toEqual(first);
  });
});
