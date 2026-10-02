import { expect, test } from '@playwright/test';

/**
 * Where the dashboard's data comes from, and what it does when it has none.
 *
 * The build under test is `VITE_STELLARAGENT_MODE=mock` (see
 * `playwright.config.ts`), so the first block here is really asserting that
 * the explicit switch works and is respected — the property the rest of the
 * suite depends on. The rest of the file covers the states that only exist
 * when the dashboard *isn't* being fed fixtures, which is the point of wiring
 * it to the chain at all.
 */

test.describe('data source', () => {
  test('runs the e2e build in mock mode, and says so', async ({ page }) => {
    await page.goto('/');
    const badge = page.getByTestId('data-mode');
    await expect(badge).toHaveAttribute('data-mode', 'mock');
    await expect(badge).toContainText('Demo data');
    // Fixtures, and nothing that pretends otherwise: no network is reachable
    // in this suite, so anything claiming to be live would be lying.
    await expect(badge).toContainText('fixtures, not the chain');
  });

  test('a URL parameter overrides the build default', async ({ page }) => {
    // The badge lives in the sidebar, which the unconfigured screen replaces,
    // so the assertion is on that screen — proof the parameter was honoured
    // and not silently ignored in favour of the build-time default.
    await page.goto('/?mode=chain');
    await expect(page.getByRole('heading', { name: /not connected to a network/i })).toBeVisible();
  });

  test('the sidebar toggle switches mode and survives a reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('data-mode')).toHaveAttribute('data-mode', 'mock');

    await page.getByRole('button', { name: 'Go live data' }).click();
    // Unconfigured live mode is a checklist, not an empty dashboard.
    await expect(page.getByRole('heading', { name: /not connected to a network/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /not connected to a network/i })).toBeVisible();

    // The same escape hatch is offered on the checklist itself, so an
    // operator who lands there is never stuck.
    await page.getByTestId('use-demo-data').click();
    await expect(page.getByTestId('data-mode')).toHaveAttribute('data-mode', 'mock');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  });
});

test.describe('live mode without configuration', () => {
  test('lists what is missing instead of rendering fixtures', async ({ page }) => {
    await page.goto('/agents?mode=chain');
    await expect(page.getByRole('heading', { name: /not connected to a network/i })).toBeVisible();

    const checklist = page.locator('main, .card').first();
    await expect(checklist).toContainText('VITE_STELLARAGENT_VIEWER_KEY');
    await expect(checklist).toContainText('VITE_STELLARAGENT_AGENTS');

    // The critical assertion: the mock roster is nowhere on the page. A
    // dashboard that falls back to fixtures when configuration is missing is
    // the exact failure this wiring exists to close.
    await expect(page.getByText('Summarizer Bot')).toHaveCount(0);
    await expect(page.getByText('Data Scraper')).toHaveCount(0);
  });

  test('points at the mock escape hatch in the same breath', async ({ page }) => {
    await page.goto('/?mode=chain');
    await expect(page.getByTestId('use-demo-data')).toBeVisible();
  });
});

test.describe('panels in mock mode', () => {
  test('agents render through the SDK hooks, not a fixture import', async ({ page }) => {
    await page.goto('/agents');
    // These names come from mockData, but only because the mock *agent*
    // answers `getRateLimitStatus` for them and the panel maps the result.
    await expect(page.getByText('Summarizer Bot')).toBeVisible();
    await expect(page.getByText('Data Scraper')).toBeVisible();
    // The spend bars are the panel's own arithmetic over the agent's limits.
    await expect(page.getByRole('button', { name: /^All \(4\)$/ })).toBeVisible();
  });

  test('escrow jobs render through the same path', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.getByText('Summarize Q3 earnings report PDF', { exact: false })).toBeVisible();
    // The label appears twice — the summary card and the row's status badge.
    await expect(page.getByText('Pending Release').first()).toBeVisible();
  });

  test('the payment feed is present, and links somewhere real', async ({ page }) => {
    await page.goto('/payments');
    await expect(page.getByText('api.openai.com/v1/chat').first()).toBeVisible();
    // The ledger link must not be a transaction link to a ledger number.
    const link = page.getByRole('link', { name: /#52241983/ });
    await expect(link).toHaveAttribute('href', /explorer\/testnet\/ledger\/52241983$/);
  });
});
