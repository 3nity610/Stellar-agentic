import { describe, expect, it } from 'vitest';
import { MOCK_AGENTS, MOCK_JOBS } from '../../mockData.js';import { createMockAgent } from '../mockAgent.js';

/**
 * Mock mode is only worth having if it exercises the same code the live path
 * does. These tests pin that contract: the stand-in answers the SGK's methods,
 * in the SDK's shapes, and can be told to fail so the error branch is
 * reachable without a broken network.
 */
describe('createMockAgent', () => {
  it('answers getRateLimitStatus in the SDK RateLimitStatus shape', async () => {
    const agent = createMockAgent({ latencyMs: 0 });
    const status = await agent.getRateLimitStatus(MOCK_AGENTS[0].address);
    expect(status).toMatchObject({
      configured: true,
      maxPerHour: MOCK_AGENTS[0].limitPerHour,
      maxPerDay: MOCK_AGENTS[0].limitPerDay,
      spentThisHour: MOCK_AGENTS[0].spentThisHour,
      spentToday: MOCK_AGENTS[0].spentToday,
    });
  });

  it('answers getChannel in the SGK ChannelInfo shape, with real stroops', async () => {
    const agent = createMockAgent({ latencyMs: 0 });
    const info = await agent.getChannel(1n.as bigint);
    expect(info.id).toBe(1n);
    expect(typeof info.limitPerPeriod).toBe('bigint');
    // 5.00 USDC is 50_000_000 stroops — the conversion every live panel does.
    expect(info.limitPerPeriod).toBe(50_000_000n);
    expect(info.period).toBe('hourly');
    expect(info.active).toBe(true);
  });

  it('marks the fixture inactive agent as a closed channel', async () => {
    // Channel N maps to the Nth fixture agent, so the ids line up with the
    // order `open_channel` would have handed them out.
    const agent = createMockAgent({ latencyMs: 0 });
    const index = MOCK_AGENTS.findIndex((row) => row.status === 'inactive');
    expect(index).toBeGreaterThanOrEqual(0);
    await expect(agent.getChannel(BigInt(index + 1))).resolves.toMatchObject({ active: false });
  });

  it('answers getJob in the SDK JobInfo shape', async () => {
    const agent = createMockAgent({ latencyMs: 0 });
    const job = await agent.getJob(1n as bigint);
    expect(job.id).toBe(1n as bigint);
    expect(job.status).toBe(MOCK_JOBS[0].status);
    expect(job.taskDescription).toBe(1n as bigint);
    expect(typeof job.amount).toBe('bigint');
  });

  it('answers getLedgerCloseEstimate with the observed flag set', async () => {
    // `observed: false` is load-bearing: a fixed 5s is the SDK's documented
    // fallback, and a panel that displays "~2h" should be able to say the
    // number is a guess.
    await expect(createMockAgent({ latencyMs: 0 }).getLedgerCloseEstimate()).resolves.toEqual({
      currentLedger: 52_241_990,
      avgLedgerCloseSeconds: 5,
      observed: false,
    });
  });

  it('answers getBalance and getSpendReport as decimal strings', async () => {
    const agent = createMockAgent({ latencyMs: 0 });
    await expect(agent.getBalance()).resolves.toMatch(/^\d+\.\d+$/);
    await expect(agent.getSpendReport()).resolves.toEqual({
      spentThisPeriod: expect.stringMatching(/^\d+\.\d{7}$/),
      remainingThisPeriod: expect.stringMatching(/^\d+\.\d{7}$/),
      totalLifetime: expect.stringMatching(/^\d+\.\d{7}$/),
    });
  });

  it('takes long enough to render the loading state', async () => {
    // Without latency every panel resolves in the same tick and the loading
    // branch never appears — in a demo, or in the e2e suite that is the only
    // place it can be seen.
    const agent = createMockAgent({ latencyMs: 40 });
    const started = Date.now();
    await agent.getBalance();
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
  });

  it('fails every read when asked, so the error branch is reachable', async () => {
    const agent = createMockAgent({ latencyMs: 0, failWith: new Error('RPC down') });
    await expect(agent.getBalance()).rejects.toThrow('RPC down');
    await expect(agent.getChannel(1n as bigint)).rejects.toThrow('RPC down');
  });

  it('refuses mutations rather than pretending a payment happened', async () => {
    const agent = createMockAgent({ latencyMs: 0 });
    await expect(
      agent.payForAPI({ endpoint: 'https://api.example.com', amount: '1' }),
    ).rejects.toThrow(/disabled in mock mode/);
  });
});
