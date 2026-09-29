import { describe, expect, it } from 'vitest';
import type { ChannelInfo, JobInfo, RateLimitStatus } from '@stellaragent/core';
import {
  WARNING_THRESHOLD_PERCENT,
  agentStatus,
  estimatedDuration,
  relativeTime,
  secondsUntilPeriodReset,
  shorten,
  spendPercent,
  toAgentView,
  toJobView,
  toPaymentView,
  toSpendSeries,
  type AgentSnapshot,
  type PaymentEvent,
} from '../views.js';

const ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
// 12:50 rather than 12:00:00, so an event "5 minutes ago" lands inside the
// current hour's bucket instead of the previous one.
const NOW = Date.parse('2026-09-29T12:50:00.000Z');

function channel(overrides: Partial<ChannelInfo> = {}): ChannelInfo {
  return {
    id: 1n,
    agent: ADDRESS,
    owner: ADDRESS,
    token: 'CUSDC',
    limitPerPeriod: 50_000_000n, // 5.0000000
    spentThisPeriod: 10_000_000n, // 1.0000000
    totalSpent: 80_000_000n, // 8.0000000
    active: true,
    period: 'hourly',
    periodStartLedger: 52_241_800,
    ...overrides,
  };
}

function rateLimit(overrides: Partial<RateLimitStatus> = {}): RateLimitStatus {
  return {
    configured: true,
    active: true,
    maxPerTx: '1.0000000',
    maxPerHour: '5.0000000',
    maxPerDay: '25.0000000',
    maxTxsPerHour: 40,
    spentThisHour: '1.0000000',
    spentToday: '8.0000000',
    txsThisHour: 42,
    hourWindowStartLedger: 52_241_800,
    dayWindowStartLedger: 52_200_000,
    ...overrides,
  };
}

function snapshot(overrides: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    address: ADDRESS,
    name: 'Inference Agent',
    channelId: 1n,
    channel: channel(),
    rateLimit: rateLimit(),
    balance: '142.5043210',
    currentLedger: 52_241_900,
    ...overrides,
  };
}

describe('agentStatus', () => {
  it('is active below the warning threshold', () => {
    expect(agentStatus('1', '5', '8', '25', true)).toBe('active');
  });

  it('warns at the threshold on either window', () => {
    expect(agentStatus('3.99', '5', '1', '25', true)).toBe('active');
    // Exactly at the threshold warns: 80% of a spend limit is the last moment
    // a human can usefully act on it.
    expect(agentStatus('4', '5', '1', '25', true)).toBe('warning');
    expect(agentStatus('1', '5', '25', '25', true)).toBe('warning');
    expect(WARNING_THRESHOLD_PERCENT).toBe(80);
  });

  it('reports inactive ahead of warning — a closed channel is not "near a limit"', () => {
    // Warning would be actively misleading here: nothing is spending, so
    // there is no spend to be near.
    expect(agentStatus('99', '5', '99', '25', false)).toBe('inactive');
  });
});

describe('relativeTime', () => {
  it('reads the way the existing fixtures did', () => {
    expect(relativeTime(NOW - 2_000, NOW)).toBe('2 seconds ago');
    expect(relativeTime(NOW - 60_000, NOW)).toBe('1 minute ago');
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 hours ago');
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2 days ago');
  });

  it('never reports a negative age for a clock that disagrees', () => {
    expect(relativeTime(NOW + 5_000, NOW)).toBe('0 seconds ago');
  });
});

describe('estimatedDuration', () => {
  it('picks a unit a human can read at a glance', () => {
    expect(estimatedDuration(0)).toBe('now');
    expect(estimatedDuration(30)).toBe('~30s');
    expect(estimatedDuration(3_000)).toBe('~50m');
    expect(estimatedDuration(7_200)).toBe('~2.0h');
  });
});

