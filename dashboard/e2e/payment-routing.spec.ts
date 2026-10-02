import { expect, test } from '@playwright/test';

test.describe('routed payment preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/payments');
  });

  test('shows the chosen route and costs before confirmation', async ({ page }) => {
    await page.getByLabel('Source amount').fill('25.0000000');
    await page.getByRole('button', { name: 'Preview route' }).click();

    const preview = page.getByTestId('route-preview');
    await expect(preview).toContainText('XLM  →  AMM · USDC');
    await expect(preview).toContainText('You pay');
    await expect(preview).toContainText('25.0000000 XLM');
    await expect(preview).toContainText('Recipient receives');
    await expect(preview).toContainText('24.9250000 USDC');
    await expect(preview).toContainText('Estimated fees');
    await expect(preview).toContainText('30 bps (0.30%)');
    await expect(preview).toContainText('Expected slippage');
    await expect(preview).toContainText('20 bps (0.20%)');
    await expect(preview).toContainText('Minimum received');
    await expect(preview).toContainText('Quote expiry');
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('requires preview and then records explicit confirmation', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Confirm routed payment' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview route' }).click();
    await page.getByRole('button', { name: 'Confirm routed payment' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Route confirmed. The selected quote is ready for atomic submission.',
    );
  });

  test('invalidates an old quote when payment inputs change', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview route' }).click();
    await expect(page.getByTestId('route-preview')).toBeVisible();
    await page.getByLabel('Destination asset').selectOption('AQUA');
    await expect(page.getByTestId('route-preview')).toHaveCount(0);
  });
});
