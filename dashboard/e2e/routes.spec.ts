import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Smoke tests for every route the dashboard serves.
 *
 * The bar here is deliberately "the page renders its own content and nothing
 * blew up in the console" rather than deep assertions on the mock data —
 * these exist to catch the failure mode the dashboard actually has today
 * (a bad import or a router regression turning a route into a blank screen).
 *
 * ACCESSIBILITY: Every route is tested for critical WCAG violations using axe-core.
 * The suite will fail if any critical accessibility issues are detected.
 */

/** The fully-built routes, plus the one intentional placeholder. */
const MAIN_ROUTES = [
  { path: '/', heading: 'Overview' },
  { path: '/agents', heading: 'Agents' },
  { path: '/payments', heading: 'Payments' },
  { path: '/reports', heading: 'Reports' },
  { path: '/jobs', heading: 'Escrow Jobs' },
  { path: '/limits', heading: 'Rate Limits' },
] as const;

const PLACEHOLDER_ROUTES = [
  { path: '/settings', heading: 'Settings' },
] as const;

/**
 * Collect console errors and uncaught exceptions for the lifetime of a test.
 * Returns a getter rather than the array so callers read it after navigation.
 */
function collectPageErrors(page: Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors;
}

test.describe('main routes', () => {
  for (const { path, heading } of MAIN_ROUTES) {
    test(`${path} renders its heading`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    });

    test(`${path} renders without console errors`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      expect(errors()).toEqual([]);
    });

    test(`${path} renders the persistent sidebar`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Agents' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Payments' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Escrow Jobs' })).toBeVisible();
    });

    test(`${path} paints actual content, not a blank screen`, async ({ page }) => {
      await page.goto(path);
      const text = await page.locator('main').innerText();
      expect(text.trim().length).toBeGreaterThan(20);
    });

    test(`${path} has zero critical accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      
      const criticalViolations = results.violations.filter(
        v => v.impact === 'critical' || v.impact === 'serious'
      );
      
      expect(criticalViolations, 
        `Found ${criticalViolations.length} critical/serious accessibility violations on ${path}:\n` +
        criticalViolations.map(v => 
          `  - ${v.id}: ${v.description}\n` +
          `    Impact: ${v.impact}\n` +
          `    Help: ${v.helpUrl}\n` +
          `    Affected nodes: ${v.nodes.length}`
        ).join('\n')
      ).toEqual([]);
    });
  }
});

test.describe('placeholder routes', () => {
  for (const { path, heading } of PLACEHOLDER_ROUTES) {
    test(`${path} renders its "coming soon" placeholder`, async ({ page }) => {
      await page.goto(path);
      // Scoped to <main>: the same label also appears in the sidebar nav, and
      // an unscoped match is a strict-mode violation rather than an assertion.
      const main = page.getByRole('main');
      await expect(main.getByText(heading, { exact: true })).toBeVisible();
      await expect(main.getByText(/Coming soon/i)).toBeVisible();
    });
  }
});

test.describe('navigation', () => {
  test('walks every nav item without a full page reload', async ({ page }) => {
    await page.goto('/');
    // A client-side route change must not re-run the bootstrap; tag the
    // window so a reload is detectable.
    await page.evaluate(() => {
      (window as unknown as { __spa: boolean }).__spa = true;
    });

    for (const { heading } of [...MAIN_ROUTES.slice(1), ...PLACEHOLDER_ROUTES]) {
      await page.getByRole('link', { name: heading }).click();
      await expect(page.getByRole('main').getByText(heading, { exact: true })).toBeVisible();
    }

    const stillSameDocument = await page.evaluate(
      () => (window as unknown as { __spa?: boolean }).__spa === true,
    );
    expect(stillSameDocument).toBe(true);
  });

  test('an unknown route does not crash the shell', async ({ page }) => {
    await page.goto('/no-such-page');
    // No catch-all route is defined, so <main> is empty — but the sidebar
    // and app shell must still render rather than white-screening.
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  });
});

test.describe('page metadata', () => {
  test('sets the document title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/StellarAgent/);
  });
});

test.describe('keyboard navigation', () => {
  test('can navigate through all sidebar links using Tab', async ({ page }) => {
    await page.goto('/');
    
    // Focus the first navigation link
    await page.keyboard.press('Tab');
    const firstLink = page.getByRole('link', { name: 'Overview' });
    await expect(firstLink).toBeFocused();
    
    // Tab through all navigation items
    const navItems = ['Agents', 'Payments', 'Reports', 'Escrow Jobs', 'Alerts', 'Health', 'Rate Limits', 'Settings'];
    for (const itemName of navItems) {
      await page.keyboard.press('Tab');
      const link = page.getByRole('link', { name: itemName });
      await expect(link).toBeFocused();
    }
  });

  test('can activate navigation links using Enter key', async ({ page }) => {
    await page.goto('/');
    
    // Tab to the Agents link and activate it
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Move to Agents
    await page.keyboard.press('Enter');
    
    await expect(page.getByRole('heading', { name: 'Agents', level: 1 })).toBeVisible();
    expect(page.url()).toContain('/agents');
  });
});