describe('shorten', () => {
  it('keeps both ends of the address, like AddressChip', () => {
    expect(shorten(ADDRESS)).toBe('GDQP…4W37');
    expect(shorten('short')).toBe('short');
  });
});

describe('spendPercent', () => {
  it("uses the channel's own period when there is one", () => {
    // 1 of 5 = 20%. The rate limiter's hourly window happens to agree here,
    // so a wrong source would pass; the next case breaks the tie.
    expect(spendPercent(channel(), rateLimit({ spentThisHour: '4.9' }))).toBe(20);
  });

  it('falls back to the rate limiter when the agent has no channel', () => {
    expect(spendPercent(null, rateLimit({ spentThisHour: '2.5' }))).toBe(50);
  });

  it('is 0 rather than NaN when nothing is configured', () => {
    expect(spendPercent(null, null)).toBe(0);
    expect(spendPercent(null, rateLimit({ configured: false, spentThisHour: '0', maxPerHour: '0' })))
      .toBe(0);
  });
});

describe('toAgentView', () => {
  it('converts stroops to asset units without touching a float', () => {
    const view = toAgentView(snapshot(), NOW);
    expect(view.spentThisHour).toBe('1.00');
    expect(view.spentToday).toBe('8.00');
    expect(view.limitPerHour).toBe('5.00');
    expect(view.limitPerDay).toBe('25.00');
    expect(view.balance).toBe('142.50');
    expect(view.status).toBe('active');
    expect(view.totalOps).toBe(42);
    expect(view.channelId).toBe('1');
  });

  it('falls back to the channel limit when the rate limiter is unconfigured', () => {
    // An agent can have a channel and no `RateLimiter.set_limits` call. Its
    // rate-limit numbers are all zero and meaningless; the channel's are not.
    const view = toAgentView(
      snapshot({ rateLimit: rateLimit({ configured: false, spentThisHour: '0', spentToday: '0' }) }),
      NOW,
    );
    expect(view.limitPerHour).toBe('5.00');
    expect(view.spentThisHour).toBe('1.00');
    expect(view.status).toBe('active');
  });

  it('says "no payments yet" rather than inventing a timestamp', () => {
    expect(toAgentView(snapshot(), NOW).lastActive).toBe('no payments yet');
    expect(toAgentView(snapshot({ lastPaymentAtMs: NOW - 45_000 }), NOW).lastActive)
      .toBe('45 seconds ago');
  });

  it('does not invent an asset code the chain cannot supply', () => {
    // The contract reports a `C...` token id, not "USDC". The roster fills
    // that in; a view model that guessed would be a plausible-looking lie.
    expect(toAgentView(snapshot(), NOW).asset).toBe('');
  });
});

describe('toJobView', () => {
  const info: JobInfo = {
    id: 7n,
    requester: ADDRESS,
    worker: null,
    arbiter: null,
    token: 'CUSDC',
    amount: 500_000n, // 0.05
    taskDescription: 'Summarize a document',
    result: null,
    deadlineLedger: 52_242_772,
    status: 'open',
    createdAt: 52_241_180,
  };

  it('maps the on-chain status through unchanged', () => {
    expect(toJobView(info, 52_241_900).status).toBe('open');
  });

  it('turns ledger distances into a wall-clock hint', () => {
    // 872 ledgers at the 5s fallback is ~1.2 hours.
    expect(toJobView(info, 52_241_900).deadline).toBe('in ~1.2 hours');
    // A measured 2s close time halves that, which is why the estimate is a
    // parameter rather than a constant.
    expect(toJobView(info, 52_241_900, {}, 2).deadline).toBe('in ~29 minutes');
    expect(toJobView(info, 52_243_000).deadline).toBe('expired');
  });

  it('prefers roster names over truncated addresses', () => {
    const view = toJobView(info, 52_241_900, { requester: 'Inference Agent' });
    expect(view.requesterName).toBe('Inference Agent');
    expect(view.workerName).toBeNull();
  });

  it('reports "not yet assigned" as no worker at all', () => {
    expect(toJobView(info, 52_241_900).worker).toBeNull();
  });
});

