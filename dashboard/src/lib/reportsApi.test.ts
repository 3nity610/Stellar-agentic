import { describe, expect, it, vi } from 'vitest';
import {
  ReportsApi,
  statementExportPath,
  statementPath,
  type ReportScheduleInput,
} from './reportsApi.js';

const request = {
  subject: { kind: 'agent' as const, id: 'G/A agent' },
  period: { fromLedger: 10, throughLedger: 20 },
};

describe('reports API client', () => {
  it('builds encoded preview and export paths with inclusive boundaries', () => {
    expect(statementPath(request)).toBe(
      '/reports/statements/agent/G%2FA%20agent?fromLedger=10&throughLedger=20',
    );
    expect(statementExportPath(request, 'csv')).toBe(
      '/reports/statements/agent/G%2FA%20agent/export?fromLedger=10&throughLedger=20&format=csv',
    );
  });

  it('fetches a statement from a configurable indexer origin', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ statementId: 's1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const api = new ReportsApi('http://localhost:3001/', fetcher);
    await expect(api.statement(request)).resolves.toMatchObject({ statementId: 's1' });
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3001/reports/statements/agent/G%2FA%20agent?fromLedger=10&throughLedger=20',
    );
  });

  it('posts durable schedule inputs as JSON', async () => {
    const input: ReportScheduleInput = {
      scheduleId: 'quarterly-audit',
      subject: { kind: 'owner', id: 'GOWNER' },
      cadence: 'quarterly',
      format: 'iif',
      destinations: [{ id: 'finance', kind: 'email', to: ['finance@example.test'] }],
      nextRunAt: '2026-10-01T00:00:00.000Z',
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ...input,
      enabled: true,
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    }), { status: 201 }));
    const api = new ReportsApi('', fetcher);
    await expect(api.createSchedule(input)).resolves.toMatchObject({ scheduleId: input.scheduleId });
    expect(fetcher).toHaveBeenCalledWith('/reports/schedules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('posts balance checkpoints to build a reconciled statement', async () => {
    const reconciliation = {
      fromLedger: 10,
      asOfLedger: 20,
      openingPositions: [{ account: 'CCHANNEL', asset: 'CUSDC', amount: '0' }],
      onChainPositions: [{ account: 'CCHANNEL', asset: 'CUSDC', amount: '25' }],
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      statementId: 'reconciled',
      reconciliation: { reconciled: true },
    }), { status: 200 }));
    const api = new ReportsApi('', fetcher);
    await expect(api.reconciledStatement(request, reconciliation)).resolves
      .toMatchObject({ reconciliation: { reconciled: true } });
    expect(fetcher).toHaveBeenCalledWith(statementPath(request), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reconciliation),
    });
  });

  it('surfaces server error messages', async () => {
    const api = new ReportsApi('', async () => new Response(
      JSON.stringify({ error: 'invalid delivery status' }),
      { status: 400 },
    ));
    await expect(api.deliveries('retry')).rejects.toThrow('invalid delivery status');
  });
});
