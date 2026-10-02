import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Playwright setup for the dashboard (closes out GitHub issue #63, which the
 * old `test` script pointed at as a placeholder).
 *
 * Tests run against a production build served by `vite preview` rather than
 * the dev server, so what CI exercises is the same bundle that ships. The
 * `webServer` block builds and starts it automatically.
 *
 * ## Mock mode is explicit, and it is set here
 *
 * The e2e suite runs in mock mode on purpose, and says so in one place rather
 * than scattering `?mode=mock` through every spec. Two things follow from that:
 *
 *   - The build needs no deployed contracts and no indexer, so the suite runs
 *     on a machine that has never seen a Stellar network.
 *   - Mock mode still goes through the *same* `@stellaragent/react` hooks and
 *     the same panels as live mode — it swaps the agent underneath, not the
 *     code path. So a green suite is evidence the wiring holds, which is
 *     exactly what a fixture-import "dashboard" could never be.
 *
 * `VITE_STELLARAGENT_MODE` is read at **build** time, so it has to be on the
 * `build` step's environment and not just the preview server's.
 */
const MOCK_ENV = 'VITE_STELLARAGENT_MODE=mock';

export default defineConfig({
  testDir: './e2e',
  // A route smoke test that hangs is a failure, not something to wait out.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Fail the build if a `test.only` is committed.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: `${MOCK_ENV} pnpm run build && pnpm run preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_STELLARAGENT_MODE: 'mock' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
