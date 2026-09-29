import { expect, test, type Page } from '@playwright/test';

/**
 * `/limits` is the one dashboard page whose contents come from a live
 * `@stellaragent/react` hook rather than from mock data, so it needs its own
 * spec instead of the route smoke test in `routes.spec.ts`.
 *
 * The page reads through `useRateLimitStatus`, which resolves
 * `RateLimiter.get_limits` and a Horizon ledger-close estimate against a
 * `StellarAgent` from the provider context. CI has no network, so each test
 * installs a stub agent on `window.__STELLARAGENT_AGENT__` — the injection
 * point `StellarAgentProvider`'s `agent` prop is read from (see
 * `src/lib/agentRuntime.tsx`). Everything downstream of that is the real hook,
 * the real `predictPaymentOutcome`, and the real page.
 */

const CONFIGURED = {
  configured: true,
  active: true,
  maxPerTx: '10',
  maxPerHour: '50',
  maxPerDay: '200',
  maxTxsPerHour: 100,
  spentThisHour: '12.5',
  spentToday: '40',
  txsThisHour: 8,
  hourWindowStartLedger: 1000,
  dayWindowStartLedger: 1000,
};

const UNCONFIGURED = {
  configured: false,
  active: true,
  maxPerTx: '0',
  maxPerHour: '0',
  maxPerDay: '0',
  maxTxsPerHour: 0,
  spentThisHour: '0',
  spentToday: '0',
  txsThisHour: 0,
  hourWindowStartLedger: 0,
  dayWindowStartLedger: 0,
};

/** Ledger 1100, 100 ledgers into both windows, closing every 5s. */
const LEDGER = { currentLedger: 1100, avgLedgerCloseSeconds: 5, observed: true };

async function installStubAgent(
  page: Page,
  rateLimit: typeof CONFIGURED | typeof UNCONFIGURED,
  ledger = LEDGER,
): Promise<void> {
  await page.addInitScript(
    ([status, estimate]) => {
      const calls: string[] = [];
      (window as unknown as { __calls: string[] }).__calls = calls;
      (window as unknown as { __STELLARAGENT_AGENT__: unknown }).__STELLARAGENT_AGENT__ = {
        getRateLimitStatus: async (address: string) => {
          calls.push(address);
          return status;
        },
        getLedgerCloseEstimate: async () => estimate,
      };
    },
    [rateLimit, ledger] as const,
  );
}

test('renders every limit with live headroom and each window reset time', async ({ page }) => {
  await installStubAgent(page, CONFIGURED);
  await page.goto('/limits');

  await expect(page.getByRole('heading', { name: 'Rate Limits', level: 1 })).toBeVisible();
  await expect(page.getByText('Rate limits active for')).toBeVisible();

  // The hook is actually driving the page, not a fixture: it was asked about
  // the agent the selector is showing.
  const queried = await page.evaluate(
    () => (window as unknown as { __calls: string[] }).__calls,
  );
  expect(queried.length).toBeGreaterThan(0);

  // Per-transaction, hourly spend, daily spend, hourly tx count — each with the
  // consumed amount, the ceiling, and the exact remaining headroom.
  for (const [label, spent, limit, headroom] of [
    ['Per transaction', '0', '10', '10'],
    ['Hourly spend', '12.5', '50', '37.5'],
    ['Daily spend', '40', '200', '160'],
    ['Hourly transactions', '8', '100', '92'],
  ] as const) {
    const card = page.getByRole('region', { name: label });
    await expect(card.getByText(`${spent} / ${limit}`, { exact: true })).toBeVisible();
    await expect(card.getByText(`Headroom ${headroom}`, { exact: true })).toBeVisible();
  }

  // Hourly window: 720 - (1100 - 1000) = 620 ledgers, at 5s each = ~51 min.
  // Daily: 17280 - 100 = 17180 ledgers ≈ 23 h 51 min.
  await expect(page.getByText('~51 min')).toBeVisible();
  await expect(page.getByText('~23 h 51 min')).toBeVisible();
  await expect(page.getByText('620 ledgers')).toBeVisible();
  await expect(page.getByText('17180 ledgers')).toBeVisible();
  // The estimate is labelled as one, not sold as a countdown.
  await expect(page.getByText('Estimated from observed ledger close times, not a countdown'))
    .toBeVisible();
});

test('predicts whether an amount would clear every ceiling', async ({ page }) => {
  await installStubAgent(page, CONFIGURED);
  await page.goto('/limits');

  const amount = page.getByLabel('Test amount');
  await expect(page.getByText('Allowed', { exact: true })).toBeVisible();

  // maxPerTx is 10.
  await amount.fill('20');
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByText('exceeds the per-transaction cap')).toBeVisible();

  await amount.fill('1');
  await expect(page.getByText('Allowed', { exact: true })).toBeVisible();
});

test('says so explicitly when the agent has no rate limits, without rendering zeros', async ({ page }) => {
  await installStubAgent(page, UNCONFIGURED);
  await page.goto('/limits');

  await expect(
    page.getByText('No rate limits configured for', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('every limit below is', { exact: false })).toBeVisible();

  // Unset must not be drawn as "0 / 0", an exhausted bar, or a reset clock.
  const main = page.getByRole('main');
  await expect(main.getByText('Headroom 0')).toHaveCount(0);
  await expect(main.getByText('Exhausted')).toHaveCount(0);
  await expect(main.getByText('Hourly window')).toHaveCount(0);
  await expect(page.getByText('Coming soon')).toHaveCount(0);
});

test('marks a zero ceiling as unset rather than drawing an exhausted bar', async ({ page }) => {
  await installStubAgent(page, {
    ...CONFIGURED,
    // The contract reads a zero cap as "no ceiling", not "no allowance".
    maxPerHour: '0',
    maxTxsPerHour: 0,
    spentThisHour: '12.5',
  });
  await page.goto('/limits');

  const hourly = page.getByRole('region', { name: 'Hourly spend' });
  await expect(hourly.getByText('No ceiling')).toBeVisible();
  await expect(hourly.getByText('12.5 / —', { exact: true })).toBeVisible();
  await expect(hourly.getByText('No cap on this limit')).toBeVisible();
  await expect(hourly.getByText('Exhausted')).toHaveCount(0);
  await expect(hourly.getByText('0%', { exact: true })).toBeVisible();

  // A limit that is actually set still reports real headroom alongside it.
  await expect(
    page.getByRole('region', { name: 'Daily spend' })
      .getByText('Headroom 160', { exact: true }),
  ).toBeVisible();
});

test('reports a failed read instead of silently showing stale limits', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __STELLARAGENT_AGENT__: unknown }).__STELLARAGENT_AGENT__ = {
      getRateLimitStatus: async () => {
        throw new Error('rpc unreachable');
      },
      getLedgerCloseEstimate: async () => ({ currentLedger: 0, avgLedgerCloseSeconds: 5, observed: false }),
    };
  });
  await page.goto('/limits');

  await expect(page.getByText('Could not read rate limits: rpc unreachable')).toBeVisible();
  await expect(page.getByText('Rate limits active for')).toHaveCount(0);
});
