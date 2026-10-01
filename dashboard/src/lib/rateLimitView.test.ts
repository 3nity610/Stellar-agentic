import { describe, expect, it } from 'vitest';
import type { RateLimitStatus } from '@stellaragent/core';
import {
  buildRateLimitRows,
  buildWindowRows,
  describeBlockReasons,
  formatDuration,
} from './rateLimitView.js';

const configured: RateLimitStatus = {
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

function row(key: string, rows: ReturnType<typeof buildRateLimitRows>) {
  const found = rows.find((item) => item.key === key);
  if (!found) throw new Error(`no row for ${key}`);
  return found;
}

describe('buildRateLimitRows', () => {
  it('computes exact headroom for every ceiling', () => {
    const rows = buildRateLimitRows(configured);
    expect(rows.map((item) => item.key)).toEqual(['per_tx', 'hourly', 'daily', 'tx_count']);

    expect(row('per_tx', rows)).toMatchObject({ spent: '0', limit: '10', headroom: '10' });
    expect(row('hourly', rows)).toMatchObject({
      spent: '12.5',
      limit: '50',
      headroom: '37.5',
      usedPercent: 25,
    });
    expect(row('daily', rows)).toMatchObject({ headroom: '160', usedPercent: 20 });
    expect(row('tx_count', rows)).toMatchObject({ spent: '8', headroom: '92', usedPercent: 8 });
  });

  it('flags an exhausted limit instead of reporting negative headroom', () => {
    const rows = buildRateLimitRows({
      ...configured,
      spentThisHour: '50',
      txsThisHour: 100,
    });
    expect(row('hourly', rows)).toMatchObject({ headroom: '0', exhausted: true });
    expect(row('tx_count', rows)).toMatchObject({ headroom: '0', exhausted: true });
    expect(row('daily', rows).exhausted).toBe(false);
  });

  it('does not render an unset ceiling as an exhausted one', () => {
    const rows = buildRateLimitRows({
      ...configured,
      maxPerHour: '0',
      maxPerDay: '0',
      maxTxsPerHour: 0,
      spentThisHour: '0',
      spentToday: '0',
      txsThisHour: 0,
    });
    for (const key of ['hourly', 'daily', 'tx_count']) {
      expect(row(key, rows)).toMatchObject({
        usedPercent: 0,
        exhausted: false,
        unset: true,
        limit: '—',
        headroom: '—',
      });
    }
  });

  it('keeps sub-unit precision instead of rounding it away', () => {
    const rows = buildRateLimitRows({ ...configured, spentThisHour: '0.0000001', maxPerHour: '1' });
    expect(row('hourly', rows).spent).toBe('0.0000001');
    expect(row('hourly', rows).headroom).toBe('0.9999999');
  });
});

describe('formatDuration', () => {
  it('scales from seconds to days without inventing precision', () => {
    expect(formatDuration(0)).toBe('now');
    expect(formatDuration(-1)).toBe('now');
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(3100)).toBe('51 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(84600)).toBe('23 h 30 min');
    expect(formatDuration(86400)).toBe('1 d');
    expect(formatDuration(90000)).toBe('1 d 1 h');
  });
});

describe('buildWindowRows', () => {
  it('carries both the ledger count and the estimated wall clock', () => {
    const rows = buildWindowRows({
      hour: { ledgersRemaining: 620, estimatedSecondsRemaining: 3100 },
      day: { ledgersRemaining: 17180, estimatedSecondsRemaining: 85900 },
    });
    expect(rows).toEqual([
      {
        key: 'hour',
        label: 'Hourly window',
        ledgersRemaining: 620,
        estimatedSecondsRemaining: 3100,
        resetsIn: '51 min',
      },
      {
        key: 'day',
        label: 'Daily window',
        ledgersRemaining: 17180,
        estimatedSecondsRemaining: 85900,
        resetsIn: '23 h 51 min',
      },
    ]);
  });
});

describe('describeBlockReasons', () => {
  it('names the on-chain check each reason refers to', () => {
    expect(describeBlockReasons(['rate_limit_per_tx', 'rate_limit_daily'])).toEqual([
      'exceeds the per-transaction cap',
      'exceeds the daily spend cap',
    ]);
  });

  it('passes an unknown reason through rather than dropping it', () => {
    expect(describeBlockReasons(['something_new'])).toEqual(['something_new']);
  });
});