describe('toPaymentView', () => {
  const event: PaymentEvent = {
    eventId: 'e-1',
    txHash: 'a'.repeat(64),
    ledger: 52_241_983,
    ledgerClosedAt: new Date(NOW - 5_000).toISOString(),
    channelId: '1',
    agent: ADDRESS,
    recipient: 'GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ',
    amount: '0.002',
    memo: 'api.openai.com/v1/chat',
  };

  it('renders an indexed event as a successful payment', () => {
    const view = toPaymentView(event, { [ADDRESS]: 'Inference Agent' }, NOW);
    expect(view).toMatchObject({
      id: 'e-1',
      agentName: 'Inference Agent',
      endpoint: 'api.openai.com/v1/chat',
      ledger: 52_241_983,
      status: 'success',
      timestamp: '5 seconds ago',
      txHash: 'a'.repeat(64),
    });
    expect(view.amount).toBe('0.00');
  });

  it('names an agent the roster does not know by address', () => {
    expect(toPaymentView(event, {}, NOW).agentName).toBe('GDQP…4W37');
  });

  it('falls back to a dash for a payment with no memo', () => {
    expect(toPaymentView({ ...event, memo: '' }, {}, NOW).endpoint).toBe('—');
  });
});

describe('toSpendSeries', () => {
  const eventAt = (minutesAgo: number, amount: string) => ({
    ...({
      eventId: `e-${minutesAgo}-${amount}`,
      txHash: '',
      ledger: 1,
      ledgerClosedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
      channelId: '1',
      agent: ADDRESS,
      recipient: ADDRESS,
      amount,
      memo: '',
    } satisfies PaymentEvent),
  });

  it('always returns one bucket per hour on the chart', () => {
    expect(toSpendSeries([], NOW)).toHaveLength(12);
  });

  it('buckets payments into the hour they landed in', () => {
    const series = toSpendSeries(
      [eventAt(5, '1.5'), eventAt(10, '2.5'), eventAt(70, '4')],
      NOW,
    );
    const last = series[series.length - 1];
    expect(last).toMatchObject({ time: '12:00', spend: 4, ops: 2 });
    // 70 minutes ago is 10:50, which falls in the previous bucket.
    expect(series[series.length - 2]).toMatchObject({ time: '11:00', spend: 4, ops: 1 });
  });

  it('drops payments outside the window instead of piling them into an edge bucket', () => {
    const series = toSpendSeries([eventAt(60 * 30, '99'), eventAt(5, '1')], NOW);
    expect(series[series.length - 1]).toMatchObject({ spend: 1, ops: 1 });
    expect(series.slice(0, -1).every((point) => point.spend === 0)).toBe(true);
  });

  it('labels buckets by wall-clock hour and wraps past midnight', () => {
    const midnight = Date.parse('2026-09-29T00:30:00.000Z');
    const series = toSpendSeries([], midnight);
    expect(series[series.length - 1].time).toBe('00:00');
    expect(series[0].time).toBe('13:00'); // 12 hours earlier
  });

  it('ignores an event with an unparseable timestamp', () => {
    const broken: PaymentEvent = { ...eventAt(5, '1'), ledgerClosedAt: 'not-a-date' };
    expect(toSpendSeries([broken], NOW).every((point) => point.spend === 0)).toBe(true);
  });
});

describe('secondsUntilPeriodReset', () => {
  it("mirrors PaymentChannel.pay's own reset rule", () => {
    // 720 ledgers per hour, window started at 52_241_800, now 52_241_900.
    expect(secondsUntilPeriodReset(channel(), 52_241_900, 5)).toBe((720 - 100) * 5);
  });

  it('is 0 once the window has already rolled over', () => {
    expect(secondsUntilPeriodReset(channel(), 52_242_600, 5)).toBe(0);
  });
});
