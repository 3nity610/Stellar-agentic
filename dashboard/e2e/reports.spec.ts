import { expect, test } from '@playwright/test';

const statement = {
  statementId: 'statement:agent:GAGENT:10-20',
  subject: { kind: 'agent', id: 'GAGENT' },
  period: { fromLedger: 10, throughLedger: 20 },
  lines: [{
    lineId: 'line-1',
    entryId: 'entry-1',
    eventId: 'event-1',
    txHash: 'a'.repeat(64),
    ledger: 15,
    ledgerClosedAt: '2026-08-01T00:00:00.000Z',
    kind: 'channel_payment',
    category: 'payment',
    direction: 'debit',
    counterparty: 'GCOUNTERPARTY',
    memo: 'inference',
    referenceType: 'channel',
    referenceId: '7',
    asset: 'USDC',
    amount: '1250000',
    signedAmount: '-1250000',
    destinationAsset: null,
    destinationAmount: null,
    runningBalance: '8750000',
  }],
  positions: [{
    asset: 'USDC',
    openingAmount: '10000000',
    credits: '0',
    debits: '1250000',
    closingAmount: '8750000',
  }],
  categories: [{
    dimension: 'payment_type',
    key: 'payment',
    asset: 'USDC',
    count: 1,
    credits: '0',
    debits: '1250000',
    net: '-1250000',
  }],
  evidence: {
    entryCount: 1,
    transactionCount: 1,
    transactionHashes: ['a'.repeat(64)],
    firstLedger: 15,
    lastLedger: 15,
  },
  reconciliation: {
    fromLedger: 10,
    asOfLedger: 20,
    reconciled: true,
    checkedEntries: 1,
    lines: [],
  },
};

test('builds a statement, changes export format, and drills to transaction evidence', async ({ page }) => {
  let reconciliationBody: unknown;
  await page.route('**/reports/statements/agent/**', async (route) => {
    reconciliationBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statement) });
  });
  await page.goto('/reports');
  await page.getByLabel('Report account').fill('GAGENT');
  await page.getByLabel('Opening ledger').fill('10');
  await page.getByLabel('Closing ledger').fill('20');
  await page.getByLabel('Attach opening and closing on-chain balance checkpoints').check();
  await page.getByLabel('Opening snapshot JSON').fill('[{"account":"CCHANNEL","asset":"CUSDC","amount":"0"}]');
  await page.getByLabel('Closing snapshot JSON').fill('[{"account":"CCHANNEL","asset":"CUSDC","amount":"10"}]');
  await page.getByRole('button', { name: 'Build preview' }).click();

  await expect(page.getByText(statement.statementId)).toBeVisible();
  await expect(page.getByText('Exact', { exact: true })).toBeVisible();
  expect(reconciliationBody).toMatchObject({ fromLedger: 10, asOfLedger: 20 });
  await expect(page.getByRole('cell', { name: '8750000' })).toBeVisible();

  await page.getByLabel('Export format').selectOption('iif');
  await expect(page.getByRole('link', { name: 'Export' })).toHaveAttribute(
    'href',
    /\/reports\/statements\/agent\/GAGENT\/export\?.*format=iif/,
  );

  await page.getByRole('button', { name: 'Verify' }).click();
  const evidence = page.getByText('Transaction evidence').locator('..');
  await expect(evidence).toBeVisible();
  const transactionLink = page.getByRole('link', { name: new RegExp(statement.lines[0].txHash) });
  await expect(transactionLink).toHaveAttribute('href', new RegExp(`/tx/${statement.lines[0].txHash}$`));
});

test('creates a durable schedule and replays a dead-letter delivery', async ({ page }) => {
  const savedSchedule = {
    scheduleId: 'monthly-finance',
    subject: { kind: 'agent', id: 'GAGENT' },
    cadence: 'monthly',
    format: 'csv',
    destinations: [{ id: 'primary-webhook', kind: 'webhook', url: 'https://finance.example.test/reports' }],
    nextRunAt: '2026-09-01T00:00:00.000Z',
    enabled: true,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
  let replayed = false;
  let scheduleBody: unknown;
  await page.route('**/reports/schedules', async (route) => {
    if (route.request().method() === 'POST') {
      scheduleBody = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(savedSchedule) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([savedSchedule]) });
    }
  });
  await page.route(/\/reports\/deliveries(?:\/.*)?(?:\?.*)?$/, async (route) => {
    const delivery = {
      deliveryId: 'delivery-dead', artifactId: 'artifact-1', scheduleId: savedSchedule.scheduleId,
      runKey: 'run-1', destination: savedSchedule.destinations[0], idempotencyKey: 'key-1',
      status: replayed ? 'retry' : 'dead_letter', attemptCount: replayed ? 0 : 5,
      nextAttemptAt: '2026-08-28T00:00:00.000Z', leaseUntil: null,
      lastError: replayed ? null : 'provider unavailable', deliveredAt: null,
      createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z',
    };
    if (route.request().url().endsWith('/replay')) {
      replayed = true;
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ...delivery, status: 'retry', attemptCount: 0 }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...delivery, status: replayed ? 'retry' : 'dead_letter', attemptCount: replayed ? 0 : 5 }]) });
    }
  });

  await page.goto('/reports');
  await page.getByLabel('Report account').fill('GAGENT');
  await page.getByLabel('Schedule ID').fill(savedSchedule.scheduleId);
  await page.getByLabel('Webhook URL').fill(savedSchedule.destinations[0].url);
  await page.getByRole('button', { name: 'Save schedule' }).click();

  await expect(page.getByRole('cell', { name: savedSchedule.scheduleId }).first()).toBeVisible();
  expect(scheduleBody).toMatchObject({
    scheduleId: savedSchedule.scheduleId,
    subject: { kind: 'agent', id: 'GAGENT' },
    destinations: [{ kind: 'webhook', url: savedSchedule.destinations[0].url }],
  });
  await expect(page.getByText('Dead letter')).toBeVisible();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(page.getByText('Retry', { exact: true })).toBeVisible();
  expect(replayed).toBe(true);
});
